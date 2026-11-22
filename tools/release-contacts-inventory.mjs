import { error as logError } from 'node:console';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import {
  apiProtocol,
  artifactPrefix,
  hostProtocol,
  manifestPath,
  parseReleaseManifest,
  releaseIdSchema,
} from '../packages/contacts-inventory-contracts/src/host.ts';

async function listAssets(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const entriesByName = entries.sort((a, b) => a.name.localeCompare(b.name));
  const assets = [];
  for (const entry of entriesByName) {
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      assets.push(...(await listAssets(join(directory, entry.name), relative + '/')));
    else if (entry.isFile()) assets.push(relative);
    else throw new Error('The release build must contain only regular files and directories.');
  }
  return assets;
}

export async function buildReleaseManifest(releaseId, assetDirectory) {
  const version = releaseIdSchema.parse(releaseId);
  const prefix = artifactPrefix(version);
  const assets = await listAssets(assetDirectory);
  const manifest = parseReleaseManifest({
    releaseId: version,
    hostProtocol,
    apiProtocol,
    entry: prefix + 'entry.js',
    assets: assets.map((asset) => prefix + asset),
  });
  if (!manifest)
    throw new Error('The build does not contain a valid immutable feature entry and asset list.');
  return manifest;
}

const pointer = manifestPath.slice(1);
const jsonType = 'application/json; charset=utf-8';
const contentTypes = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: jsonType,
  svg: 'image/svg+xml',
  png: 'image/png',
  woff2: 'font/woff2',
};

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('base64');
}

function archivedManifest(version) {
  return `${artifactPrefix(version).slice(1)}.manifest.json`;
}

export async function switchRelease({ objects, bucket, manifest, verify, expectedRelease }) {
  let etag;
  let before = null;
  try {
    const active = await objects.send(new GetObjectCommand({ Bucket: bucket, Key: pointer }));
    etag = active.ETag;
    if (!etag) throw new Error('The active release has no version validator.');
    before = JSON.parse(await active.Body.transformToString());
    if (!(before?.inactive === true || parseReleaseManifest(before)))
      throw new Error('The active manifest is malformed. Repair it before switching releases.');
  } catch (error) {
    if (error.name !== 'NoSuchKey') throw error;
  }
  if ((parseReleaseManifest(before)?.releaseId ?? 'inactive') !== expectedRelease)
    throw new Error('The active release changed. Check it before retrying.');
  if (manifest) await verify(manifest);
  await objects.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pointer,
      Body: JSON.stringify(manifest ?? { inactive: true }),
      ContentType: jsonType,
      CacheControl: 'no-store',
      ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
    }),
  );
}

async function putImmutable(objects, bucket, key, bytes, type) {
  const checksum = digest(bytes);
  try {
    await objects.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: type,
        CacheControl: 'public, max-age=31536000, immutable',
        ChecksumSHA256: checksum,
        IfNoneMatch: '*',
      }),
    );
  } catch (error) {
    if (error.name !== 'PreconditionFailed') throw error;
    const current = await objects.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (
      current.ContentType !== type ||
      digest(await current.Body.transformToByteArray()) !== checksum
    )
      throw new Error('The release already contains different immutable artifacts.');
  }
}

export function permitsInventoryImages(policy, mediaOrigin) {
  const directives = policy.split(';').map((directive) => directive.trim().split(/\s+/u));
  return (
    directives
      .find(([name]) => name === 'connect-src')
      ?.slice(1)
      .includes(mediaOrigin) === true &&
    directives
      .find(([name]) => name === 'img-src')
      ?.slice(1)
      .includes('blob:') === true
  );
}

