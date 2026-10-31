import { z } from 'zod';
import { ulidSchema } from '@naaseh/domain';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

export const financeQueryWorkerEnvelopeSchema = z
  .object({
    kind: z.literal('naaseh.finance.query-worker'),
    userId: z.string().min(1).max(200),
    queryId: ulidSchema,
  })
  .strict();

export async function dispatchFinanceQueryWorker(input: { userId: string; queryId: string }) {
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName) throw new Error('Finance query worker is unavailable.');
  const envelope = financeQueryWorkerEnvelopeSchema.parse({
    kind: 'naaseh.finance.query-worker',
    ...input,
  });
  await new LambdaClient({}).send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: new TextEncoder().encode(JSON.stringify(envelope)),
    }),
  );
}

/** API Gateway wraps user content in body. It can never choose the direct IAM invocation branch. */
export async function dispatchFinanceInvocation<T>(
  event: unknown,
  dependencies: {
    http: (event: unknown) => Promise<T>;
    worker: (input: { userId: string; queryId: string }) => Promise<void>;
  },
): Promise<T | undefined> {
  if (event && typeof event === 'object' && 'requestContext' in event && 'version' in event)
    return dependencies.http(event);
  const envelope = financeQueryWorkerEnvelopeSchema.safeParse(event);
  if (!envelope.success) throw new Error('Invalid Finance invocation envelope.');
  await dependencies.worker({ userId: envelope.data.userId, queryId: envelope.data.queryId });
  return undefined;
}
