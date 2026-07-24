import type { S3Handler } from 'aws-lambda';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  profilePictureVariantKey,
  validatePicture,
  validatePictureSignature,
} from './profile-picture.js';

const s3 = new S3Client({});
const sizes = [64, 128, 256] as const;

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replaceAll('+', ' '));
    const match = key.match(/^profiles\/([A-Za-z0-9_-]+)\/original\/([A-Za-z0-9-]+)$/);
    if (!match) continue;
    const [, userId, uploadId] = match;
    if (!userId || !uploadId) continue;
    const source = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = new Uint8Array(await source.Body!.transformToByteArray());
    const contentType = source.ContentType ?? '';
    validatePicture(contentType, bytes.byteLength);
    validatePictureSignature(contentType, bytes);
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 8_000 || metadata.height > 8_000)
      throw new Error('Profile picture dimensions are invalid.');

    await Promise.all(
      sizes.map(async (size) => {
        const output = await image
          .clone()
          .resize(size, size, { fit: 'cover', position: 'attention', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: profilePictureVariantKey(userId, uploadId, size),
            Body: output,
            ContentType: 'image/webp',
            CacheControl: 'private, max-age=300',
            ServerSideEncryption: 'aws:kms',
            Metadata: { owner: userId, sourceUpload: uploadId },
          }),
        );
      }),
    );
    const pictureKey = profilePictureVariantKey(userId, uploadId, 128);
    await dynamodb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET #data.pictureKey = :pictureKey',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#data': 'data' },
        ExpressionAttributeValues: { ':pictureKey': pictureKey },
      }),
    );
    // The untrusted original is retained only until safe variants and the user pointer commit.
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
};
