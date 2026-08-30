import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrisisPlanRecord, CrisisPlanShare, JournalDocument } from '@naaseh/domain';
import {
  createRecipientCpkGrant,
  decryptCrisisPlanBody,
  generateCrisisPlanContentKey,
  unwrapCrisisPlanKeyForOwner,
  verifySharingKeyRegistry,
  wrapCrisisPlanKeyForOwner,
  encryptCrisisPlanBody,
  zeroizeCrisisPlanKey,
} from '../../crypto/crisis-plan-crypto.js';
import {
  acknowledgeCrisisPlanAccessIntent,
  acknowledgeCrisisPlanConflict,
  listCrisisPlanAccessIntents,
  listCrisisPlanConflicts,
  queueCrisisPlanAccessIntent,
  readLocalCrisisPlan,
  savePendingCrisisPlan,
  storeAcknowledgedCrisisPlan,
  type CrisisPlanConflict,
} from '../../db/crisis-plan-repository.js';
import { CrisisPlanEditor } from './CrisisPlanEditor.js';
import { CrisisPlanShareManager } from './CrisisPlanShareManager.js';
import {
  createCrisisPlanShare,
  fetchRemoteCrisisPlan,
  fetchSharingKeyRegistry,
  listCrisisPlanShares,
  listSharedCrisisPlans,
  openSharedCrisisPlan,
  removeSharedCrisisPlanAccess,
  revokeCrisisPlanShare,
  rotateCrisisPlanAccess,
  searchCrisisPlanUsers,
  type CrisisPlanActiveUser,
} from './crisis-plan-client.js';
import { SharedCrisisPlanView } from './SharedCrisisPlanView.js';

