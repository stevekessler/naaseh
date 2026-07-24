export function StorageWarning({ nearLimit }: { nearLimit: boolean }) {
  return nearLimit ? (
    <aside role="alert">
      Browser storage is nearly full. New saves are blocked until space is available; existing
      pending work remains stored.
    </aside>
  ) : null;
}