async function verifyHosted(manifest, origin, cookie, mediaOrigin) {
  const api = `${origin}/api/v1/contacts-inventory/releases/${manifest.releaseId}/release/readiness`;
  const fetchRelease = (url, headers) =>
    globalThis.fetch(url, {
      headers,
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(15_000),
    });
  const host = await fetchRelease(origin);
  const policy = host.headers.get('content-security-policy') ?? '';
  await host.body?.cancel();
  if (!host.ok || !permitsInventoryImages(policy, mediaOrigin))
    throw new Error(
      'The web host does not allow Contacts and Inventory image uploads and previews.',
    );
  const anonymous = await fetchRelease(api);
  if (![401, 403].includes(anonymous.status))
    throw new Error('Anonymous API access was not denied.');
  const ready = await fetchRelease(api, { Cookie: cookie });
  const confirmation = ready.ok ? await ready.json() : null;
  if (confirmation?.releaseId !== manifest.releaseId || confirmation.ready !== true)
    throw new Error('The authenticated release readiness probe failed.');
  for (const path of manifest.assets) {
    const response = await fetchRelease(origin + path);
    const type = contentTypes[path.split('.').at(-1)] ?? 'application/octet-stream';
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== type.split(';')[0])
      throw new Error(
        'A published release asset was unavailable or returned an unexpected content type.',
      );
    await response.body?.cancel();
  }
}

async function release(args) {
  const [operation, version, assets] = args;
  const bucket = process.env.FEATURE_ARTIFACT_BUCKET;
  const origin = process.env.FEATURE_WEB_ORIGIN;
  const expectedRelease = process.env.EXPECTED_RELEASE;
  const cookie = process.env.FEATURE_SMOKE_COOKIE;
  if (
    !bucket ||
    !origin ||
    new URL(origin).origin !== origin ||
    !origin.startsWith('https://') ||
    (expectedRelease !== 'inactive' && !releaseIdSchema.safeParse(expectedRelease).success)
  )
    throw new Error('Configure the protected deployment environment and expected current release.');
  const objects = new S3Client({});
  if (operation === 'withdraw') {
    await switchRelease({ objects, bucket, expectedRelease, manifest: null });
    return;
  }
  if (!cookie) throw new Error('A current workspace canary session is required.');
  const mediaOrigin = process.env.FEATURE_MEDIA_ORIGIN;
  if (
    !mediaOrigin ||
    new URL(mediaOrigin).origin !== mediaOrigin ||
    !mediaOrigin.startsWith('https://')
  )
    throw new Error('Set the exact HTTPS origin from the Contacts and Inventory data stack.');
  releaseIdSchema.parse(version);
  let manifest;
  if (operation === 'publish') {
    manifest = await buildReleaseManifest(version, assets);
    const entry = await import(pathToFileURL(resolve(assets, 'entry.js')).href);
    if (entry.protocol !== hostProtocol || typeof entry.mount !== 'function')
      throw new Error('The release entry does not implement the host module contract.');
    const prefix = artifactPrefix(version);
    for (const path of manifest.assets) {
      const bytes = await readFile(resolve(assets, path.slice(prefix.length)));
      const type = contentTypes[path.split('.').at(-1)] ?? 'application/octet-stream';
      await putImmutable(objects, bucket, path.slice(1), bytes, type);
    }
    await putImmutable(
      objects,
      bucket,
      archivedManifest(version),
      JSON.stringify(manifest),
      jsonType,
    );
  } else {
    const stored = await objects.send(
      new GetObjectCommand({ Bucket: bucket, Key: archivedManifest(version) }),
    );
    manifest = parseReleaseManifest(JSON.parse(await stored.Body.transformToString()));
    if (manifest?.releaseId !== version)
      throw new Error('The retained release manifest is invalid.');
  }
  await switchRelease({
    objects,
    bucket,
    manifest,
    expectedRelease,
    verify: (candidate) => verifyHosted(candidate, origin, cookie, mediaOrigin),
  });
}

async function main(args) {
  const [command, releaseId, assetDirectory, output] = args;
  if (
    (command === 'withdraw' && args.length === 1) ||
    (command === 'activate' && args.length === 2) ||
    (command === 'publish' && args.length === 3)
  ) {
    await release(args);
    return;
  }
  if (command !== 'pack' || !releaseId || !assetDirectory || !output || args.length !== 4)
    throw new Error('Usage: release-contacts-inventory.mjs pack RELEASE_ID ASSETS_DIR OUTPUT_DIR');
  const inputRoot = resolve(assetDirectory);
  const outputRoot = resolve(output);
  if (outputRoot === inputRoot || outputRoot.startsWith(inputRoot + '/'))
    throw new Error('Write release metadata outside the immutable assets directory.');
  const manifest = await buildReleaseManifest(releaseId, inputRoot);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, 'release.json'), JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    logError(error instanceof Error ? error.message : 'Failed to package Contacts and Inventory.');
    process.exitCode = 1;
  });
}
