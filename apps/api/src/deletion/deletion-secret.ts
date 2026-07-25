import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

let cached: string | undefined;
export async function deletionConfirmationSecret() {
  if (cached) return cached;
  if (process.env.DELETION_CONFIRMATION_SECRET) return process.env.DELETION_CONFIRMATION_SECRET;
  const secretId = process.env.DELETION_CONFIRMATION_SECRET_ID;
  if (!secretId) throw new Error('Deletion confirmation is unavailable.');
  const result = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  if (!result.SecretString) throw new Error('Deletion confirmation is unavailable.');
  cached = result.SecretString;
  return cached;
}
