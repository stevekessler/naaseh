import { createPrivateKey, sign } from 'node:crypto';
import * as http2 from 'node:http2';
import type { StoredNativeInstallation } from './native-installation.js';

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export interface APNSCredentials {
  teamId: string;
  keyId: string;
  privateKey: string;
  topic: 'link.thepandas.naaseh' | 'link.thepandas.naaseh.macos';
  environment: 'sandbox' | 'production';
}

export function createAPNSProviderToken(
  credentials: Pick<APNSCredentials, 'teamId' | 'keyId' | 'privateKey'>,
  issuedAt = Math.floor(Date.now() / 1000),
) {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: credentials.keyId }));
  const claims = base64url(JSON.stringify({ iss: credentials.teamId, iat: issuedAt }));
  const signingInput = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(credentials.privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

export function apnsPayload(input: {
  occurrenceId: string;
  taskId: string;
  previewPolicy: 'generic' | 'private';
  title?: string;
}) {
  const body =
    input.previewPolicy === 'private' && input.title ? input.title.slice(0, 300) : 'A task is due.';
  const payload = {
    aps: {
      alert: { title: "Na'aseh reminder", body },
      sound: 'default',
      'thread-id': 'task-reminders',
      category: 'TASK_REMINDER',
    },
    type: 'task-reminder',
    occurrenceId: input.occurrenceId,
    taskId: input.taskId,
  };
  if (Buffer.byteLength(JSON.stringify(payload)) > 4096) throw new Error('APNs payload too large.');
  return payload;
}

export type APNSResponseClass = 'success' | 'retryable' | 'invalid-token' | 'permanent';
export function classifyAPNSResponse(status: number, body: string): APNSResponseClass {
  if (status >= 200 && status < 300) return 'success';
  let reason = '';
  try {
    reason = String((JSON.parse(body) as { reason?: string }).reason ?? '');
  } catch {
    /* bounded provider text only */
  }
  if (status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken')
    return 'invalid-token';
  if (status === 429 || status >= 500) return 'retryable';
  return 'permanent';
}

export class APNSProvider {
  private cached?: { value: string; issuedAt: number };
  constructor(
    private readonly credentials: APNSCredentials,
    private readonly sender?: (
      token: string,
      payload: ReturnType<typeof apnsPayload>,
    ) => Promise<{ status: number; body: string }>,
  ) {}

  providerToken(now = Math.floor(Date.now() / 1000)) {
    if (!this.cached || now - this.cached.issuedAt >= 50 * 60) {
      this.cached = { value: createAPNSProviderToken(this.credentials, now), issuedAt: now };
    }
    return this.cached.value;
  }

  async send(
    installation: StoredNativeInstallation,
    payload: ReturnType<typeof apnsPayload>,
    maximumAttempts = 3,
  ): Promise<APNSResponseClass> {
    if (
      installation.topic !== this.credentials.topic ||
      installation.environment !== this.credentials.environment
    )
      return 'permanent';
    let outcome: APNSResponseClass = 'retryable';
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const response = await (this.sender
        ? this.sender(installation.token, payload)
        : this.request(installation.token, payload));
      outcome = classifyAPNSResponse(response.status, response.body);
      if (outcome !== 'retryable') return outcome;
    }
    return outcome;
  }

  private request(token: string, payload: ReturnType<typeof apnsPayload>) {
    const authority =
      this.credentials.environment === 'production'
        ? 'https://api.push.apple.com'
        : 'https://api.sandbox.push.apple.com';
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const client = http2.connect(authority);
      client.once('error', reject);
      const request = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${this.providerToken()}`,
        'apns-topic': this.credentials.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0,
        body = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      request.on('data', (chunk: string) => {
        if (body.length < 4096) body += chunk;
      });
      request.on('end', () => {
        client.close();
        resolve({ status, body });
      });
      request.on('error', (error) => {
        client.close();
        reject(error);
      });
      request.end(JSON.stringify(payload));
    });
  }
}
