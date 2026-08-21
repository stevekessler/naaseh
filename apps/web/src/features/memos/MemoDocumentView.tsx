import type { MemoDocument } from '@naaseh/domain';
import type { ReactNode } from 'react';

const runs = (
  values: MemoDocument['blocks'][number] extends never
    ? never
    : Array<{ text: string; marks: Array<'bold' | 'italic' | 'strikethrough'> }>,
) =>
  values.map((run, index) => {
    let value: ReactNode = run.text;
    if (run.marks.includes('bold')) value = <strong>{value}</strong>;
    if (run.marks.includes('italic')) value = <em>{value}</em>;
    if (run.marks.includes('strikethrough')) value = <s>{value}</s>;
    return <span key={index}>{value}</span>;
  });

export function MemoDocumentView({ document }: { document: MemoDocument }) {
  return (
    <div className="memo-document">
      {document.blocks.map((block, index) => {
        if (block.type === 'paragraph') return <p key={index}>{runs(block.runs)}</p>;
        const Tag = block.type === 'orderedList' ? 'ol' : 'ul';
        return (
          <Tag key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{runs(item.runs)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