export function CrisisPlanPage({
  ownerId,
  csrfToken,
  jmk,
}: {
  ownerId: string;
  csrfToken: string;
  jmk: Uint8Array;
}) {
  const [record, setRecord] = useState<CrisisPlanRecord>();
  const [document, setDocument] = useState<JournalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState<CrisisPlanShare[]>([]);
  const [tab, setTab] = useState<'mine' | 'shared'>(() =>
    location.pathname.includes('/crisis-plans/shared') ? 'shared' : 'mine',
  );
  const [sharedPlans, setSharedPlans] = useState<
    Array<{ planId: string; owner: CrisisPlanActiveUser; version: number; keyGeneration: number }>
  >([]);
  const [selectedSharedPlanId, setSelectedSharedPlanId] = useState(
    () => location.pathname.match(/\/crisis-plans\/shared\/([^/]+)/u)?.[1],
  );
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingRecipientIds, setPendingRecipientIds] = useState<string[]>([]);
  const [conflict, setConflict] = useState<CrisisPlanConflict>();
  const drainingAccessIntents = useRef(false);
  const displayOwnerRecord = useCallback(
    async (next: CrisisPlanRecord) => {
      const cpk = await unwrapCrisisPlanKeyForOwner(next.ownerWrap, jmk, next);
      try {
        const plain = await decryptCrisisPlanBody<JournalDocument>(next.body, cpk, next);
        setRecord(next);
        setDocument(plain);
      } finally {
        zeroizeCrisisPlanKey(cpk);
      }
    },
    [jmk],
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [row, conflicts] = await Promise.all([
        readLocalCrisisPlan(ownerId),
        listCrisisPlanConflicts(ownerId),
      ]);
      if (active) setConflict(conflicts[0]);
      let current = row?.value as CrisisPlanRecord | undefined;
      if (current && active) await displayOwnerRecord(current);
      if (navigator.onLine && !conflicts.length) {
        const remote = await fetchRemoteCrisisPlan().catch(() => undefined);
        if (remote && (!current || remote.version > current.version)) {
          current = remote;
          await storeAcknowledgedCrisisPlan(ownerId, remote);
          if (active) await displayOwnerRecord(remote);
        }
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      setDocument(null);
    };
  }, [displayOwnerRecord, ownerId]);
  useEffect(() => {
    if (!record || !navigator.onLine) return;
    void listCrisisPlanShares()
      .then((value) => {
        setShares(value.shares);
        setRecord((current) =>
          current ? { ...current, rotationState: value.rotationState } : current,
        );
      })
      .catch(() => undefined);
  }, [record?.planId]);
  useEffect(() => {
    if (tab !== 'shared' || !navigator.onLine) return;
    void listSharedCrisisPlans()
      .then((value) => setSharedPlans(value.plans))
      .catch(() => setSharedPlans([]));
  }, [tab]);
  const search = useCallback(
    async (query: string) => (await searchCrisisPlanUsers(query)).users,
    [],
  );
  const share = useCallback(
    async (user: CrisisPlanActiveUser) => {
      if (!record) throw new Error('Save the Crisis Plan before sharing.');
      const registry = await fetchSharingKeyRegistry();
      if (!(await verifySharingKeyRegistry(registry)))
        throw new Error('The Crisis Plan sharing key could not be verified. Try again later.');
      const cpk = await unwrapCrisisPlanKeyForOwner(record.ownerWrap, jmk, record);
      try {
        const publicKey = Uint8Array.from(
          atob(
            registry.publicKeySpki
              .replaceAll('-', '+')
              .replaceAll('_', '/')
              .padEnd(Math.ceil(registry.publicKeySpki.length / 4) * 4, '='),
          ),
          (character) => character.charCodeAt(0),
        );
        const current = shares.find((value) => value.recipientId === user.id);
        const grant = await createRecipientCpkGrant(cpk, publicKey, {
          ownerId,
          planId: record.planId,
          recipientId: user.id,
          shareVersion: (current?.version ?? 0) + 1,
          keyGeneration: record.keyGeneration,
          sharingKeyVersion: registry.keyVersion,
        });
        const created = await createCrisisPlanShare(user.id, record.version, grant, csrfToken);
        setShares((values) => [
          ...values.filter((value) => value.recipientId !== user.id),
          created,
        ]);
      } finally {
        zeroizeCrisisPlanKey(cpk);
      }
    },
    [csrfToken, jmk, ownerId, record, shares],
  );
  const rotateAccess = useCallback(
    async (revokedRecipientId?: string) => {
      if (!record || !document) throw new Error('Load the Crisis Plan before rotating access.');
      if (!navigator.onLine)
        throw new Error(
          'Connect to rotate access. Existing remote access may continue until rotation succeeds.',
        );
      const registry = await fetchSharingKeyRegistry();
      if (!(await verifySharingKeyRegistry(registry)))
        throw new Error('The Crisis Plan sharing key could not be verified. Try again later.');
      const cpk = generateCrisisPlanContentKey();
      try {
        const keyGeneration = record.keyGeneration + 1;
        const metadata = { ownerId, planId: record.planId, keyGeneration };
        const body = await encryptCrisisPlanBody(document, cpk, metadata);
        const ownerWrap = await wrapCrisisPlanKeyForOwner(cpk, jmk, metadata);
        const publicKey = Uint8Array.from(
          atob(
            registry.publicKeySpki
              .replaceAll('-', '+')
              .replaceAll('_', '/')
              .padEnd(Math.ceil(registry.publicKeySpki.length / 4) * 4, '='),
          ),
          (character) => character.charCodeAt(0),
        );
        const remaining = shares.filter(
          (value) => value.state === 'active' && value.recipientId !== revokedRecipientId,
        );
        const grants = await Promise.all(
          remaining.map(async (current) => ({
            recipientId: current.recipientId,
            grant: await createRecipientCpkGrant(cpk, publicKey, {
              ownerId,
              planId: record.planId,
              recipientId: current.recipientId,
              shareVersion: current.version + 1,
              keyGeneration,
              sharingKeyVersion: registry.keyVersion,
            }),
          })),
        );
        const request = {
          mutationId: crypto.randomUUID(),
          baseVersion: record.version,
          keyGeneration,
          body,
          ownerWrap,
          grants,
        };
        const result = revokedRecipientId
          ? await revokeCrisisPlanShare(revokedRecipientId, request, csrfToken)
          : await rotateCrisisPlanAccess(request, csrfToken);
        await storeAcknowledgedCrisisPlan(ownerId, result.plan);
        setRecord(result.plan);
        setShares(result.shares);
      } finally {
        zeroizeCrisisPlanKey(cpk);
      }
    },
    [csrfToken, document, jmk, ownerId, record, shares],
  );
  const revoke = useCallback(
    async (recipientId: string) => {
      if (!record) throw new Error('Load the Crisis Plan before changing access.');
      if (!online) {
        await queueCrisisPlanAccessIntent(ownerId, record.planId, recipientId);
        setPendingRecipientIds((values) => [...new Set([...values, recipientId])]);
        return;
      }
      await rotateAccess(recipientId);
    },
    [online, ownerId, record, rotateAccess],
  );
  useEffect(() => {
    if (!online || drainingAccessIntents.current) return;
    let active = true;
    drainingAccessIntents.current = true;
    void listCrisisPlanAccessIntents(ownerId)
      .then(async (intents) => {
        if (active) setPendingRecipientIds(intents.map((intent) => intent.recipientId));
        for (const intent of intents) {
          if (!active) break;
          try {
            await rotateAccess(intent.recipientId);
            await acknowledgeCrisisPlanAccessIntent(intent.id);
            if (active)
              setPendingRecipientIds((values) =>
                values.filter((value) => value !== intent.recipientId),
              );
          } catch {
            break;
          }
        }
      })
      .finally(() => {
        drainingAccessIntents.current = false;
      });
    return () => {
      active = false;
    };
  }, [online, ownerId, rotateAccess]);
  const selectedShared = sharedPlans.find((value) => value.planId === selectedSharedPlanId);
  const loadSelectedShared = useCallback(() => {
    if (!selectedShared) return Promise.reject(new Error('The shared Crisis Plan is unavailable.'));
    return openSharedCrisisPlan(selectedShared.planId);
  }, [selectedShared?.planId]);
  const removeSelectedShared = useCallback(() => {
    if (!selectedShared) return Promise.reject(new Error('The shared Crisis Plan is unavailable.'));
    return removeSharedCrisisPlanAccess(selectedShared.planId, csrfToken);
  }, [csrfToken, selectedShared?.planId]);
  const useServerConflictVersion = useCallback(async () => {
    if (!conflict) return;
    await storeAcknowledgedCrisisPlan(ownerId, conflict.remote);
    await acknowledgeCrisisPlanConflict(conflict.id);
    await displayOwnerRecord(conflict.remote);
    setConflict(undefined);
  }, [conflict, displayOwnerRecord, ownerId]);
  const keepLocalConflictVersion = useCallback(async () => {
    if (!conflict || !record) return;
    const now = new Date().toISOString();
    const next: CrisisPlanRecord = {
      ...record,
      version: conflict.remote.version + 1,
      createdAt: conflict.remote.createdAt,
      updatedAt: now,
    };
    const mutationId = crypto.randomUUID() as import('@naaseh/domain').CrisisPlanMutation['id'];
    await savePendingCrisisPlan(ownerId, next, {
      id: mutationId,
      entityType: 'crisisPlan',
      operation: 'replace',
      planId: next.planId,
      baseVersion: conflict.remote.version,
      payload: {
        planId: next.planId,
        version: next.version,
        keyGeneration: next.keyGeneration,
        rotationState: next.rotationState,
        body: next.body,
        ownerWrap: next.ownerWrap,
      },
      createdAt: now,
    });
    await acknowledgeCrisisPlanConflict(conflict.id);
    setRecord(next);
    setConflict(undefined);
  }, [conflict, ownerId, record]);
  if (loading) return <p role="status">Loading encrypted Crisis Plan…</p>;
  const save = async (nextDocument: JournalDocument) => {
    const planId = record?.planId ?? (crypto.randomUUID() as CrisisPlanRecord['planId']);
    const keyGeneration = record?.keyGeneration ?? 1;
    const cpk = record
      ? await unwrapCrisisPlanKeyForOwner(record.ownerWrap, jmk, record)
      : generateCrisisPlanContentKey();
    try {
      const body = await encryptCrisisPlanBody(nextDocument, cpk, {
        ownerId,
        planId,
        keyGeneration,
      });
      const ownerWrap = await wrapCrisisPlanKeyForOwner(cpk, jmk, {
        ownerId,
        planId,
        keyGeneration,
      });
      const now = new Date().toISOString();
      const next: CrisisPlanRecord = {
        planId,
        ownerId,
        version: record ? record.version + 1 : 1,
        keyGeneration,
        rotationState: record?.rotationState ?? 'current',
        body,
        ownerWrap,
        createdAt: record?.createdAt ?? now,
        updatedAt: now,
      };
      const mutationId = crypto.randomUUID() as import('@naaseh/domain').CrisisPlanMutation['id'];
      await savePendingCrisisPlan(ownerId, next, {
        id: mutationId,
        entityType: 'crisisPlan',
        operation: record ? 'replace' : 'create',
        planId,
        baseVersion: record?.version ?? 0,
        payload: {
          planId,
          version: next.version,
          keyGeneration,
          rotationState: next.rotationState,
          body,
          ownerWrap,
        },
        createdAt: now,
      });
      setRecord(next);
      setDocument(nextDocument);
    } finally {
      zeroizeCrisisPlanKey(cpk);
    }
  };
  return (
    <>
      <nav aria-label="Crisis Plans tabs">
        <button
          type="button"
          aria-current={tab === 'mine' ? 'page' : undefined}
          onClick={() => {
            setTab('mine');
            setSelectedSharedPlanId(undefined);
          }}
        >
          My Crisis Plan
        </button>
        <button
          type="button"
          aria-current={tab === 'shared' ? 'page' : undefined}
          onClick={() => setTab('shared')}
        >
          Shared with me
        </button>
      </nav>
      {tab === 'mine' ? (
        <>
          {conflict && (
            <section role="alert">
              <h2>Resolve Crisis Plan changes</h2>
              <p>
                This Crisis Plan changed on another device. Both encrypted versions were preserved.
              </p>
              <button type="button" onClick={() => void keepLocalConflictVersion()}>
                Keep this device&apos;s version
              </button>
              <button type="button" onClick={() => void useServerConflictVersion()}>
                Use the server version
              </button>
            </section>
          )}
          <CrisisPlanEditor initial={document} onSave={save} />
          {record && (
            <CrisisPlanShareManager
              online={online}
              shares={shares}
              pendingRecipientIds={pendingRecipientIds}
              rotationRequired={record.rotationState === 'rotation_required'}
              search={search}
              onShare={share}
              onRevoke={revoke}
              onRotate={() => rotateAccess()}
            />
          )}
        </>
      ) : selectedShared ? (
        <SharedCrisisPlanView
          ownerName={selectedShared.owner.displayName}
          load={loadSelectedShared}
          removeAccess={removeSelectedShared}
        />
      ) : (
        <section>
          <h2>Shared Crisis Plans</h2>
          {!online ? (
            <p role="status">Shared Crisis Plans require an internet connection.</p>
          ) : sharedPlans.length ? (
            <ul>
              {sharedPlans.map((value) => (
                <li key={value.planId}>
                  <button type="button" onClick={() => setSelectedSharedPlanId(value.planId)}>
                    {value.owner.displayName}&apos;s Crisis Plan
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No Crisis Plans have been shared with you.</p>
          )}
        </section>
      )}
    </>
  );
}
