import { useEffect, useState } from 'react';
import type { GoogleSyncConflict } from '@naaseh/domain';
import type {
  googleDisconnectPreviewSchema,
  googleQuarantineListSchema,
  googleSyncPreviewSchema,
  googleSyncStatusSchema,
  googleTaskListChoiceSchema,
} from '@naaseh/contracts';
import type { z } from 'zod';
import { GoogleSyncConflicts } from './GoogleSyncConflicts.js';
import { GoogleSyncPreview } from './GoogleSyncPreview.js';
import {
  getGoogleSyncStatus,
  disconnectGoogle,
  listGoogleConflicts,
  listGoogleQuarantine,
  listGoogleTaskLists,
  previewGoogleDisconnect,
  previewGoogleSync,
  retryGoogleQuarantine,
  resolveGoogleConflict,
  runGoogleSync,
  startGoogleConnect,
  updateGoogleSyncSettings,
} from './google-sync-client.js';

type Status = z.infer<typeof googleSyncStatusSchema>;
type TaskListChoice = z.infer<typeof googleTaskListChoiceSchema>;
type Preview = z.infer<typeof googleSyncPreviewSchema>;
type DisconnectPreview = z.infer<typeof googleDisconnectPreviewSchema>;
type Quarantine = z.infer<typeof googleQuarantineListSchema>;

