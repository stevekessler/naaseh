import { useState } from 'react';
export function HiddenMemoEditor({ save }: { save: (memo: string) => Promise<void> }) {
  const [memo, setMemo] = useState('');
  return (
    <section>
      <label>
        Hidden memo
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      <p>
        Encrypted in this browser. AWS recovery keys can recover content through the audited owner
        recovery flow.
      </p>
      <button onClick={() => save(memo)}>Encrypt and save</button>
    </section>
  );
}
