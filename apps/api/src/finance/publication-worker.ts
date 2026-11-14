import {
  emitFinanceExperienceEvent,
  financeExperienceFailureDetails,
  financeExperienceFailureOutcome,
  FinanceExperienceFailure,
  type FinanceExperienceEventInput,
} from './telemetry.js';
import { FinancePublicationOutboxConsumer } from './publication-outbox-consumer.js';
import { financePublicationWorkerEnvelopeSchema } from './publication-invocation.js';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { createUlid } from '@naaseh/domain';

export async function dispatchFinancePublicationWorker(publicationId: string) {
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!name) throw new Error('Finance publication continuation is unavailable.');
  const envelope = financePublicationWorkerEnvelopeSchema.parse({
    kind: 'naaseh.finance.publication-worker',
    publicationId,
  });
  await new LambdaClient({ maxAttempts: 1 }).send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: 'Event',
      Payload: new TextEncoder().encode(JSON.stringify(envelope)),
    }),
    { abortSignal: AbortSignal.timeout(2_000) },
  );
}

export async function executeFinancePublicationWorker(
  input: { publicationId: string },
  options: {
    step?: (id: string) => Promise<{ complete: boolean }>;
    continuation?: (id: string) => Promise<void>;
    remainingMs?: () => number;
    emit?: (event: FinanceExperienceEventInput) => void;
  } = {},
): Promise<void> {
  const { publicationId } = financePublicationWorkerEnvelopeSchema.parse({
    kind: 'naaseh.finance.publication-worker',
    ...input,
  });
  const started = performance.now(),
    correlationId = createUlid();
  const emit = options.emit ?? emitFinanceExperienceEvent;
  const consumer = options.step ? undefined : new FinancePublicationOutboxConsumer();
  const step = options.step ?? ((id: string) => consumer!.step(id));
  try {
    let complete = false;
    for (
      let action = 0;
      action < 5 &&
      performance.now() - started < 20_000 &&
      (options.remainingMs?.() ?? 30_000) > 5_000;
      action++
    ) {
      if ((await step(publicationId)).complete) {
        complete = true;
        break;
      }
    }
    if (!complete) await (options.continuation ?? dispatchFinancePublicationWorker)(publicationId);
    emit({
      operation: 'projection',
      outcome: complete ? 'success' : 'pending',
      correlationId,
      durationMs: performance.now() - started,
    });
  } catch (error) {
    emit({
      operation: 'projection',
      outcome: financeExperienceFailureOutcome(error),
      correlationId,
      durationMs: performance.now() - started,
      ...financeExperienceFailureDetails(error),
    });
    const details = financeExperienceFailureDetails(error);
    throw new FinanceExperienceFailure(
      details.errorCategory,
      'Finance publication worker failed.',
      details.retryKind,
    );
  }
}
