export interface ApiError {
  code: string;
  message: string;
  correlationId: string;
}
export interface SessionView {
  user: { id: string; username: string; displayName: string; role: 'admin' | 'user' };
  csrfToken: string;
}
export interface PushResult {
  mutationId: string;
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  version?: number;
  error?: ApiError;
}
export * from './openapi.js';
export { enhancedListContractVersion, enhancedListContractVersionSchema } from './openapi.js';
