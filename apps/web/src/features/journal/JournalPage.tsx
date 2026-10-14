import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  journalEntryProjectionSchema,
  type CrisisPlanRecord,
  type JournalDocument,
  type JournalProfile,
  type Task,
} from '@naaseh/domain';
import {
  changeJournalPin,
  decryptJournalRecord,
  encryptJournalRecord,
  generateJournalMasterKey,
  journalDateToken,
  unwrapJournalMasterKeyWithPin,
  wrapJournalMasterKeyWithPin,
  zeroizeJournalKey,
} from '../../crypto/journal-crypto.js';
import {
  listEncryptedJournalEntries,
  readEncryptedJournalProfile,
  readLocalJournalOwnerWrap,
  saveEncryptedJournalProfile,
  saveLocalJournalOwnerWrap,
  savePendingJournalEntry,
} from '../../db/journal-repository.js';
import {
  emptyJournalEntry,
  JournalEntryEditor,
  type JournalEntryDraft,
} from './JournalEntryEditor.js';
import { JournalSettings } from './JournalSettings.js';
import { JournalUnlock } from './JournalUnlock.js';
import { JournalListPage } from './JournalListPage.js';
import { JournalDashboardPage } from './JournalDashboardPage.js';
import { JournalRecycleBinPage } from './JournalRecycleBinPage.js';
import { eligibleJournalTasks } from './journal-task-options.js';
import { readLocalCrisisPlan } from '../../db/crisis-plan-repository.js';
import { CrisisPlanPage } from './CrisisPlanPage.js';
import {
  decryptCrisisPlanBody,
  unwrapCrisisPlanKeyForOwner,
  zeroizeCrisisPlanKey,
} from '../../crypto/crisis-plan-crypto.js';
import {
  changeDurableJournalPin,
  createDurableJournalEnrollment,
  restoreDurableJournalEnrollment,
} from './journal-enrollment.js';
import { db } from '../../db/database.js';

