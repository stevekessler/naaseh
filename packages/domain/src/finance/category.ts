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
  parentId?: string;
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
  parentId?: string;
}): FinanceCategory {
  const name = categoryName(input.name);
  if (!input.creatorId) throw new Error('A user category requires its creator.');
  return {
    id: input.id,
    name,
    canonicalName: canonicalFinanceCategoryName(name),
    origin: 'user',
    creatorId: input.creatorId,
    ...(input.parentId ? { parentId: input.parentId } : {}),
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
  parentId?: string,
) {
  const canonicalName = canonicalFinanceCategoryName(name);
  if (
    categories.some(
      (category) =>
        category.status === 'active' &&
        category.id !== excludingId &&
        category.parentId === parentId &&
        category.canonicalName === canonicalName,
    )
  ) {
    throw new Error('An active Finance category already uses this name.');
  }
  return canonicalName;
}

export function assertCategoryParentChange(
  categories: readonly FinanceCategory[],
  category: FinanceCategory,
  parentId: string | undefined,
  impact: { hasReferences: boolean } = { hasReferences: false },
) {
  if (parentId === undefined) {
    if (category.parentId && impact.hasReferences)
      throw new Error('A referenced subcategory cannot be reparented without history review.');
    return;
  }
  if (parentId === category.id) throw new Error('A category cannot be its own parent.');
  const parent = categories.find((candidate) => candidate.id === parentId);
  if (!parent) throw new Error('The parent Finance category does not exist.');
  if (parent.status !== 'active') throw new Error('The parent Finance category must be active.');
  if (categories.some((candidate) => candidate.parentId === category.id))
    throw new Error('The category parent change would create a cycle.');
  if (parent.parentId) throw new Error('Finance categories support only one child level.');
  if (category.parentId !== parentId && impact.hasReferences)
    throw new Error('A referenced subcategory cannot be reparented without history review.');
}

export interface FinanceClassificationSnapshot {
  categoryId: string;
  categoryLabel: string;
  categoryVersion: number;
  subcategoryId?: string;
  subcategoryLabel?: string;
  subcategoryVersion?: number;
}

/** Immutable assignment-time identity; later catalog edits never rewrite this value. */
export function createFinanceClassificationSnapshot(
  category: FinanceCategory,
  subcategory?: FinanceCategory,
): FinanceClassificationSnapshot {
  if (category.status !== 'active' || category.parentId)
    throw new Error('The selected parent Finance category must be an active root.');
  if (subcategory && subcategory.status !== 'active')
    throw new Error('The selected Finance subcategory must be active.');
  if (subcategory && subcategory.parentId !== category.id)
    throw new Error('The selected subcategory does not belong to the parent category.');
  return {
    categoryId: category.id,
    categoryLabel: category.name,
    categoryVersion: category.version,
    ...(subcategory
      ? {
          subcategoryId: subcategory.id,
          subcategoryLabel: subcategory.name,
          subcategoryVersion: subcategory.version,
        }
      : {}),
  };
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

export function reparentFinanceCategory(
  category: FinanceCategory,
  parentId: string | undefined,
  categories: readonly FinanceCategory[],
  actor: FinanceCatalogActor,
  impact: { hasReferences: boolean },
) {
  assertCategoryEditor(category, actor);
  assertCategoryParentChange(categories, category, parentId, impact);
  const updated: FinanceCategory = { ...category, version: category.version + 1 };
  if (parentId) updated.parentId = parentId;
  else delete updated.parentId;
  return updated;
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
