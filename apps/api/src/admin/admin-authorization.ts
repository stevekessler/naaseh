export type AdminClaims = { userId?: string; role?: string; csrfToken?: string };

export function requireAdminMutation(claims: AdminClaims): asserts claims is AdminClaims & {
  userId: string;
  role: 'admin';
} {
  if (!claims.userId || claims.role !== 'admin')
    throw Object.assign(new Error('Administrator access required.'), { statusCode: 403 });
}
