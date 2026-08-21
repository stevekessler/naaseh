import { useState } from 'react';
import { memoDocumentText, plainMemoDocument, type MemoDocument } from '@naaseh/domain';
import { MemoEditor } from './MemoEditor.js';
export function HiddenMemoEditor({
  save,
}: {
  save: (memo: { text: string; document: MemoDocument }) => Promise<void>;
}) {
  const [document, setDocument] = useState(() => plainMemoDocument(''));
  return (
    <section>
      <h3>Hidden memo</h3>
      <MemoEditor value={document} onChange={setDocument} />
      <p>
        Encrypted in this browser. AWS recovery keys can recover content through the audited owner
        recovery flow.
      </p>
      <button onClick={() => save({ text: memoDocumentText(document), document })}>
        Encrypt and save
      </button>
    </section>
  );
}
