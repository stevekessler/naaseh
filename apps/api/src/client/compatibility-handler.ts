import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { log, metric } from '@naaseh/observability';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import {
  evaluateCompatibility,
  nativeCompatibilityConfigurationFromEnvironment,
  parseNativeClientHeaders,
} from './compatibility.js';
import { parseNativeTelemetryBody, recordNativeTelemetry } from './native-telemetry.js';

const noStoreHeaders = { 'cache-control': 'no-store' };

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  try {
    const client = parseNativeClientHeaders(event.headers);
    if (event.requestContext.http.method === 'GET') {
      const decision = evaluateCompatibility(
        client,
        nativeCompatibilityConfigurationFromEnvironment(),
      );
      return json(200, decision, noStoreHeaders);
    }

    if (event.requestContext.http.method !== 'POST')
      return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);

    const claims = (
      event.requestContext as typeof event.requestContext & {
        authorizer?: { lambda?: { userId?: string; csrfToken?: string } };
      }
    ).authorizer?.lambda;
    if (!claims?.userId)
      return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    requireMutationSecurity(
      event.headers.origin,
      claims.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const encodedBody = event.body ?? '';
    const body = event.isBase64Encoded
      ? Buffer.from(encodedBody, 'base64').toString('utf8')
      : encodedBody;
    const batch = parseNativeTelemetryBody(body);
    for (const diagnostic of batch.events)
      if (
        diagnostic.platform !== client.platform ||
        diagnostic.buildNumber !== client.buildNumber ||
        diagnostic.contractVersion !== client.contractVersion
      )
        throw Object.assign(new Error('Native client headers do not match the telemetry batch.'), {
          statusCode: 400,
          code: 'invalid_request',
        });
    recordNativeTelemetry(batch, { log, metric });
    return { statusCode: 204, headers: noStoreHeaders };
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation:
        event.requestContext.http.method === 'GET'
          ? 'nativeCompatibility'
          : 'nativeTelemetryIngestion',
    });
  }
};
