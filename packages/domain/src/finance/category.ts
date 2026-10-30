export interface FinanceCatalogActor {
  id: string;
  role: 'admin' | 'user';
  active: boolean;
}

export interface FinanceCategory {
  id: string;
  name: string;
  canonicalName: string;
  origin: 'bank' | 'user';
  merchantCategoryCode?: string;
  creatorId?: string;
  status: 'active' | 'archived';
  version: number;
}

export function canonicalFinanceCategoryName(name: string) {
  return name.normalize('NFC').toLocaleLowerCase('und').replace(/\s+/gu, ' ').trim();
}

function categoryName(name: string) {
  const value = name.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!value || value.length > 100)
    throw new Error('Finance category name must be 1–100 characters.');
  return value;
}

export function createUserFinanceCategory(input: {
  id: string;
  name: string;
  creatorId: string;
}): FinanceCategory {
  const name = categoryName(input.name);
  if (!input.creatorId) throw new Error('A user category requires its creator.');
  return {
    id: input.id,
    name,
    canonicalName: canonicalFinanceCategoryName(name),
    origin: 'user',
    creatorId: input.creatorId,
    status: 'active',
    version: 1,
  };
}

export function createBankFinanceCategory(input: {
  id: string;
  name: string;
  merchantCategoryCode?: string;
}): FinanceCategory {
  const name = categoryName(input.name);
  return {
    id: input.id,
    name,
    canonicalName: canonicalFinanceCategoryName(name),
    origin: 'bank',
    ...(input.merchantCategoryCode ? { merchantCategoryCode: input.merchantCategoryCode } : {}),
    status: 'active',
    version: 1,
  };
}

export function assertUniqueActiveCategoryName(
  categories: readonly FinanceCategory[],
  name: string,
  excludingId?: string,
) {
  const canonicalName = canonicalFinanceCategoryName(name);
  if (
    categories.some(
      (category) =>
        category.status === 'active' &&
        category.id !== excludingId &&
        category.canonicalName === canonicalName,
    )
  ) {
    throw new Error('An active Finance category already uses this name.');
  }
  return canonicalName;
}

function assertCategoryEditor(category: FinanceCategory, actor: FinanceCatalogActor) {
  if (!actor.active || (actor.role !== 'admin' && category.creatorId !== actor.id)) {
    throw new Error('Only the creator or administrator may change this category.');
  }
  if (category.origin === 'bank') throw new Error('Bank categories are source-managed.');
}

export function renameFinanceCategory(
  category: FinanceCategory,
  nextName: string,
  actor: FinanceCatalogActor,
) {
  assertCategoryEditor(category, actor);
  const name = categoryName(nextName);
  return {
    ...category,
    name,
    canonicalName: canonicalFinanceCategoryName(name),
    version: category.version + 1,
  };
}

export function archiveFinanceCategory(category: FinanceCategory, actor: FinanceCatalogActor) {
  assertCategoryEditor(category, actor);
  return { ...category, status: 'archived' as const, version: category.version + 1 };
}

export function canPermanentlyDeleteFinanceCategory(
  category: FinanceCategory,
  actor: FinanceCatalogActor,
  hasReferences: boolean,
  isMistake: boolean,
) {
  return (
    actor.active &&
    category.origin === 'user' &&
    (actor.role === 'admin' || category.creatorId === actor.id) &&
    category.status === 'active' &&
    !hasReferences &&
    isMistake
  );
}

export const historicalCategoryLabel = (category: FinanceCategory) =>
  `${category.name}${category.status === 'archived' ? ' (archived)' : ''}`;
