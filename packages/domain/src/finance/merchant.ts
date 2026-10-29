import type { FinanceCatalogActor } from './category.js';

export interface FinanceMerchant {
  id: string;
  name: string;
  city?: string;
  region?: string;
  canonicalKey: string;
  merchantCategoryCode?: string;
  financeCategoryId?: string;
  source: 'imported' | 'manual' | 'merged';
  creatorId?: string;
  status: 'active' | 'archived' | 'merged';
  mergedIntoId?: string;
  version: number;
}

const canonicalPart = (value: string | undefined) =>
  (value ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

export const canonicalMerchantKey = (name: string, city?: string, region?: string) =>
  [canonicalPart(name), canonicalPart(city), canonicalPart(region)].join('|');

const bounded = (value: string | undefined, maximum: number) => {
  const normalized = value?.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (normalized && normalized.length > maximum)
    throw new Error(`Merchant field exceeds ${maximum} characters.`);
  return normalized || undefined;
};

export function createMerchant(input: {
  id: string;
  name: string;
  city?: string;
  region?: string;
  merchantCategoryCode?: string;
  financeCategoryId?: string;
  source: 'imported' | 'manual';
  creatorId?: string;
}): FinanceMerchant {
  const name = bounded(input.name, 200);
  if (!name) throw new Error('Merchant name is required.');
  if (input.source === 'manual' && !input.creatorId)
    throw new Error('A manual merchant requires its creator.');
  const city = bounded(input.city, 120);
  const region = bounded(input.region, 120);
  return {
    id: input.id,
    name,
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    canonicalKey: canonicalMerchantKey(name, city, region),
    ...(input.merchantCategoryCode ? { merchantCategoryCode: input.merchantCategoryCode } : {}),
    ...(input.financeCategoryId ? { financeCategoryId: input.financeCategoryId } : {}),
    source: input.source,
    ...(input.creatorId ? { creatorId: input.creatorId } : {}),
    status: 'active',
    version: 1,
  };
}

function assertMerchantEditor(merchant: FinanceMerchant, actor: FinanceCatalogActor) {
  if (!actor.active || (actor.role !== 'admin' && merchant.creatorId !== actor.id)) {
    throw new Error('Only the creator or administrator may change this merchant.');
  }
}

export function archiveMerchant(
  merchant: FinanceMerchant,
  actor: FinanceCatalogActor,
): FinanceMerchant {
  assertMerchantEditor(merchant, actor);
  return { ...merchant, status: 'archived', version: merchant.version + 1 };
}

export function mergeMerchant(
  merchant: FinanceMerchant,
  mergedIntoId: string,
  actor: FinanceCatalogActor,
): FinanceMerchant {
  if (!actor.active || actor.role !== 'admin')
    throw new Error('Only an administrator may merge merchants.');
  if (merchant.id === mergedIntoId) throw new Error('A merchant cannot be merged into itself.');
  return {
    ...merchant,
    source: 'merged',
    status: 'merged',
    mergedIntoId,
    version: merchant.version + 1,
  };
}

export function canPermanentlyDeleteMerchant(
  merchant: FinanceMerchant,
  actor: FinanceCatalogActor,
  hasReferences: boolean,
  isMistake: boolean,
) {
  return (
    actor.active &&
    merchant.source === 'manual' &&
    (actor.role === 'admin' || merchant.creatorId === actor.id) &&
    merchant.status === 'active' &&
    !hasReferences &&
    isMistake
  );
}

export const historicalMerchantLabel = (merchant: FinanceMerchant) =>
  `${merchant.name}${merchant.status === 'archived' ? ' (archived)' : merchant.status === 'merged' ? ' (merged)' : ''}`;
