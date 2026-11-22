import { createLogger } from '@naaseh/observability';
import {
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  imageCandidateInputSchema,
  imageGenerationSchema,
  imageReadChunk,
  workspaceGenerationHeader,
} from '@naaseh/contacts-inventory-contracts';
import { bodyJson } from './contacts.js';
import type { DynamoWorkspaceStore, ImageCandidate } from './dynamo-store.js';
import { matchesImageSignature, scanState } from './scan-results.js';

const log = createLogger(process.env, { verbose: false });
const media = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' });
const uuid = z.uuid();
const keyFor = (itemId: string, id: string) => `candidates/${itemId}/${id}`;
const expiresAfter = 15 * 60_000;
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { ...noStore, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function itemImageRoute(path: string) {
  return path.match(/^items\/([^/]+)\/image(?:\/candidates(?:\/([^/]+)(\/confirm)?)?)?$/u);
}

export function imageRange(range: string | undefined, bytes: number) {
  if (range === undefined) return { start: 0, end: Math.min(bytes, imageReadChunk) - 1 };
  const parts = /^bytes=(\d+)-(\d+)$/u.exec(range);
  if (!parts) return;
  const start = Number(parts[1]);
  const end = Math.min(Number(parts[2]), bytes - 1);
  if (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    end >= start &&
    end - start < imageReadChunk
  )
    return { start, end };
}

async function candidateStatus(
  store: DynamoWorkspaceStore,
  bucket: string,
  itemId: string,
  candidate: ImageCandidate,
) {
  const item = await store.record({ kind: 'item', id: itemId });
  if (!item || 'deleted' in item) return json(404, { code: 'item_unavailable' });
  const currentGeneration = (await store.checkpoint()).generation;
  if (currentGeneration !== candidate.workspaceGeneration)
    return json(409, { code: 'reset_required' });
  if (item.image?.id === candidate.id) return json(200, { state: 'active', image: item.image });
  if ((item.imageGeneration ?? 0) !== candidate.imageGeneration)
    return json(409, { state: 'failed', code: 'image_changed' });
  if (Date.now() - candidate.createdAt > expiresAfter)
    return json(200, { state: 'failed', code: 'scan_timeout' });
  if (!candidate.version) return json(202, { state: 'pending_upload' });
  const result = await media.send(
    new GetObjectTaggingCommand({
      Bucket: bucket,
      Key: keyFor(itemId, candidate.id),
      VersionId: candidate.version,
    }),
  );
  const scan = scanState(
    result.TagSet?.find(({ Key }) => Key === 'GuardDutyMalwareScanStatus')?.Value,
  );
  if (scan === 'pending') {
    log.metric(
      'ContactsInventoryScanAgeSeconds',
      Math.round((Date.now() - candidate.createdAt) / 1000),
      'Seconds',
    );
    return json(202, { state: 'scanning' });
  }
  if (scan === 'rejected') return json(200, { state: 'failed', code: 'scan_rejected' });

  return activateConfirmedImage(store, itemId, candidate);
}

async function activateConfirmedImage(
  store: DynamoWorkspaceStore,
  itemId: string,
  candidate: ImageCandidate,
) {
  const image = { id: candidate.id, mediaType: candidate.mediaType, bytes: candidate.bytes };
  const activated = await store.changeImage(
    itemId,
    candidate.workspaceGeneration,
    candidate.imageGeneration,
    image,
  );
  if (!activated) {
    const updated = await store.record({ kind: 'item', id: itemId });
    if (!updated || 'deleted' in updated || updated.image?.id !== image.id)
      return json(409, { state: 'failed', code: 'image_changed' });
  }
  return json(200, { state: 'active', image });
}

export async function reconcileInventoryScan(
  store: DynamoWorkspaceStore,
  itemId: string,
  id: string,
  version: string,
  status: string,
) {
  const candidate = await store.imageCandidate(itemId, id);
  if (!candidate || candidate.version !== version) return;
  const age = Date.now() - candidate.createdAt;
  log.metric('ContactsInventoryScanAgeSeconds', Math.round(age / 1000), 'Seconds');
  if (age > expiresAfter) {
    log.metric('ContactsInventoryReconciliationBacklog', 1);
    return;
  }
  if (scanState(status) === 'clean') await activateConfirmedImage(store, itemId, candidate);
}

export async function handleItemImage(
  store: DynamoWorkspaceStore,
  bucket: string,
  path: string,
  event: APIGatewayProxyEventV2,
) {
  const route = itemImageRoute(path);
  const parsedId = uuid.safeParse(route?.[1]);
  if (!parsedId.success) return json(404, { code: 'item_unavailable' });
  const itemId = parsedId.data.toLowerCase();
  const item = await store.record({ kind: 'item', id: itemId });
  if (!item || 'deleted' in item) return json(404, { code: 'item_unavailable' });
  const method = event.requestContext.http.method;
  const activeGeneration = item.imageGeneration ?? 0;

  if (method === 'GET' && path.endsWith('/image')) {
    if (!item.image) return json(404, { code: 'image_unavailable' });
    const { id, bytes, mediaType } = item.image;
    const etag = `"${activeGeneration}-${id}"`;
    if (event.headers['if-match'] !== undefined && event.headers['if-match'] !== etag)
      return json(412, { code: 'image_changed' });
    const range = imageRange(event.headers.range, bytes);
    if (!range || (range.start > 0 && event.headers['if-match'] !== etag))
      return {
        statusCode: 416,
        headers: { ...noStore, 'Content-Range': `bytes */${bytes}` },
      };
    const candidate = await store.imageCandidate(itemId, id);
    if (!candidate?.version) return json(404, { code: 'image_unavailable' });
    const result = await media.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: keyFor(itemId, id),
        VersionId: candidate.version,
        Range: `bytes=${range.start}-${range.end}`,
      }),
    );
    const content = await result.Body?.transformToByteArray();
    if (!content || content.length !== range.end - range.start + 1)
      return json(503, { code: 'image_unavailable' });
    const latest = await store.record({ kind: 'item', id: itemId });
    if (
      !latest ||
      'deleted' in latest ||
      latest.image?.id !== id ||
      latest.imageGeneration !== activeGeneration
    )
      return json(412, { code: 'image_changed' });
    const whole = range.start === 0 && content.length === bytes && !event.headers.range;
    return {
      statusCode: whole ? 200 : 206,
      isBase64Encoded: true,
      headers: {
        ...noStore,
        'Content-Type': mediaType,
        'Content-Length': String(content.length),
        'Accept-Ranges': 'bytes',
        ETag: etag,
        ...(whole ? {} : { 'Content-Range': `bytes ${range.start}-${range.end}/${bytes}` }),
      },
      body: Buffer.from(content).toString('base64'),
    };
  }

  const candidateId = uuid.safeParse(route?.[2]);
  if (candidateId.success && (method === 'GET' || (method === 'POST' && route?.[3]))) {
    const candidate = await store.imageCandidate(itemId, candidateId.data.toLowerCase());
    if (!candidate) return json(404, { code: 'candidate_unavailable' });
    if (method === 'GET' || candidate.version)
      return candidateStatus(store, bucket, itemId, candidate);
    const confirmation = z
      .strictObject({ version: z.string().min(1).max(1024) })
      .safeParse(bodyJson(event));
    if (!confirmation.success || confirmation.data.version === 'null')
      return json(400, { code: 'invalid_upload_version' });
    if (
      (await store.checkpoint()).generation !== candidate.workspaceGeneration ||
      candidate.imageGeneration !== activeGeneration ||
      Date.now() - candidate.createdAt > expiresAfter
    )
      return json(409, { code: 'image_changed' });
    const { version } = confirmation.data;
    const Key = keyFor(itemId, candidate.id);
    const object = await media.send(
      new HeadObjectCommand({ Bucket: bucket, Key, VersionId: version }),
    );
    if (
      object.ContentLength !== candidate.bytes ||
      object.ContentType !== candidate.mediaType ||
      object.VersionId !== version
    )
      return json(400, { code: 'invalid_image' });
    const part = await media.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key,
        VersionId: version,
        Range: `bytes=0-${Math.min(7, candidate.bytes - 1)}`,
      }),
    );
    const bytes = await part.Body?.transformToByteArray();
    if (!bytes || !matchesImageSignature(candidate.mediaType, bytes))
      return json(400, { code: 'invalid_image' });
    if (!(await store.confirmImageVersion(itemId, candidate, version)))
      return json(409, { code: 'image_changed' });
    return candidateStatus(store, bucket, itemId, { ...candidate, version });
  }

  const generationHeader = event.headers[workspaceGenerationHeader];
  const workspaceGeneration = Number(generationHeader);
  if (
    !generationHeader ||
    !/^[1-9]\d*$/u.test(generationHeader) ||
    !Number.isSafeInteger(workspaceGeneration)
  )
    return json(400, { code: 'invalid_generation' });
  if ((await store.checkpoint()).generation !== workspaceGeneration)
    return json(409, { code: 'reset_required' });
  if (method === 'DELETE' && path.endsWith('/image')) {
    const input = z
      .strictObject({ imageGeneration: imageGenerationSchema })
      .safeParse(bodyJson(event));
    if (!input.success) return json(400, { code: 'invalid_generation' });
    const removed = await store.changeImage(
      itemId,
      workspaceGeneration,
      input.data.imageGeneration,
    );
    return removed
      ? json(200, { imageGeneration: input.data.imageGeneration + 1 })
      : json(409, { code: 'image_changed' });
  }
  if (method !== 'POST' || !path.endsWith('/candidates'))
    return json(404, { code: 'route_unavailable' });
  const input = imageCandidateInputSchema.safeParse(bodyJson(event));
  if (!input.success) return json(400, { code: 'invalid_image' });
  const { id, mediaType, bytes, imageGeneration } = input.data;
  if (imageGeneration !== activeGeneration) return json(409, { code: 'image_changed' });
  const candidate = await store.reserveImageCandidate(itemId, {
    id: id.toLowerCase(),
    mediaType,
    bytes,
    workspaceGeneration,
    imageGeneration,
    createdAt: Date.now(),
  });
  if (
    !candidate ||
    candidate.mediaType !== mediaType ||
    candidate.bytes !== bytes ||
    candidate.imageGeneration !== imageGeneration ||
    candidate.workspaceGeneration !== workspaceGeneration ||
    candidate.version ||
    Date.now() - candidate.createdAt > expiresAfter
  )
    return json(409, { code: 'candidate_unavailable' });
  const uploadUrl = await getSignedUrl(
    media,
    new PutObjectCommand({
      Bucket: bucket,
      Key: keyFor(itemId, candidate.id),
      ContentType: mediaType,
      ContentLength: bytes,
      IfNoneMatch: '*',
    }),
    {
      expiresIn: 300,
      signableHeaders: new Set(['content-length', 'content-type', 'if-none-match']),
    },
  );
  return json(201, { state: 'pending_upload', id: candidate.id, uploadUrl });
}
