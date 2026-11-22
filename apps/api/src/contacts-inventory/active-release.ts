import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { manifestPath, parseReleaseManifest } from '@naaseh/contacts-inventory-contracts';

const objects = new S3Client({});

export async function isActiveRelease(bucket: string, releaseId: string) {
  try {
    const { Body } = await objects.send(
      new GetObjectCommand({ Bucket: bucket, Key: manifestPath.slice(1) }),
    );
    const body = await Body?.transformToString();
    if (!body || body.length > 128_000) return false;
    return parseReleaseManifest(JSON.parse(body))?.releaseId === releaseId;
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchKey') return false;
    throw error;
  }
}
