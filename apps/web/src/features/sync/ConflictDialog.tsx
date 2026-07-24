import type { SyncConflict } from '@naaseh/domain';
import type { Resolution } from '../../sync/conflict-resolution.js';
export function ConflictDialog({
  conflict,
  resolve,
}: {
  conflict: SyncConflict;
  resolve: (choice: Resolution) => void;
}) {
  return (
    <dialog open aria-labelledby="conflict-title">
      <h2 id="conflict-title">Choose which change to keep</h2>
      <p>
        Your offline edit conflicts with server version {conflict.remote.version}. No task content
        is shown in this notice.
      </p>
      <button onClick={() => resolve('keep-local')}>Keep mine</button>
      <button onClick={() => resolve('keep-remote')}>Keep server version</button>
    </dialog>
  );
}
