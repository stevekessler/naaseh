import { describe, expect, it } from 'vitest';
import { simplefinMissingNamesFixture, simplefinV2Fixture } from '../fixtures/finance/simplefin.js';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { parseSimplefinV2 } from '@naaseh/domain';
import {
  acquireRefreshLease,
  claimSimplefinConnection,
  completeRefreshJob,
  dispatchSimplefinRefresh,
  importSimplefinAccounts,
  refreshAllowedAt,
  refreshWindowStart,
} from '../../apps/api/src/finance/connection-service.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { executeFinanceImport } from '../../apps/api/src/finance/import-handler.js';

describe('SimpleFIN import', () => {
  it('parses v2 payloads and pauses incomplete account identity', () => {
    expect(parseSimplefinV2(simplefinV2Fixture).accounts[0]).toMatchObject({
      sourceName: 'Household Checking',
      organizationName: 'Example Community Bank',
      providerConnectionId: 'fixture-provider-connection',
      availableBalanceMinor: 120_000,
      needsIdentityCompletion: false,
    });
    expect(
      parseSimplefinV2(simplefinMissingNamesFixture).accounts[0]?.needsIdentityCompletion,
    ).toBe(true);
  });

  it('stores only encrypted claims and dispatches identifier-only asynchronous jobs', async () => {
    const repository = new FinanceMemoryRepository();
    const kms = { send: async () => ({ CiphertextBlob: new Uint8Array([1, 2, 3]) }) };
    const fetcher = (async () =>
      new Response('https://user:pass@bridge.simplefin.org/simplefin', {
        status: 200,
      })) as typeof fetch;
    const connection = await claimSimplefinConnection(
      repository,
      {
        id: 'connection-1',
        scope: { type: 'owner', ownerId: 'owner-1' },
        setupToken: Buffer.from('https://bridge.simplefin.org/claim').toString('base64'),
        allowedHosts: ['bridge.simplefin.org'],
        keyId: 'key-1',
      },
      { kms, fetcher },
    );
    expect(connection).not.toHaveProperty('accessUrl');
    expect(JSON.stringify(repository.connections.get('connection-1'))).not.toContain(
      'bridge.simplefin.org',
    );
    const invocations: unknown[] = [];
    const lambda = {
      send: async (command: unknown) => {
        invocations.push(command);
        return {};
      },
    };
    const queued = await dispatchSimplefinRefresh(
      repository,
      'connection-1',
      'job-1',
      new Date('2026-01-01T00:00:00.000Z'),
      lambda,
      'finance-import',
    );
    expect(queued).toMatchObject({
      status: 'queued',
      windowStart: '2025-10-04',
      windowEnd: '2026-01-02',
    });
    const payload = new TextDecoder().decode((invocations[0] as InvokeCommand).input.Payload);
    expect(JSON.parse(payload)).toEqual({ jobId: 'job-1', connectionId: 'connection-1' });
    expect(payload).not.toContain('AQID');
  });

  it('uses a one-hour cooldown and five-day overlap', () => {
    expect(refreshAllowedAt('2026-01-01T00:00:00.000Z').toISOString()).toBe(
      '2026-01-01T01:00:00.000Z',
    );
    expect(refreshWindowStart('2026-01-20')).toBe('2026-01-15');
  });

  it('excludes concurrent refresh attempts and recovers a partial attempt', () => {
    const repository = new FinanceMemoryRepository();
    const first = acquireRefreshLease(
      repository,
      'connection-1',
      'job-1',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(first.status).toBe('running');
    expect(() =>
      acquireRefreshLease(
        repository,
        'connection-1',
        'job-1',
        new Date('2026-01-01T00:00:01.000Z'),
      ),
    ).toThrow(/lease/);
    completeRefreshJob(repository, 'job-1', 'partial', {
      accounts: 1,
      inserted: 1,
      updated: 0,
      duplicateSuppressed: 0,
      reviewIssues: 1,
    });
    expect(
      acquireRefreshLease(repository, 'connection-1', 'job-1', new Date('2026-01-01T00:10:00.000Z'))
        .attempts,
    ).toBe(2);
  });

  it('does not create or import transactions for accounts missing required identity', () => {
    const repository = new FinanceMemoryRepository();
    const result = importSimplefinAccounts(
      repository,
      'connection-1',
      { type: 'owner', ownerId: 'owner-1' },
      parseSimplefinV2(simplefinMissingNamesFixture),
    );
    expect(result).toMatchObject({
      importedAccounts: 0,
      attentionAccounts: 1,
      importedTransactions: 0,
    });
    expect(repository.accounts.size).toBe(0);
    expect(repository.transactions).toHaveLength(0);
  });

  it('decrypts, fetches, imports, and completes a refresh without exposing credentials', async () => {
    const repository = new FinanceMemoryRepository();
    repository.connections.set('connection-1', {
      id: 'connection-1',
      scope: { type: 'owner', ownerId: 'owner-1' },
      provider: 'simplefin-bridge',
      status: 'active',
      encryptedAccessUrl: 'AQID',
      credentialKeyId: 'key-1',
      credentialContextVersion: 1,
      version: 1,
    });
    repository.importJobs.set('job-1', {
      id: 'job-1',
      connectionId: 'connection-1',
      status: 'queued',
      counts: { accounts: 0, inserted: 0, updated: 0, duplicateSuppressed: 0, reviewIssues: 0 },
      errors: [],
      attempts: 0,
    });
    const kms = {
      send: async () => ({
        Plaintext: new TextEncoder().encode('https://user:pass@bridge.simplefin.org/simplefin'),
      }),
    };
    const fetcher = (async () =>
      new Response(JSON.stringify(simplefinV2Fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const job = await executeFinanceImport(
      { connectionId: 'connection-1', jobId: 'job-1' },
      {
        repository,
        allowedHosts: ['bridge.simplefin.org'],
        kms,
        fetcher,
        now: () => new Date('2026-01-02T00:00:00.000Z'),
      },
    );
    expect(job.status).toBe('succeeded');
    expect(repository.accounts.size).toBe(1);
    expect(repository.connections.get('connection-1')).not.toHaveProperty('accessUrl');
  });

  it('surfaces missing identity as a partial job and sanitizes provider failures', async () => {
    const repository = new FinanceMemoryRepository();
    const connection = {
      id: 'connection-1',
      scope: { type: 'owner' as const, ownerId: 'owner-1' },
      provider: 'simplefin-bridge' as const,
      status: 'active' as const,
      encryptedAccessUrl: 'AQID',
      credentialKeyId: 'key-1',
      credentialContextVersion: 1,
      version: 1,
    };
    repository.connections.set(connection.id, connection);
    repository.importJobs.set('job-partial', {
      id: 'job-partial',
      connectionId: connection.id,
      status: 'queued',
      counts: { accounts: 0, inserted: 0, updated: 0, duplicateSuppressed: 0, reviewIssues: 0 },
      errors: [],
      attempts: 0,
    });
    const kms = {
      send: async () => ({
        Plaintext: new TextEncoder().encode('https://user:pass@bridge.simplefin.org/simplefin'),
      }),
    };
    const partialFetcher = (async () =>
      new Response(JSON.stringify(simplefinMissingNamesFixture))) as typeof fetch;
    const partial = await executeFinanceImport(
      { connectionId: connection.id, jobId: 'job-partial' },
      {
        repository,
        allowedHosts: ['bridge.simplefin.org'],
        kms,
        fetcher: partialFetcher,
      },
    );
    expect(partial).toMatchObject({ status: 'partial', counts: { reviewIssues: 1 } });

    repository.importJobs.set('job-failed', {
      id: 'job-failed',
      connectionId: connection.id,
      status: 'queued',
      counts: { accounts: 0, inserted: 0, updated: 0, duplicateSuppressed: 0, reviewIssues: 0 },
      errors: [],
      attempts: 0,
    });
    const failedFetcher = (async () =>
      new Response('secret provider body', { status: 401 })) as typeof fetch;
    await expect(
      executeFinanceImport(
        { connectionId: connection.id, jobId: 'job-failed' },
        {
          repository,
          allowedHosts: ['bridge.simplefin.org'],
          kms,
          fetcher: failedFetcher,
        },
      ),
    ).rejects.toThrow(/provider-authentication/);
    expect(repository.importJobs.get('job-failed')?.errors).toEqual([
      { class: 'provider-authentication', message: 'The provider import could not be completed.' },
    ]);
    repository.importJobs.set('job-revoked', {
      ...repository.importJobs.get('job-failed')!,
      id: 'job-revoked',
      status: 'queued',
    });
    await expect(
      executeFinanceImport(
        { connectionId: connection.id, jobId: 'job-revoked' },
        {
          repository,
          allowedHosts: ['bridge.simplefin.org'],
          kms,
          fetcher: async () => {
            const current = repository.connections.get(connection.id)!;
            repository.connections.set(connection.id, {
              ...current,
              status: 'revoked',
              version: Number(current.version) + 1,
            });
            return new Response(JSON.stringify(simplefinV2Fixture));
          },
        },
      ),
    ).rejects.toThrow('Finance import failed (internal).');
    expect(repository.connections.get(connection.id)?.status).toBe('revoked');
    expect(repository.accounts.size).toBe(0);
  });
});
