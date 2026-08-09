import { useEffect, useRef, useState } from 'react';
import { createMemoCiphertext, decryptMemo } from '../../crypto/hidden-memo.js';
import { derivePinKey, unwrapDekWithPin, wrapDekWithPin } from '../../crypto/pin-wrap.js';
import { recoverMemoDek } from '../../crypto/pin-recovery-client.js';
import { ChangePinFlow, type PinChangePackage } from './ChangePinFlow.js';
import { UnlockMemoDialog } from './UnlockMemoDialog.js';

interface HarnessMemo extends PinChangePackage {
  iv: string;
  aad: string;
}

const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const deterministicDekBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

/** Test-build-only host for exercising the real browser cryptography in Playwright. */
export function HiddenMemoTestHarness() {
  const [memo, setMemo] = useState<HarnessMemo>();
  const [plaintext, setPlaintext] = useState('');
  const [showUnlock, setShowUnlock] = useState(true);
  const [showPinChange, setShowPinChange] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const inactivityTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const deterministicDek = await crypto.subtle.importKey(
        'raw',
        deterministicDekBytes,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt'],
      );
      const encrypted = await createMemoCiphertext(
        'task-test',
        'memo-test',
        'Private test memo',
        deterministicDek,
      );
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await derivePinKey('246810', salt);
      setMemo({
        memoId: 'memo-test',
        memoCiphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        aad: encrypted.aad,
        pinSalt: encode(salt),
        pinWrap: await wrapDekWithPin(encrypted.dek, key),
      });
    })();
  }, []);

  useEffect(
    () => () => {
      if (inactivityTimer.current !== undefined) window.clearTimeout(inactivityTimer.current);
    },
    [],
  );

  function clearInactivityTimer() {
    if (inactivityTimer.current === undefined) return;
    window.clearTimeout(inactivityTimer.current);
    inactivityTimer.current = undefined;
  }

  function lock() {
    clearInactivityTimer();
    setPlaintext('');
    setShowUnlock(true);
    setShowPinChange(false);
  }

  async function reveal(dek: CryptoKey) {
    if (!memo) return;
    clearInactivityTimer();
    setPlaintext(
      await decryptMemo({ ciphertext: memo.memoCiphertext, iv: memo.iv, aad: memo.aad }, dek),
    );
    setShowUnlock(false);
    // The short duration lets browser automation prove the same inactivity-lock path.
    inactivityTimer.current = window.setTimeout(lock, 1_500);
  }

  if (!memo) return <p role="status">Preparing hidden memo…</p>;
  return (
    <main>
      <h1>Hidden memo browser validation</h1>
      {showUnlock ? (
        <UnlockMemoDialog
          unlock={(pin) =>
            void (async () => {
              const salt = Uint8Array.from(atob(memo.pinSalt), (character) =>
                character.charCodeAt(0),
              );
              await reveal(await unwrapDekWithPin(memo.pinWrap, await derivePinKey(pin, salt)));
            })()
          }
          recover={() => {
            setShowUnlock(false);
            setRecoveryMessage('Enter your account password below to recover online.');
          }}
        />
      ) : (
        <section aria-label="Unlocked hidden memo">
          <p>{plaintext}</p>
          <button onClick={lock}>Lock memo</button>
          <button onClick={() => setShowPinChange(true)}>Change hidden memo PIN</button>
        </section>
      )}
      {showPinChange && (
        <ChangePinFlow
          packages={[memo]}
          nextVersion="pin-v2"
          persist={async ([next]) => {
            if (next) setMemo({ ...memo, ...next });
            lock();
          }}
        />
      )}
      {recoveryMessage && (
        <form
          aria-label="Recover hidden memo"
          onSubmit={(event) => {
            event.preventDefault();
            const password = String(new FormData(event.currentTarget).get('password') ?? '');
            void recoverMemoDek('task-test', password, 'Forgotten PIN', 'test-csrf')
              .then(async (dek) => {
                await reveal(dek);
                setRecoveryMessage('Memo recovered successfully.');
              })
              .catch((error: unknown) =>
                setRecoveryMessage(error instanceof Error ? error.message : 'Recovery failed.'),
              );
          }}
        >
          <label>
            Account password
            <input name="password" type="password" required />
          </label>
          <button>Recover memo</button>
          <p role="status">{recoveryMessage}</p>
        </form>
      )}
    </main>
  );
}
