import { useState } from 'react';
import { setPrivateTaskGoogleSharing } from '../google-sync/google-sync-client.js';

export function PrivacyControl({
  privateTask,
  change,
  taskId,
  csrfToken,
}: {
  privateTask: boolean;
  change: (value: boolean) => void;
  taskId?: string;
  csrfToken?: string;
}) {
  const [googleSharing, setGoogleSharing] = useState(false);
  const [sharingVersion, setSharingVersion] = useState(0);
  return (
    <div className="privacy-control">
      <button
        type="button"
        aria-pressed={privateTask}
        aria-label={privateTask ? 'Unlock to-do item' : 'Lock to-do item'}
        onClick={() => change(!privateTask)}
      >
        {privateTask ? '🔒 Locked' : '🔓 Unlocked'}
      </button>
      <span>
        {privateTask
          ? 'Only you can see this to-do item.'
          : 'All active users can see this to-do item.'}
      </span>
      {privateTask && taskId && csrfToken ? (
        <button
          type="button"
          aria-pressed={googleSharing}
          onClick={() => {
            const next = !googleSharing;
            if (
              next &&
              !window.confirm(
                "Share this private task title and due date with Google? Memos remain in Na'aseh.",
              )
            )
              return;
            void setPrivateTaskGoogleSharing(csrfToken, taskId, next, sharingVersion).then(
              (value) => {
                setGoogleSharing(value.approved);
                setSharingVersion(value.version);
              },
            );
          }}
        >
          {googleSharing ? 'Stop sharing with Google' : 'Share title and date with Google'}
        </button>
      ) : null}
    </div>
  );
}
