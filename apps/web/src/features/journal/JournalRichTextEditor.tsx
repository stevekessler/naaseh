import type { JournalDocument } from '@naaseh/domain';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { $createLinkNode, $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';

const textNode = (
  run: Extract<JournalDocument['blocks'][number], { type: 'paragraph' }>['children'][number],
) => {
  if (run.type === 'link') {
    const link = $createLinkNode(run.href);
    for (const child of run.children) link.append(textNode(child));
    return link;
  }
  const node = $createTextNode(run.text);
  for (const mark of run.marks ?? []) node.toggleFormat(mark);
  return node;
};
const initialize = (document: JournalDocument) => () => {
  const root = $getRoot();
  root.clear();
  for (const block of document.blocks) {
    if (block.type === 'paragraph') {
      const node = $createParagraphNode();
      node.append(...block.children.map(textNode));
      root.append(node);
    } else {
      const list = $createListNode(block.type === 'ordered-list' ? 'number' : 'bullet');
      for (const item of block.items) {
        const child = $createListItemNode();
        child.append(...item.children.map(textNode));
        list.append(child);
      }
      root.append(list);
    }
  }
  if (!root.getChildrenSize()) root.append($createParagraphNode());
};
const runs = (node: any): any[] =>
  node.getChildren().flatMap((child: any) => {
    if ($isLinkNode(child)) return [{ type: 'link', href: child.getURL(), children: runs(child) }];
    if (!$isTextNode(child)) return [];
    const marks = (['bold', 'italic', 'underline', 'strikethrough'] as const).filter((mark) =>
      child.hasFormat(mark),
    );
    return [{ type: 'text', text: child.getTextContent(), ...(marks.length ? { marks } : {}) }];
  });
const readDocument = (): JournalDocument => {
  const blocks: JournalDocument['blocks'][number][] = [];
  for (const node of $getRoot().getChildren()) {
    if ($isParagraphNode(node)) blocks.push({ type: 'paragraph', children: runs(node) });
    else if ($isListNode(node))
      blocks.push({
        type: node.getListType() === 'number' ? 'ordered-list' : 'unordered-list',
        items: node
          .getChildren()
          .filter($isListItemNode)
          .map((item) => ({ children: runs(item) })),
      });
  }
  return { version: 1, blocks };
};
function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const format = (value: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, value);
  const addLink = () => {
    const href = window.prompt('HTTPS link');
    if (href && href.startsWith('https://')) editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
  };
  return (
    <div role="toolbar" aria-label="Journal formatting">
      {(['bold', 'italic', 'underline', 'strikethrough'] as const).map((mark) => (
        <button key={mark} type="button" onClick={() => format(mark)}>
          {mark}
        </button>
      ))}
      <button
        type="button"
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        Bulleted list
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        Numbered list
      </button>
      <button type="button" onClick={addLink}>
        Link
      </button>
    </div>
  );
}
export function JournalRichTextEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: JournalDocument | null;
  onChange: (value: JournalDocument) => void;
}) {
  const initial = value ?? { version: 1, blocks: [{ type: 'paragraph', children: [] }] };
  return (
    <LexicalComposer
      initialConfig={{
        namespace: `Journal-${label}`,
        nodes: [ListNode, ListItemNode, LinkNode],
        editorState: initialize(initial),
        onError: (error: Error) => {
          throw error;
        },
      }}
    >
      <Toolbar />
      <RichTextPlugin
        contentEditable={<ContentEditable className="memo-editor" aria-label={label} />}
        placeholder={<span>Write an optional reflection…</span>}
        ErrorBoundary={({ children }) => children}
      />
      <ListPlugin />
      <OnChangePlugin onChange={(state) => state.read(() => onChange(readDocument()))} />
    </LexicalComposer>
  );
}
