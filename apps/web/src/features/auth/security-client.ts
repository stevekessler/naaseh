export type AuthenticatedSession = {
  userId: string;
  displayName: string;
  csrfToken: string;
  role: 'admin' | 'user';
};

async function noStoreRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init.headers },
  });
  if (!response.ok) throw new Error('The security request could not be completed.');
  return response.json() as Promise<T>;
}

export const submitTfaChallenge = (method: 'totp' | 'recovery_code', code: string) =>
  noStoreRequest<{
    user: { id: string; displayName: string; role: 'admin' | 'user' };
    csrfToken: string;
  }>('/api/v1/auth/tfa/challenge', { method: 'POST', body: JSON.stringify({ method, code }) });

export const startTfaEnrollment = () =>
  noStoreRequest<{ secret: string; otpauthUri: string }>('/api/v1/auth/tfa/enrollment', {
    method: 'GET',
  });

export const confirmTfaEnrollment = (code: string) =>
  noStoreRequest<{
    user: { id: string; displayName: string; role: 'admin' | 'user' };
    csrfToken: string;
    recoveryCodes: string[];
  }>('/api/v1/auth/tfa/enrollment/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

export const resetPassword = (request: {
  username: string;
  pin: string;
  newPassword: string;
  confirmPassword: string;
}) =>
  noStoreRequest<{ message: string }>('/api/v1/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify(request),
  });

export const readProfileSecurity = (csrfToken: string) =>
  noStoreRequest<{
    tfaStatus: 'disabled' | 'enrollment_required' | 'enabled' | 'recovery_required';
    enrolledAt?: string | null;
    recoveryCodesRemaining: number;
  }>('/api/v1/profile/security', {
    method: 'GET',
    headers: { 'x-csrf-token': csrfToken },
  });

export type FactorProof = {
  password: string;
  method: 'totp' | 'recovery_code';
  code: string;
};

export const requestTfaEnrollment = (csrfToken: string, password: string) =>
  noStoreRequest<{ next: 'sign_in_to_enroll' }>('/api/v1/profile/security/tfa/enrollment', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
    body: JSON.stringify({ password }),
  });

export const rotateRecoveryCodes = (csrfToken: string, proof: FactorProof) =>
  noStoreRequest<{ recoveryCodes: string[]; csrfToken: string }>(
    '/api/v1/profile/security/recovery-codes',
    {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify(proof),
    },
  );

export const disableTfa = (csrfToken: string, proof: FactorProof) =>
  noStoreRequest<{ csrfToken: string }>('/api/v1/profile/security/tfa', {
    method: 'DELETE',
    headers: { 'x-csrf-token': csrfToken },
    body: JSON.stringify(proof),
  });

export const changePassword = (
  csrfToken: string,
  request: FactorProof & { newPassword: string; confirmPassword: string },
) =>
  noStoreRequest<{ csrfToken: string }>('/api/v1/profile/security/password', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
    body: JSON.stringify(request),
  });
