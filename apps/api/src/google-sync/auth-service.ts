import { createHash, randomBytes } from 'node:crypto';
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createUlid, googleConnectionSchema, type GoogleConnection } from '@naaseh/domain';
import { z } from 'zod';
import {
  exchangeGoogleAuthorizationCode,
  GoogleTasksClient,
  refreshGoogleAccessToken,
  revokeGoogleToken,
} from './google-client.js';
import {
  consumeGoogleOAuthState,
  findGoogleConnection,
  putGoogleOAuthState,
  saveGoogleConnection,
} from './repository.js';

const scope = 'https://www.googleapis.com/auth/tasks' as const;
const secretSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.string().url(),
  })
  .strict();

type KmsSender = Pick<KMSClient, 'send'>;
type SecretSender = Pick<SecretsManagerClient, 'send'>;

const base64url = (value: Uint8Array) => Buffer.from(value).toString('base64url');
export const hashGoogleOAuthState = (state: string) =>
  createHash('sha256').update(state).digest('hex');
export const googleTokenEncryptionContext = (userId: string, connectionId: string) => ({
  purpose: 'google-tasks-refresh-token',
  userId,
  connectionId,
});

async function loadOAuthSecret(client: SecretSender = new SecretsManagerClient({})) {
  const secretId = process.env.GOOGLE_OAUTH_SECRET_ID;
  if (!secretId) throw new Error('Google OAuth secret is not configured.');
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!result.SecretString) throw new Error('Google OAuth secret has no string value.');
  return secretSchema.parse(JSON.parse(result.SecretString));
}

export async function encryptGoogleRefreshToken(
  refreshToken: string,
  userId: string,
  connectionId: string,
  client: KmsSender = new KMSClient({}),
) {
  const keyId = process.env.NAASEH_DATA_KMS_KEY_ARN;
  if (!keyId) throw new Error('Google token encryption key is not configured.');
  const result = await client.send(
    new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from(refreshToken, 'utf8'),
      EncryptionContext: googleTokenEncryptionContext(userId, connectionId),
    }),
  );
  if (!result.CiphertextBlob) throw new Error('Google refresh token encryption failed.');
  return Buffer.from(result.CiphertextBlob).toString('base64');
}

export async function decryptGoogleRefreshToken(
  connection: Pick<GoogleConnection, 'id' | 'userId' | 'encryptedRefreshToken'>,
  client: KmsSender = new KMSClient({}),
) {
  if (!connection.encryptedRefreshToken) throw new Error('Google refresh token is unavailable.');
  const result = await client.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(connection.encryptedRefreshToken, 'base64'),
      EncryptionContext: googleTokenEncryptionContext(connection.userId, connection.id),
    }),
  );
  if (!result.Plaintext) throw new Error('Google refresh token decryption failed.');
  return Buffer.from(result.Plaintext).toString('utf8');
}

export async function startGoogleAuthorization(input: {
  userId: string;
  sessionHash: string;
  defaultTimeZone: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const secret = await loadOAuthSecret();
  const state = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const expiresAt = Math.floor(now.getTime() / 1000) + 600;
  await putGoogleOAuthState(hashGoogleOAuthState(state), {
    userId: input.userId,
    sessionHash: input.sessionHash,
    redirectUri: secret.redirectUri,
    codeVerifier,
    issuedAt: now.toISOString(),
    expiresAt,
  });
  const current = await findGoogleConnection(input.userId);
  const connection = googleConnectionSchema.parse({
    id: current?.id ?? createUlid(now.getTime()),
    userId: input.userId,
    state: 'connecting',
    defaultLocalTime: current?.defaultLocalTime ?? '09:00',
    defaultTimeZone: input.defaultTimeZone,
    privateTaskMode: 'exclude',
    syncIntervalMinutes: 5,
    overlapMinutes: 5,
    pendingCount: current?.pendingCount ?? 0,
    conflictCount: current?.conflictCount ?? 0,
    quarantineCount: current?.quarantineCount ?? 0,
    skippedUndatedCount: current?.skippedUndatedCount ?? 0,
    version: (current?.version ?? 0) + 1,
    createdAt: current?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await saveGoogleConnection(connection, current?.version);
  const params = new URLSearchParams({
    client_id: secret.clientId,
    redirect_uri: secret.redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return {
    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export async function completeGoogleAuthorization(input: {
  userId: string;
  sessionHash: string;
  state: string;
  code: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const saved = await consumeGoogleOAuthState(
    hashGoogleOAuthState(input.state),
    Math.floor(now.getTime() / 1000),
  );
  if (!saved || saved.userId !== input.userId || saved.sessionHash !== input.sessionHash)
    throw new Error('Google authorization state is invalid or expired.');
  const secret = await loadOAuthSecret();
  if (secret.redirectUri !== saved.redirectUri) throw new Error('Google redirect URI changed.');
  const token = await exchangeGoogleAuthorizationCode({
    clientId: secret.clientId,
    clientSecret: secret.clientSecret,
    code: input.code,
    codeVerifier: saved.codeVerifier,
    redirectUri: saved.redirectUri,
  });
  if (!token.refresh_token) throw new Error('Google did not return offline access. Reconnect.');
  if (token.scope && !token.scope.split(' ').includes(scope))
    throw new Error('Google Tasks permission was not granted.');
  const current = await findGoogleConnection(input.userId);
  if (!current || current.state !== 'connecting')
    throw new Error('Google connection is not pending.');
  const encryptedRefreshToken = await encryptGoogleRefreshToken(
    token.refresh_token,
    input.userId,
    current.id,
  );
  const next = googleConnectionSchema.parse({
    ...current,
    state: 'preview',
    encryptedRefreshToken,
    tokenKeyVersion: process.env.NAASEH_DATA_KMS_KEY_ARN ?? 'configured-key',
    scope,
    version: current.version + 1,
    updatedAt: now.toISOString(),
  });
  return saveGoogleConnection(next, current.version);
}

export async function googleClientForConnection(connection: GoogleConnection) {
  const refreshToken = await decryptGoogleRefreshToken(connection);
  const secret = await loadOAuthSecret();
  const token = await refreshGoogleAccessToken({
    clientId: secret.clientId,
    clientSecret: secret.clientSecret,
    refreshToken,
  });
  return new GoogleTasksClient(token.access_token);
}

export async function revokeGoogleConnectionToken(connection: GoogleConnection) {
  const refreshToken = await decryptGoogleRefreshToken(connection);
  await revokeGoogleToken(refreshToken);
}
