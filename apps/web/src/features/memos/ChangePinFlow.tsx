import { type FormEvent, useState } from 'react';
import {
  decodePinSalt,
  rewrapDekForPinChange,
  validatePin,
  type PinWrappedDek,
} from '../../crypto/pin-wrap.js';

export interface PinChangePackage {
  memoId: string;
  memoCiphertext: string;
  pinSalt: string;
  pinWrap: PinWrappedDek;
}

export interface MigratedPinPackage extends PinChangePackage {
  pinSalt: string;
  pinWrap: PinWrappedDek & { version: string };
}

export async function migratePinPackages(
  packages: readonly PinChangePackage[],
  oldPin: string,
  newPin: string,
  newVersion: string,
): Promise<MigratedPinPackage[]> {
  validatePin(oldPin);
  validatePin(newPin);
  if (oldPin === newPin) throw new Error('Choose a PIN different from the current PIN.');

  // Finish every cryptographic operation before persistence so a wrong old PIN
  // cannot leave only part of the user's hidden memos migrated.
  return Promise.all(
    packages.map(async (pkg) => {
      const next = await rewrapDekForPinChange(
        pkg.pinWrap,
        oldPin,
        decodePinSalt(pkg.pinSalt),
        newPin,
        newVersion,
      );
      return {
        ...pkg,
        memoCiphertext: pkg.memoCiphertext,
        pinSalt: next.salt,
        pinWrap: {
          version: next.version,
          algorithm: next.algorithm,
          iv: next.iv,
          ciphertext: next.ciphertext,
        },
      };
    }),
  );
}

export function ChangePinFlow({
  packages,
  persist,
  nextVersion,
}: {
  packages: readonly PinChangePackage[];
  persist: (packages: MigratedPinPackage[]) => Promise<void>;
  nextVersion: string;
}) {
  const [status, setStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'working') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const oldPin = String(data.get('oldPin') ?? '');
    const newPin = String(data.get('newPin') ?? '');
    const confirmation = String(data.get('confirmPin') ?? '');
    setStatus('working');
    setMessage('');
    try {
      if (newPin !== confirmation) throw new Error('The new PIN confirmation does not match.');
      const migrated = await migratePinPackages(packages, oldPin, newPin, nextVersion);
      await persist(migrated);
      form.reset();
      setStatus('success');
      setMessage(
        `PIN changed for ${migrated.length} hidden memo${migrated.length === 1 ? '' : 's'}.`,
      );
    } catch {
      setStatus('error');
      setMessage('The PIN could not be changed. Check the current PIN and try again.');
    }
  }

  return (
    <form aria-label="Change hidden memo PIN" onSubmit={(event) => void submit(event)}>
      <label>
        Current PIN
        <input
          name="oldPin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
          pattern="[0-9]{6,32}"
        />
      </label>
      <label>
        New PIN
        <input
          name="newPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          pattern="[0-9]{6,32}"
        />
      </label>
      <label>
        Confirm new PIN
        <input
          name="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          pattern="[0-9]{6,32}"
        />
      </label>
      <button disabled={status === 'working'}>
        {status === 'working' ? 'Changing PIN…' : 'Change PIN'}
      </button>
      {message && <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
    </form>
  );
}
