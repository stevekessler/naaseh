import { describe, expect, it } from 'vitest';
import {
  currentSchemaVersion,
  planEnhancedSchemaMigration,
  runResumableSchemaMigrations,
  type SchemaMigrationCheckpoint,
} from '../../src/db/schema.js';
import { migrateLegacyFinanceValue } from '../../src/db/finance-repository.js';
import { buildExperienceFixture } from '../../../../tests/fixtures/finance/experience.js';

describe('additive Finance experience migration', () => {
  it('adds encrypted receipt bytes/security/metadata stores while preserving keys and pending outbox', () => {
    expect(currentSchemaVersion).toBe(17);
    expect(planEnhancedSchemaMigration(16)).toMatchObject({
      preserveOutbox: true,
      storesToDelete: [],
      preservedStores: ['settings', 'cryptoKeys', 'outbox', 'secureConflicts'],
      storesToAdd: ['secureFinancePendingBytes', 'secureFinanceOfflineSecurity'],
    });
  });

  it('keeps legacy drafts inactive, leaves active budgets active and preserves closed flags', () => {
    const f = buildExperienceFixture();
    const legacy = { ...f.budgets[3]!, activity: undefined };
    expect(migrateLegacyFinanceValue('financeBudget', legacy)).toMatchObject({
      status: 'draft',
      activity: 'inactive',
    });
    const active = { ...f.budgets[0]!, activity: undefined };
    expect(migrateLegacyFinanceValue('financeBudget', active)).toMatchObject({
      activity: 'active',
    });
    expect(migrateLegacyFinanceValue('financeBudget', f.budgets[2]!)).toEqual(f.budgets[2]);
    expect(legacy.activity).toBeUndefined();
  });

  it('is restartable without mutating original contexts, encrypted pending records or legacy task-link IDs', async () => {
    const f = buildExperienceFixture();
    const pending = {
      id: 'pending',
      value: { ciphertext: 'synthetic-ciphertext' },
      entryContext: f.calendarCases[1],
    };
    expect(migrateLegacyFinanceValue('financeUpcomingExpense', pending)).toEqual(pending);
    const adapted = migrateLegacyFinanceValue('financeTaskLink', f.legacyTaskLink);
    expect(migrateLegacyFinanceValue('financeTaskLink', adapted)).toEqual(adapted);
    expect(adapted).toMatchObject({
      id: f.legacyTaskLink.id,
      targetType: 'budgetItem',
      targetId: f.legacyTaskLink.budgetItemId,
    });
    let checkpoint: SchemaMigrationCheckpoint = { version: 16, completedStepIds: [] };
    let preserved = 0;
    let attempts = 0;
    const steps = [
      {
        id: 'preserve-finance-outbox',
        from: 16,
        to: 16,
        run: async () => {
          preserved++;
        },
      },
      {
        id: 'add-finance-protected-byte-stores',
        from: 16,
        to: 17,
        run: async () => {
          if (++attempts === 1) throw new Error('interrupted');
        },
      },
    ];
    const saveCheckpoint = async (next: SchemaMigrationCheckpoint) => {
      checkpoint = next;
    };
    await expect(
      runResumableSchemaMigrations({ checkpoint, steps, saveCheckpoint }),
    ).rejects.toThrow('interrupted');
    const result = await runResumableSchemaMigrations({ checkpoint, steps, saveCheckpoint });
    expect(result.version).toBe(17);
    expect(preserved).toBe(1);
    expect(attempts).toBe(2);
    expect(pending.value.ciphertext).toBe('synthetic-ciphertext');
  });
});
