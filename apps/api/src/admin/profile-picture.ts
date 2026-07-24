import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5_000_000;
const s3 = new S3Client({});

export function validatePicture(contentType: string, bytes: number) {
  if (!allowed.has(contentType) || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_BYTES)
    throw new Error('Profile picture must be JPEG, PNG, or WebP and no larger than 5 MB.');
  return true;
}

export function validatePictureSignature(contentType: string, bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .slice(0, 8)
    .every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  const webp =
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (
    (contentType === 'image/jpeg' && !jpeg) ||
    (contentType === 'image/png' && !png) ||
    (contentType === 'image/webp' && !webp)
  )
    throw new Error('Profile picture content does not match its declared type.');
  return true;
}

export function profilePictureKey(userId: string, uploadId = randomUUID()) {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error('Invalid user identifier.');
  return `profiles/${userId}/original/${uploadId}`;
}

export const profilePictureVariantKey = (userId: string, uploadId: string, size: 64 | 128 | 256) =>
  `profiles/${userId}/processed/${uploadId}-${size}.webp`;

export async function createProfilePictureUpload(input: {
  userId: string;
  contentType: string;
  contentLength: number;
  bucket?: string;
}) {
  validatePicture(input.contentType, input.contentLength);
  const bucket = input.bucket ?? process.env.PROFILE_MEDIA_BUCKET;
  if (!bucket) throw new Error('Profile media is not configured.');
  const objectKey = profilePictureKey(input.userId);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ServerSideEncryption: 'aws:kms',
      Metadata: { owner: input.userId, processing: 'pending' },
    }),
    { expiresIn: 300 },
  );
  return {
    objectKey,
    uploadUrl,
    expiresInSeconds: 300,
    headers: {
      'content-type': input.contentType,
      'content-length': String(input.contentLength),
      'x-amz-server-side-encryption': 'aws:kms',
    },
  };
}

export async function createProfilePictureReadUrl(objectKey: string, bucket?: string) {
  const mediaBucket = bucket ?? process.env.PROFILE_MEDIA_BUCKET;
  if (
    !mediaBucket ||
    !/^profiles\/[A-Za-z0-9_-]+\/processed\/[A-Za-z0-9_-]+-(64|128|256)\.webp$/.test(objectKey)
  )
    throw new Error('Profile picture is unavailable.');
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: mediaBucket, Key: objectKey }), {
    expiresIn: 300,
  });
}
