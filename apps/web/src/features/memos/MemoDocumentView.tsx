import type { MemoDocument } from '@naaseh/domain';
import type { ReactNode } from 'react';

const urlPattern = /https?:\/\/[^\s<]+/giu;

const linkedText = (text: string, key: string) => {
  const values: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(urlPattern)) {
    const index = match.index;
    if (index > start) values.push(text.slice(start, index));
    const trailing = match[0].match(/[),.;!?]+$/u)?.[0] ?? '';
    const href = trailing ? match[0].slice(0, -trailing.length) : match[0];
    values.push(
      <a key={`${key}-${index}`} href={href} target="_blank" rel="noreferrer noopener">
        {href}
      </a>,
    );
    if (trailing) values.push(trailing);
    start = index + match[0].length;
  }
  if (start < text.length) values.push(text.slice(start));
  return values.length ? values : text;
};

export function LinkifiedText({ text }: { text: string }) {
  return <>{linkedText(text, 'plain')}</>;
}

const runs = (
  values: MemoDocument['blocks'][number] extends never
    ? never
    : Array<{ text: string; marks: Array<'bold' | 'italic' | 'strikethrough'> }>,
) =>
  values.map((run, index) => {
    let value: ReactNode = linkedText(run.text, String(index));
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
