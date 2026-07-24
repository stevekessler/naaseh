export { handler as pushHandler } from './handler.js';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { json, problem } from '../shared/http.js';
import { pullAudience } from './change-feed-repository.js';
export const pullHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const actor = (event.requestContext as any).authorizer?.lambda?.userId;
  if (!actor)
    return problem(401, 'unauthorized', 'Authentication required.', event.requestContext.requestId);
  const body = JSON.parse(event.body ?? '{}');
  const publicAfter = Number(body.cursor?.public ?? 0);
  const ownerAfter = Number(body.cursor?.owner ?? 0);
  const [publicChanges, ownerChanges] = await Promise.all([
    pullAudience('PUBLIC', publicAfter),
    pullAudience(`OWNER#${actor}`, ownerAfter),
  ]);
  return json(200, {
    changes: [...publicChanges, ...ownerChanges],
    cursor: {
      public: publicChanges.at(-1)?.sequence ?? publicAfter,
      owner: ownerChanges.at(-1)?.sequence ?? ownerAfter,
    },
  });
};
