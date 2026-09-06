import { useEffect, useState } from 'react';
import { journalDocumentSchema, type JournalDocument } from '@naaseh/domain';
import { JournalRichTextEditor } from './JournalRichTextEditor.js';

export const isMeaningfulCrisisPlanDocument = (document: JournalDocument) =>
  document.blocks.some((block) =>
    block.type === 'paragraph'
      ? block.children.some((run) =>
          run.type === 'text' ? run.text.trim() : run.children.some((child) => child.text.trim()),
        )
      : block.items.some((item) =>
          item.children.some((run) =>
            run.type === 'text' ? run.text.trim() : run.children.some((child) => child.text.trim()),
          ),
        ),
  );
export const shouldWarnForUnsavedCrisisPlan = (dirty: boolean) => dirty;
export function CrisisPlanEditor({
  initial,
  onSave,
}: {
  initial: JournalDocument | null;
  onSave: (document: JournalDocument) => Promise<void>;
}) {
  const [document, setDocument] = useState<JournalDocument>(
    initial ?? { version: 1, blocks: [{ type: 'paragraph', children: [] }] },
  );
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (shouldWarnForUnsavedCrisisPlan(dirty)) event.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => {
    if (
      !journalDocumentSchema.safeParse(document).success ||
      !isMeaningfulCrisisPlanDocument(document)
    ) {
      setStatus('Enter a Crisis Plan before saving.');
      return;
    }
    try {
      setStatus('Saving encrypted Crisis Plan…');
      await onSave(document);
      setDirty(false);
      setStatus('Crisis Plan saved.');
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'The Crisis Plan could not be saved. Your draft is preserved.',
      );
    }
  };
  return (
    <section>
      <h2>{initial ? 'My Crisis Plan' : 'Create your Crisis Plan'}</h2>
      <p>Your Crisis Plan is one private rich-text field. You can change it at any time.</p>
      <JournalRichTextEditor
        label="Crisis Plan"
        value={document}
        onChange={(value) => {
          setDocument(value);
          setDirty(true);
        }}
      />
      <button type="button" onClick={() => void save()}>
        Save Crisis Plan
      </button>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
