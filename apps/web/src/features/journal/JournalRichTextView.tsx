import type { JournalDocument } from '@naaseh/domain';
import type { ReactNode } from 'react';

const renderRuns = (runs: JournalDocument['blocks'][number] extends never ? never : any[]) =>
  runs.map((run, index) => {
    let value: ReactNode =
      run.type === 'link' ? (
        <a href={run.href} target="_blank" rel="noopener noreferrer">
          {renderRuns(run.children)}
        </a>
      ) : (
        run.text
      );
    if (run.type === 'text')
      for (const mark of run.marks ?? []) {
        if (mark === 'bold') value = <strong>{value}</strong>;
        if (mark === 'italic') value = <em>{value}</em>;
        if (mark === 'underline') value = <u>{value}</u>;
        if (mark === 'strikethrough') value = <s>{value}</s>;
      }
    return <span key={index}>{value}</span>;
  });
export function JournalRichTextView({ document }: { document: JournalDocument }) {
  return (
    <div className="journal-document">
      {document.blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>{renderRuns(block.children)}</p>
        ) : block.type === 'ordered-list' ? (
          <ol key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderRuns(item.children)}</li>
            ))}
          </ol>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderRuns(item.children)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
