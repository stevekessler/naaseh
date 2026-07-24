import { useEffect, useState } from 'react';
import { loadCompletionSound, saveCompletionSound } from '../../db/preferences-repository.js';
export function CompletionSoundSetting() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    void loadCompletionSound().then(setEnabled);
  }, []);
  return (
    <label className="sound-setting">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          setEnabled(event.target.checked);
          void saveCompletionSound(event.target.checked);
        }}
      />
      Completion sounds
    </label>
  );
}
