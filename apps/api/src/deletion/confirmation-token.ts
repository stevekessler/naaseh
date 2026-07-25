import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DeletionPreview } from '@naaseh/domain';

export interface ConfirmationClaims {
  actorId: string;
  resourceType: DeletionPreview['resourceType'];
  resourceId: string;
  targetVersion: number;
  dependencyDigest: string;
  expiresAt: string;
}

const encode = (value: string) => Buffer.from(value).toString('base64url');
const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function issueConfirmationToken(claims: ConfirmationClaims, secret: string) {
  if (secret.length < 16) throw new Error('Deletion confirmation secret is not configured.');
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyConfirmationToken(
  token: string,
  expected: ConfirmationClaims,
  secret: string,
  now = new Date(),
): ConfirmationClaims {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid confirmation token.');
  const actualSignature = sign(payload, secret);
  if (
    signature.length !== actualSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(actualSignature))
  )
    throw new Error('Invalid confirmation token.');
  const claims = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as ConfirmationClaims;
  for (const field of [
    'actorId',
    'resourceType',
    'resourceId',
    'targetVersion',
    'dependencyDigest',
    'expiresAt',
  ] as const)
    if (claims[field] !== expected[field]) throw new Error('Confirmation token does not match.');
  if (Date.parse(claims.expiresAt) <= now.getTime()) throw new Error('Confirmation token expired.');
  return claims;
}
