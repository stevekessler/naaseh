import type { JournalProfile } from '@naaseh/domain';
import { useState } from 'react';

export function JournalSettings({
  profile,
  pending = false,
  onChange,
  onLock,
  onChangePin,
}: {
  profile: JournalProfile;
  pending?: boolean;
  onChange: (profile: JournalProfile) => void;
  onLock: () => void;
  onChangePin?: (oldPin: string, newPin: string) => Promise<void>;
}) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinStatus, setPinStatus] = useState('');
  return (
    <section>
      <h2>Journal settings</h2>
      <label>
        <input
          type="checkbox"
          checked={profile.suicidalSelfHarmEnabled}
          onChange={(event) =>
            onChange({ ...profile, suicidalSelfHarmEnabled: event.target.checked })
          }
        />
        Show suicidal thoughts and self-harm fields
      </label>
      <label>
        <input
          type="checkbox"
          checked={profile.dbtSkillsEnabled}
          onChange={(event) => onChange({ ...profile, dbtSkillsEnabled: event.target.checked })}
        />
        Show DBT skills fields
      </label>
      <p aria-live="polite">
        {pending ? 'Settings pending synchronization' : 'Settings saved locally'}
      </p>
      {onChangePin && (
        <fieldset>
          <legend>Change Journal PIN</legend>
          <label>
            Current PIN
            <input
              type="password"
              inputMode="numeric"
              value={oldPin}
              onChange={(event) => setOldPin(event.target.value)}
            />
          </label>
          <label>
            New PIN
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(event) => setNewPin(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!/^\d{6,32}$/u.test(oldPin) || !/^\d{6,32}$/u.test(newPin)}
            onClick={() =>
              void onChangePin(oldPin, newPin)
                .then(() => {
                  setOldPin('');
                  setNewPin('');
                  setPinStatus('Journal PIN changed.');
                })
                .catch(() => setPinStatus('The Journal PIN could not be changed.'))
            }
          >
            Change PIN
          </button>
          <p aria-live="polite">{pinStatus}</p>
        </fieldset>
      )}
      <button type="button" onClick={onLock}>
        Lock Journal
      </button>
    </section>
  );
}