export function JournalPage({
  ownerId,
  csrfToken,
  tasks = [],
  unlockedKey,
  onUnlockedKeyChange,
}: {
  ownerId: string;
  csrfToken: string;
  tasks?: Task[];
  unlockedKey: Uint8Array | undefined;
  onUnlockedKeyChange: (key: Uint8Array | undefined) => void;
}) {
  const localOnlyEnrollment = import.meta.env.DEV || import.meta.env.MODE === 'test';
  const jmk = unlockedKey;
  const setJmk = onUnlockedKeyChange;
  const [profile, setProfile] = useState<JournalProfile>({
    schemaVersion: 1,
    ownerId,
    suicidalSelfHarmEnabled: true,
    dbtSkillsEnabled: true,
  });
  const [section, setSection] = useState<
    'entries' | 'new' | 'settings' | 'dashboard' | 'crisis-plans' | 'recycle-bin'
  >(() =>
    location.pathname === '/journal/new'
      ? 'new'
      : location.pathname === '/journal/settings'
        ? 'settings'
        : location.pathname === '/journal/recycle-bin'
          ? 'recycle-bin'
          : location.pathname === '/journal/dashboard'
            ? 'dashboard'
            : location.pathname === '/journal/crisis-plans'
              ? 'crisis-plans'
              : 'entries',
  );
  const [projections, setProjections] = useState<JournalEntryDraft[]>([]);
  const [entryLoadWarning, setEntryLoadWarning] = useState('');
  const [selectedDraft, setSelectedDraft] = useState<JournalEntryDraft>();
  const [crisisPlanDocument, setCrisisPlanDocument] = useState<JournalDocument | null>(null);
  const [enrollmentLookupComplete, setEnrollmentLookupComplete] = useState(false);
  const [enrollmentLookupError, setEnrollmentLookupError] = useState('');
  const [enrollmentLookupAttempt, setEnrollmentLookupAttempt] = useState(0);
  const ownerWrap = useLiveQuery(() => readLocalJournalOwnerWrap(ownerId), [ownerId], null);
  const encryptedEntries =
    useLiveQuery(() => listEncryptedJournalEntries(ownerId), [ownerId]) ?? [];
  const encryptedProfile = useLiveQuery(() => readEncryptedJournalProfile(ownerId), [ownerId]);
  const pendingProfile =
    useLiveQuery(
      async () =>
        (await db.secureJournalOutbox.where('ownerId').equals(ownerId).toArray()).some(
          (row) =>
            (row.value as import('../../db/journal-types.js').JournalMutation).entityType ===
            'journalProfile',
        ),
      [ownerId],
    ) ?? false;
  const encryptedCrisisPlan = useLiveQuery(() => readLocalCrisisPlan(ownerId), [ownerId]);
  const draft = useMemo(() => emptyJournalEntry(ownerId), [ownerId]);
  useEffect(() => {
    if (ownerWrap === null) return;
    if (ownerWrap || localOnlyEnrollment) {
      setEnrollmentLookupError('');
      setEnrollmentLookupComplete(true);
      return;
    }
    let active = true;
    setEnrollmentLookupComplete(false);
    setEnrollmentLookupError('');
    void restoreDurableJournalEnrollment(ownerId)
      .then(() => {
        if (active) setEnrollmentLookupComplete(true);
      })
      .catch(() => {
        if (active) {
          setEnrollmentLookupError(
            'Journal enrollment could not be checked. Connect and retry before creating a Journal.',
          );
          setEnrollmentLookupComplete(true);
        }
      });
    return () => {
      active = false;
    };
  }, [enrollmentLookupAttempt, localOnlyEnrollment, ownerId, ownerWrap]);
  useEffect(() => {
    if (!jmk) {
      setProjections([]);
      return;
    }
    let active = true;
    void Promise.allSettled(
      encryptedEntries.map(async (record) => {
        const payload = record.value as import('../../db/journal-types.js').JournalEntryCiphertext;
        const aad = {
          ownerId,
          recordId: payload.entryId,
          schemaVersion: payload.projection.schemaVersion,
          keyVersion: payload.projection.keyVersion,
          dateToken: payload.dateToken,
        };
        const projection = journalEntryProjectionSchema.parse(
          await decryptJournalRecord<JournalEntryDraft['projection']>(payload.projection, jmk, {
            ...aad,
            schemaVersion: payload.projection.schemaVersion,
            recordKind: 'projection',
          }),
        );
        const body = await decryptJournalRecord<{
          generalNotes: JournalEntryDraft['generalNotes'];
          taskReflection: JournalEntryDraft['taskReflection'];
        }>(payload.body, jmk, {
          ...aad,
          schemaVersion: payload.body.schemaVersion,
          recordKind: 'body',
        });
        return { projection, generalNotes: body.generalNotes, taskReflection: body.taskReflection };
      }),
    ).then((results) => {
      if (!active) return;
      const next = results
        .filter(
          (result): result is PromiseFulfilledResult<JournalEntryDraft> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);
      setProjections(next);
      setEntryLoadWarning(
        next.length === results.length
          ? ''
          : 'One encrypted Journal entry could not be opened. Other entries remain available.',
      );
    });
    return () => {
      active = false;
    };
  }, [encryptedEntries, jmk, ownerId]);
  useEffect(() => {
    if (!jmk || !encryptedProfile) return;
    let active = true;
    void decryptJournalRecord<JournalProfile>(
      encryptedProfile.value as import('@naaseh/domain').CiphertextEnvelope,
      jmk,
      {
        ownerId,
        recordId: 'journal-profile',
        recordKind: 'profile',
        schemaVersion: 1,
        keyVersion: 1,
      },
    )
      .then((next) => {
        if (active) setProfile(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [encryptedProfile, jmk, ownerId]);
  useEffect(() => {
    if (!jmk || !encryptedCrisisPlan) {
      setCrisisPlanDocument(null);
      return;
    }
    let active = true;
    const record = encryptedCrisisPlan.value as CrisisPlanRecord;
    void unwrapCrisisPlanKeyForOwner(record.ownerWrap, jmk, record)
      .then(async (cpk) => {
        try {
          const next = await decryptCrisisPlanBody<JournalDocument>(record.body, cpk, record);
          if (active) setCrisisPlanDocument(next);
        } finally {
          zeroizeCrisisPlanKey(cpk);
        }
      })
      .catch(() => {
        if (active) setCrisisPlanDocument(null);
      });
    return () => {
      active = false;
    };
  }, [encryptedCrisisPlan, jmk, ownerId]);
  useEffect(() => {
    const match = location.pathname.match(/^\/journal\/([^/]+)$/u);
    const id = match?.[1];
    if (!id || ['new', 'settings', 'dashboard', 'recycle-bin'].includes(id)) return;
    const selected = projections.find((entry) => entry.projection.id === decodeURIComponent(id));
    if (selected) {
      setSelectedDraft(selected);
      setSection('new');
    }
  }, [projections]);
  if (!jmk && (ownerWrap === null || !enrollmentLookupComplete))
    return <p role="status">Checking encrypted Journal enrollment…</p>;
  if (!jmk && enrollmentLookupError)
    return (
      <section className="journal-unlock">
        <h1>Journal unavailable</h1>
        <p role="alert">{enrollmentLookupError}</p>
        <button type="button" onClick={() => setEnrollmentLookupAttempt((value) => value + 1)}>
          Retry
        </button>
      </section>
    );
  if (!jmk)
    return (
      <JournalUnlock
        enrolled={Boolean(ownerWrap)}
        onEnroll={async (pin) => {
          if (localOnlyEnrollment) {
            const next = generateJournalMasterKey();
            await saveLocalJournalOwnerWrap(ownerId, await wrapJournalMasterKeyWithPin(next, pin));
            setJmk(next);
          } else {
            const enrollment = await createDurableJournalEnrollment(ownerId, pin, csrfToken);
            setJmk(enrollment.jmk);
          }
        }}
        onUnlock={async (pin) => {
          if (!ownerWrap) throw new Error('Journal is not enrolled');
          setJmk(await unwrapJournalMasterKeyWithPin(ownerWrap, pin));
        }}
      />
    );
  const save = async (entry: JournalEntryDraft) => {
    const current = encryptedEntries.find((record) => record.id === entry.projection.id);
    if (!current && !(await readLocalCrisisPlan(ownerId))) {
      setSection('crisis-plans');
      throw new Error('Create a Crisis Plan before your first journal entry.');
    }
    const dateToken = await journalDateToken(jmk, entry.projection.date);
    const aad = {
      ownerId,
      recordId: entry.projection.id,
      keyVersion: 1,
      dateToken,
    };
    const projection = await encryptJournalRecord(entry.projection, jmk, {
      ...aad,
      schemaVersion: entry.projection.schemaVersion,
      recordKind: 'projection',
    });
    const body = await encryptJournalRecord(
      {
        schemaVersion: 1,
        entryId: entry.projection.id,
        generalNotes: entry.generalNotes,
        taskReflection: entry.taskReflection,
      },
      jmk,
      { ...aad, schemaVersion: 1, recordKind: 'body' },
    );
    const currentProjection = projections.find(
      (candidate) => candidate.projection.id === entry.projection.id,
    )?.projection;
    const operation =
      currentProjection?.lifecycle === 'active' && entry.projection.lifecycle === 'recycled'
        ? 'recycle'
        : currentProjection?.lifecycle === 'recycled' && entry.projection.lifecycle === 'active'
          ? 'restore'
          : 'upsert';
    await savePendingJournalEntry({
      ownerId,
      entry: { entryId: entry.projection.id, dateToken, projection, body },
      lifecycle: entry.projection.lifecycle,
      mutation: {
        id: crypto.randomUUID(),
        entityId: entry.projection.id,
        entityType: 'journalEntry',
        operation,
        baseVersion: current?.version ?? 0,
        dateToken,
        ...(current?.dateToken && current.dateToken !== dateToken
          ? { priorDateToken: current.dateToken }
          : {}),
        payload: { entryId: entry.projection.id, dateToken, projection, body },
        createdAt: new Date().toISOString(),
      },
    });
    setSection('entries');
  };
  const openEntry = (id: string) => {
    const selected = projections.find(
      (entry) => entry.projection.id === id && entry.projection.lifecycle === 'active',
    );
    if (selected) {
      setSelectedDraft(selected);
      setSection('new');
    }
  };
  const changeProfile = (next: JournalProfile) => {
    setProfile(next);
    void encryptJournalRecord(next, jmk, {
      ownerId,
      recordId: 'journal-profile',
      recordKind: 'profile',
      schemaVersion: 1,
      keyVersion: 1,
    }).then((envelope) =>
      saveEncryptedJournalProfile(ownerId, envelope, encryptedProfile?.version ?? 0),
    );
  };
  return (
    <section className="journal-page">
      <header>
        <h1>Journal</h1>
        <p>Private, encrypted daily entries</p>
        <nav aria-label="Journal navigation">
          <button
            type="button"
            aria-current={section === 'entries' ? 'page' : undefined}
            onClick={() => setSection('entries')}
          >
            Entries
          </button>
          <button
            type="button"
            aria-current={section === 'new' ? 'page' : undefined}
            onClick={() => {
              setSelectedDraft(undefined);
              void readLocalCrisisPlan(ownerId).then((plan) =>
                setSection(plan ? 'new' : 'crisis-plans'),
              );
            }}
          >
            New entry
          </button>
          <button
            type="button"
            aria-current={section === 'crisis-plans' ? 'page' : undefined}
            onClick={() => setSection('crisis-plans')}
          >
            Crisis Plans
          </button>
          <button
            type="button"
            aria-current={section === 'dashboard' ? 'page' : undefined}
            onClick={() => setSection('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            aria-current={section === 'recycle-bin' ? 'page' : undefined}
            onClick={() => setSection('recycle-bin')}
          >
            Recycle bin
          </button>
          <button
            type="button"
            aria-current={section === 'settings' ? 'page' : undefined}
            onClick={() => setSection('settings')}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => {
              zeroizeJournalKey(jmk);
              setJmk(undefined);
            }}
          >
            Lock
          </button>
        </nav>
      </header>
      {entryLoadWarning && <p role="alert">{entryLoadWarning}</p>}
      {section === 'entries' ? (
        <JournalListPage
          entries={projections
            .filter((entry) => entry.projection.lifecycle === 'active')
            .map((entry) => entry.projection)}
          open={openEntry}
        />
      ) : section === 'recycle-bin' ? (
        <JournalRecycleBinPage
          entries={projections.filter((entry) => entry.projection.lifecycle === 'recycled')}
          restore={async (entry) => {
            const projection = { ...entry.projection };
            delete projection.recycledAt;
            await save({
              ...entry,
              projection: {
                ...projection,
                schemaVersion: 2,
                lifecycle: 'active',
                updatedAt: new Date().toISOString(),
              },
            });
            setSection('entries');
          }}
        />
      ) : section === 'crisis-plans' ? (
        <CrisisPlanPage ownerId={ownerId} csrfToken={csrfToken} jmk={jmk} />
      ) : section === 'dashboard' ? (
        <JournalDashboardPage
          entries={projections
            .filter((entry) => entry.projection.lifecycle === 'active')
            .map((entry) => entry.projection)}
          suicidalSelfHarmEnabled={profile.suicidalSelfHarmEnabled}
          openEntry={openEntry}
        />
      ) : section === 'settings' ? (
        <JournalSettings
          profile={profile}
          pending={pendingProfile}
          onChange={changeProfile}
          onChangePin={async (oldPin, newPin) => {
            if (!ownerWrap) throw new Error('Journal is not enrolled');
            if (localOnlyEnrollment)
              await saveLocalJournalOwnerWrap(
                ownerId,
                await changeJournalPin(ownerWrap, oldPin, newPin),
              );
            else await changeDurableJournalPin(ownerId, ownerWrap, oldPin, newPin, csrfToken);
          }}
          onLock={() => {
            zeroizeJournalKey(jmk);
            setJmk(undefined);
          }}
        />
      ) : (
        <JournalEntryEditor
          key={selectedDraft?.projection.id ?? draft.projection.id}
          initial={selectedDraft ?? draft}
          profile={profile}
          tasks={eligibleJournalTasks(tasks, ownerId, new Date().toLocaleDateString('en-CA'))}
          crisisPlan={crisisPlanDocument}
          onSave={save}
          {...(selectedDraft
            ? {
                onRecycle: async (entry: JournalEntryDraft) => {
                  await save({
                    ...entry,
                    projection: {
                      ...entry.projection,
                      schemaVersion: 2,
                      lifecycle: 'recycled',
                      recycledAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  });
                  setSelectedDraft(undefined);
                  setSection('recycle-bin');
                },
              }
            : {})}
        />
      )}
    </section>
  );
}
