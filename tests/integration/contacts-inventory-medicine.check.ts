import { describe, expect, it } from 'vitest';
import {
  defaultStrengthUnits,
  itemFieldsSchema,
  itemPayload,
  prescriberContactTypeId,
} from '../../packages/contacts-inventory-contracts/src/index.js';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { visibleItems } from '../../apps/contacts-inventory/src/inventory/item-filters.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';

const clinicianId = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
const medicineId = 'b4d02419-80af-4a8f-b710-1a49e7ca3001';
const medicine = {
  type: 'medicine',
  name: 'Synthetic medicine',
  locationId: 'closet',
  whoMed: 'both',
  status: 'discontinued',
  timeTaken: 'night',
  strengthNumber: 2.5,
  strengthUnitId: 'mg',
  dose: '½ tablet',
  prescriberId: clinicianId,
};
const actor = 'member-one';
const generation = 1;

async function setup() {
  const store = new MemoryWorkspaceStore();
  const repo = new WorkspaceRepository(store);
  await repo.mutate({
    kind: 'contact',
    id: clinicianId,
    generation,
    actor,
    mutationId: 'create-contact',
    action: 'create',
    fields: {
      firstName: 'Synthetic prescriber',
      contactTypeId: prescriberContactTypeId,
    },
  });
  return { store, repo };
}

describe('shared Medicine validation and references', () => {
  it('validates choices, dates and optional strength, and keeps the canonical units', () => {
    expect(itemFieldsSchema.parse(medicine)).toMatchObject({
      strengthNumber: 2.5,
      includeOnMedList: false,
    });
    expect(itemFieldsSchema.safeParse({ ...medicine, expirationDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(itemFieldsSchema.safeParse({ ...medicine, whoMed: 'outsider' }).success).toBe(false);
    expect(itemFieldsSchema.safeParse({ ...medicine, type: 'base' }).success).toBe(false);
    expect(defaultStrengthUnits.map(({ name }) => name)).toEqual([
      'mg',
      'G',
      'mcg',
      'oz',
      'mL',
      'IU',
      'g/mL',
    ]);
  });

  it('serializes prescriber deletion against medicine links and permits deletion after unlinking', async () => {
    const { store, repo } = await setup();
    const linked = itemPayload(itemFieldsSchema.parse(medicine));
    await repo.mutate({
      kind: 'item',
      id: medicineId,
      generation,
      actor,
      mutationId: 'create-med',
      action: 'create',
      fields: linked,
    });
    expect(await store.referenceCount(clinicianId)).toBe(1);
    await expect(
      repo.mutate({
        kind: 'contact',
        id: clinicianId,
        generation,
        actor,
        mutationId: 'early-delete',
        action: 'delete',
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: 'reference_in_use' });
    await expect(
      repo.mutate({
        kind: 'contact',
        id: clinicianId,
        generation,
        actor,
        mutationId: 'change-type',
        action: 'update',
        revision: 1,
        fields: { firstName: 'New', contactTypeId: 'other' },
      }),
    ).rejects.toMatchObject({ code: 'reference_in_use' });
    const fields = { ...linked };
    delete fields.prescriberId;
    await repo.mutate({
      kind: 'item',
      id: medicineId,
      generation,
      actor,
      mutationId: 'unlink',
      action: 'update',
      revision: 1,
      fields,
    });
    await repo.mutate({
      kind: 'contact',
      id: clinicianId,
      generation,
      actor,
      mutationId: 'after-unlink',
      action: 'delete',
      revision: 1,
    });
    expect(await store.referenceCount(clinicianId)).toBe(0);
    await expect(
      repo.mutate({
        kind: 'item',
        id: medicineId,
        generation,
        actor,
        mutationId: 'stale',
        action: 'update',
        revision: 2,
        fields: linked,
      }),
    ).rejects.toMatchObject({ code: 'invalid_reference' });
  });

  it.each(['delete', 'update'] as const)(
    'does not orphan a new Medicine link when a prescriber %s races it',
    async (action) => {
      const { store, repo } = await setup();
      const results = await Promise.allSettled([
        repo.mutate({
          kind: 'item',
          id: medicineId,
          generation,
          actor,
          mutationId: 'race-link',
          action: 'create',
          fields: itemPayload(itemFieldsSchema.parse(medicine)),
        }),
        repo.mutate({
          kind: 'contact',
          id: clinicianId,
          generation,
          actor: 'member-two',
          mutationId: 'race-contact',
          revision: 1,
          ...(action === 'delete'
            ? { action }
            : { action, fields: { firstName: 'Synthetic contact', contactTypeId: 'other' } }),
        }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const item = await repo.read({ kind: 'item', id: medicineId });
      const contact = await repo.read({ kind: 'contact', id: clinicianId });
      expect(await store.referenceCount(clinicianId)).toBe(item ? 1 : 0);
      if (item) expect(contact?.fields.contactTypeId).toBe(prescriberContactTypeId);
    },
  );

  it('includes medicine on the list only when its inclusion toggle is set', () => {
    const fields = itemFieldsSchema.parse({ ...medicine, includeOnMedList: true });
    const item = { id: medicineId, revision: 1, fields };
    expect(visibleItems([item], '', '', '', undefined, true)).toEqual([item]);
    expect(visibleItems([item], '', '', 'base')).toEqual([]);
    if (fields.type !== 'medicine') throw new Error('Expected medicine');
    expect(
      visibleItems(
        [{ ...item, fields: { ...fields, includeOnMedList: false } }],
        '',
        '',
        '',
        undefined,
        true,
      ),
    ).toEqual([]);
  });
});