export function GoogleSyncPage({ csrfToken }: { csrfToken: string }) {
  const [status, setStatus] = useState<Status>();
  const [taskLists, setTaskLists] = useState<TaskListChoice[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [previewList, setPreviewList] = useState<TaskListChoice>();
  const [conflicts, setConflicts] = useState<GoogleSyncConflict[]>([]);
  const [quarantine, setQuarantine] = useState<Quarantine>([]);
  const [disconnectPreview, setDisconnectPreview] = useState<DisconnectPreview>();
  const [changingList, setChangingList] = useState(false);
  const [message, setMessage] = useState('Loading Google synchronization status.');

  async function refresh() {
    const next = await getGoogleSyncStatus(csrfToken);
    if (next) setStatus(next);
    if (!next) {
      setMessage('Offline. Connect once online to enable Google synchronization.');
      return;
    }
    setMessage(
      navigator.onLine
        ? `Google synchronization is ${next.state}.`
        : `Offline. Last-known Google status is ${next.state}; synchronization will wait.`,
    );
    if (next.state !== 'disconnected' && next.state !== 'connecting') {
      setConflicts(await listGoogleConflicts(csrfToken));
      if (navigator.onLine) {
        setTaskLists(await listGoogleTaskLists(csrfToken));
        setQuarantine(await listGoogleQuarantine(csrfToken).catch(() => []));
      }
    }
  }

  useEffect(() => {
    void refresh().catch(() => setMessage('Google status could not be loaded.'));
  }, [csrfToken]);
  useEffect(() => {
    const connectivity = () =>
      setMessage(
        navigator.onLine
          ? `Google synchronization is ${status?.state ?? 'ready to refresh'}.`
          : 'Offline. Last-known Google status remains available; synchronization will wait.',
      );
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    return () => {
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
    };
  }, [status?.state]);

  return (
    <section className="panel google-sync-page">
      <h1>Google Tasks synchronization</h1>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p>
        Dated tasks can appear in Google Calendar through Google Tasks. Memos and hidden content
        remain in Na'aseh.
      </p>
      {status?.state === 'disconnected' || !status ? (
        <button
          type="button"
          disabled={!navigator.onLine}
          onClick={() =>
            void startGoogleConnect(
              csrfToken,
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ).then(({ authorizationUrl }) => location.assign(authorizationUrl))
          }
        >
          Connect Google
        </button>
      ) : null}
      {status?.state === 'preview' ? (
        <section>
          <h2>Select a Google task list</h2>
          {taskLists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() =>
                void previewGoogleSync(csrfToken, list.id).then((value) => {
                  setPreviewList(list);
                  setPreview(value);
                })
              }
            >
              Preview {list.title}
            </button>
          ))}
          {preview ? <GoogleSyncPreview preview={preview} /> : null}
          {preview && previewList ? (
            <button
              type="button"
              onClick={() =>
                void updateGoogleSyncSettings(csrfToken, {
                  selectedTaskListId: previewList.id,
                  selectedTaskListTitle: previewList.title,
                  state: 'active',
                  expectedVersion: status.version!,
                  mutationId: crypto.randomUUID(),
                }).then(setStatus)
              }
            >
              Start synchronization
            </button>
          ) : null}
        </section>
      ) : null}
      {status?.selectedTaskListTitle ? <p>Selected list: {status.selectedTaskListTitle}</p> : null}
      {status && ['active', 'paused', 'reauthRequired'].includes(status.state) ? (
        <section aria-labelledby="google-controls-heading">
          <h2 id="google-controls-heading">Synchronization controls</h2>
          {status.state === 'reauthRequired' ? (
            <button
              type="button"
              disabled={!navigator.onLine}
              onClick={() =>
                void startGoogleConnect(
                  csrfToken,
                  status.defaultTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                ).then(({ authorizationUrl }) => location.assign(authorizationUrl))
              }
            >
              Reconnect Google
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  void updateGoogleSyncSettings(csrfToken, {
                    state: status.state === 'active' ? 'paused' : 'active',
                    expectedVersion: status.version!,
                    mutationId: crypto.randomUUID(),
                  }).then(setStatus)
                }
              >
                {status.state === 'active' ? 'Pause synchronization' : 'Resume synchronization'}
              </button>
              <button
                type="button"
                disabled={status.state !== 'active' || !navigator.onLine}
                onClick={() =>
                  void runGoogleSync(csrfToken).then(({ runId }) => {
                    setMessage(`Google synchronization run ${runId} started.`);
                    return refresh();
                  })
                }
              >
                Synchronize now
              </button>
              <button
                type="button"
                disabled={!navigator.onLine}
                onClick={() => setChangingList((value) => !value)}
              >
                Change Google task list
              </button>
            </>
          )}
          {changingList ? (
            <div>
              <p>
                Preview a new list before moving synchronization. Existing Google tasks can be kept
                or only Na'aseh-created tasks can be removed.
              </p>
              {taskLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() =>
                    void previewGoogleSync(csrfToken, list.id).then((value) => {
                      setPreviewList(list);
                      setPreview(value);
                    })
                  }
                >
                  Preview move to {list.title}
                </button>
              ))}
              {preview && previewList ? (
                <>
                  <GoogleSyncPreview preview={preview} />
                  <button
                    type="button"
                    onClick={() =>
                      void updateGoogleSyncSettings(csrfToken, {
                        selectedTaskListId: previewList.id,
                        selectedTaskListTitle: previewList.title,
                        listChangeMode: 'leavePrevious',
                        expectedVersion: status.version!,
                        mutationId: crypto.randomUUID(),
                      }).then((value) => {
                        setStatus(value);
                        setChangingList(false);
                      })
                    }
                  >
                    Move and keep previous Google tasks
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateGoogleSyncSettings(csrfToken, {
                        selectedTaskListId: previewList.id,
                        selectedTaskListTitle: previewList.title,
                        listChangeMode: 'deleteNaasehOriginPrevious',
                        expectedVersion: status.version!,
                        mutationId: crypto.randomUUID(),
                      }).then((value) => {
                        setStatus(value);
                        setChangingList(false);
                      })
                    }
                  >
                    Move and remove previous Na'aseh-created tasks
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void previewGoogleDisconnect(csrfToken).then(setDisconnectPreview)}
          >
            Disconnect Google
          </button>
          {disconnectPreview ? (
            <div role="alert">
              <p>
                {disconnectPreview.linkedCount} linked tasks will remain in Na'aseh. Up to{' '}
                {disconnectPreview.naasehOriginCount} Na'aseh-created Google tasks may be removed.
              </p>
              <button
                type="button"
                onClick={() =>
                  void disconnectGoogle(csrfToken, {
                    cleanup: 'retain',
                    expectedVersion: status.version!,
                    mutationId: crypto.randomUUID(),
                  }).then(() => refresh())
                }
              >
                Disconnect and keep Google tasks
              </button>
              <button
                type="button"
                onClick={() =>
                  void disconnectGoogle(csrfToken, {
                    cleanup: 'deleteNaasehOrigin',
                    expectedVersion: status.version!,
                    mutationId: crypto.randomUUID(),
                  }).then(() => refresh())
                }
              >
                Disconnect and remove Na'aseh-created Google tasks
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {quarantine.length ? (
        <section aria-labelledby="google-quarantine-heading">
          <h2 id="google-quarantine-heading">Items needing retry</h2>
          {quarantine.map((operation) => (
            <p key={operation.id}>
              {operation.direction === 'toGoogle' ? 'Upload' : 'Import'} failed safely (
              {operation.safeErrorCode ?? 'invalid item'}).{' '}
              <button
                type="button"
                onClick={() =>
                  void retryGoogleQuarantine(csrfToken, operation.id).then(async () => {
                    setQuarantine(await listGoogleQuarantine(csrfToken));
                  })
                }
              >
                Retry item
              </button>
            </p>
          ))}
        </section>
      ) : null}
      <GoogleSyncConflicts
        conflicts={conflicts}
        onResolve={async (conflict, source, editedValue) => {
          await resolveGoogleConflict(csrfToken, conflict.id, {
            source,
            ...(editedValue !== undefined ? { editedValue } : {}),
            expectedVersion: conflict.version,
            mutationId: crypto.randomUUID(),
          });
          setConflicts(await listGoogleConflicts(csrfToken));
        }}
      />
    </section>
  );
}
