import { describe, expect, it } from 'vitest';
import {
  archiveFinanceCategory,
  assertCategoryParentChange,
  assertUniqueActiveCategoryName,
  createFinanceClassificationSnapshot,
  createUserFinanceCategory,
} from './category.js';
import { withAllocationClassification } from './allocation.js';

const actor = { id: 'user-a', role: 'user' as const, active: true };

const root = createUserFinanceCategory({ id: 'food', name: 'Food', creatorId: actor.id });
const otherRoot = createUserFinanceCategory({ id: 'travel', name: 'Travel', creatorId: actor.id });
const child = createUserFinanceCategory({
  id: 'eating-out',
  name: 'Eating Out',
  creatorId: actor.id,
  parentId: root.id,
});

describe('one-level Finance category hierarchy', () => {
  it('rejects self-parenting, cycles and children of children', () => {
    expect(() => assertCategoryParentChange([root, child], root, root.id)).toThrow(
      /own parent|itself/iu,
    );
    expect(() => assertCategoryParentChange([root, child], root, child.id)).toThrow(/cycle/iu);
    expect(() => assertCategoryParentChange([root, child], child, child.id)).toThrow(
      /own parent|itself/iu,
    );

    const grandchild = createUserFinanceCategory({
      id: 'lunch',
      name: 'Lunch',
      creatorId: actor.id,
      parentId: child.id,
    });
    expect(() => assertCategoryParentChange([root, child, grandchild], grandchild, child.id)).toThrow(
      /one child level/iu,
    );
  });

  it('scopes duplicate active child names to their parent', () => {
    const duplicate = createUserFinanceCategory({
      id: 'duplicate',
      name: ' eating   out ',
      creatorId: actor.id,
      parentId: root.id,
    });
    expect(() => assertUniqueActiveCategoryName([child], duplicate.name, undefined, root.id)).toThrow(
      /already uses/iu,
    );
    expect(assertUniqueActiveCategoryName([child], duplicate.name, undefined, otherRoot.id)).toBe(
      'eating out',
    );
  });

  it('rejects an incompatible or archived parent/subcategory pair', () => {
    expect(() => createFinanceClassificationSnapshot(otherRoot, child)).toThrow(/belong/iu);
    expect(() => createFinanceClassificationSnapshot(root, archiveFinanceCategory(child, actor))).toThrow(
      /active/iu,
    );
  });

  it('rejects an allocation whose parent and subcategory do not form a valid pair', () => {
    const allocation = { id: 'allocation-a', amountMinor: -1_000, financeCategoryId: root.id };
    expect(() => withAllocationClassification(allocation, otherRoot, child)).toThrow(/category/iu);
    expect(() => withAllocationClassification(allocation, root, { ...child, parentId: otherRoot.id })).toThrow(
      /belong/iu,
    );
    expect(withAllocationClassification(allocation, root, child)).toMatchObject({
      financeCategoryId: root.id,
      subcategoryId: child.id,
      classification: { categoryLabel: 'Food', subcategoryLabel: 'Eating Out' },
    });
  });

  it('preserves category labels, revisions and parent association as assignment history', () => {
    const snapshot = createFinanceClassificationSnapshot(root, child);
    expect(snapshot).toEqual({
      categoryId: root.id,
      categoryLabel: 'Food',
      categoryVersion: 1,
      subcategoryId: child.id,
      subcategoryLabel: 'Eating Out',
      subcategoryVersion: 1,
    });

    const changedRoot = { ...root, name: 'Meals', version: 2 };
    const changedChild = { ...child, parentId: otherRoot.id, name: 'Restaurants', version: 2 };
    expect(changedRoot.name).toBe('Meals');
    expect(changedChild.parentId).toBe(otherRoot.id);
    expect(snapshot).toMatchObject({
      categoryId: root.id,
      categoryLabel: 'Food',
      subcategoryId: child.id,
      subcategoryLabel: 'Eating Out',
    });
  });

  it('rejects reparenting a referenced child instead of rewriting history', () => {
    expect(() =>
      assertCategoryParentChange([root, otherRoot, child], child, otherRoot.id, {
        hasReferences: true,
      }),
    ).toThrow(/referenced|history/iu);
  });
});
