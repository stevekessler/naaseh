import { describe, expect, it } from 'vitest';
import { FinanceScopePreparation } from '../../apps/api/src/finance/scope-preparation.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
function setup(PK = 'FINANCE#SCOPE#OWNER#legacy') {
  const f = financePersistenceFixture();
  const meta = { PK, SK: 'META' };
  f.rows.set(f.key(meta), { ...meta, revision: 1 });
  let more = true;
  const calls: string[] = [];
  const service = new FinanceScopePreparation({
    work: () => new FinanceUnitOfWork(f.persistence, 'table'),
    locators: async (_scope, cursor) => {
      calls.push(cursor ? 'locators-next' : 'locators');
      const pending = more;
      more = false;
      return { nextCursor: pending ? { PK, SK: 'ROW#accounts#page' } : null, examined: 1 };
    },
    refundIndex: async () => {
      calls.push('refund-index');
      const row = f.rows.get(f.key(meta))!;
      f.rows.set(f.key(meta), {
        ...row,
        revision: Number(row.revision) + 1,
        refundRelationshipIndexVersion: 1,
      });
      return { complete: true };
    },
  });
  return { ...f, PK, meta, service, calls };
}
describe('trusted legacy scope preparation', () => {
  it('resumes locator pages before an account locator is available and stamps only a completed scan', async () => {
    const f = setup();
    expect(await f.service.step(f.PK)).toMatchObject({ phase: 'locators', complete: false });
    expect(f.rows.get(f.key(f.meta))?.locatorIndexVersion).toBeUndefined();
    expect(await f.service.step(f.PK)).toMatchObject({ phase: 'refund-index', complete: false });
    expect(f.rows.get(f.key(f.meta))).toMatchObject({ revision: 2, locatorIndexVersion: 1 });
    expect(await f.service.step(f.PK)).toMatchObject({ phase: 'complete', complete: true });
    expect(f.rows.get(f.key(f.meta))).toMatchObject({
      revision: 3,
      locatorIndexVersion: 1,
      refundRelationshipIndexVersion: 1,
    });
  });
  it('rejects a changed source during locator enumeration and supports an explicit restart', async () => {
    const f = setup();
    await f.service.step(f.PK);
    f.rows.set(f.key(f.meta), { ...f.meta, revision: 2 });
    await expect(f.service.step(f.PK)).rejects.toThrow(/revision|restart/i);
    expect(await f.service.step(f.PK, { restart: true })).toMatchObject({
      phase: 'refund-index',
      complete: false,
    });
  });
  it('does not run refund indexing against the global catalog', async () => {
    const f = setup('FINANCE#CATALOG');
    await f.service.step(f.PK);
    expect(await f.service.step(f.PK)).toMatchObject({ phase: 'complete', complete: true });
    expect(f.calls).not.toContain('refund-index');
    expect(f.rows.get(f.key(f.meta))?.locatorIndexVersion).toBe(1);
  });
  it('uses completed authoritative stamps to avoid repeating a recovered phase', async () => {
    const f = setup();
    await f.service.step(f.PK);
    f.rows.set(f.key(f.meta), {
      ...f.meta,
      revision: 3,
      locatorIndexVersion: 1,
      refundRelationshipIndexVersion: 1,
    });
    expect(await f.service.step(f.PK)).toMatchObject({ phase: 'complete', complete: true });
    expect(f.calls).toEqual(['locators']);
  });
});
