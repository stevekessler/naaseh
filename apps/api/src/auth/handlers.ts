export { handler as loginHandler } from './handler.js';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { json, problem } from '../shared/http.js';
export const sessionHandler: APIGatewayProxyHandlerV2 = async (event) =>
  'authorizer' in event.requestContext
    ? json(200, { authenticated: true })
    : problem(401, 'unauthorized', 'Authentication required.', event.requestContext.requestId);
export const logoutHandler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 204,
  headers: {
    'set-cookie': '__Host-naaseh=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0',
    'cache-control': 'no-store',
  },
});
