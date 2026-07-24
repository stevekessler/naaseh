export async function storageHealth() {
  const estimate = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  return {
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
    persisted: Boolean(persisted),
    nearLimit: Boolean(estimate?.usage && estimate?.quota && estimate.usage / estimate.quota > 0.9),
  };
}
export function assertStorageCapacity(usage: number, quota: number, additionalBytes: number) {
  if (quota > 0 && usage + additionalBytes > quota * 0.95)
    throw new Error('This change cannot be saved safely because browser storage is nearly full.');
}
