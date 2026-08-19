import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface SessionAuthorizerContext {
  userId?: string;
  role?: 'admin' | 'user';
  csrfToken?: string;
  sessionEpoch?: number;
  groupIds?: string;
}

export function sessionAuthorizerContext(
  event: APIGatewayProxyEventV2,
): SessionAuthorizerContext | undefined {
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: { lambda?: SessionAuthorizerContext };
  };
  return context.authorizer?.lambda;
}
