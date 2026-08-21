import type { MemoDocument } from '@naaseh/domain';
import { plainMemoDocument } from '@naaseh/domain';
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

function initialize(document: MemoDocument) {
  return () => {
    const root = $getRoot();
    root.clear();
    for (const block of document.blocks) {
      if (block.type === 'paragraph') {
        const paragraph = $createParagraphNode();
        for (const run of block.runs) {
          const node = $createTextNode(run.text);
          for (const mark of run.marks)
            node.toggleFormat(mark === 'strikethrough' ? 'strikethrough' : mark);
          paragraph.append(node);
        }
        root.append(paragraph);
      } else {
        const list = $createListNode(block.type === 'orderedList' ? 'number' : 'bullet');
        for (const item of block.items) {
          const listItem = $createListItemNode();
          for (const run of item.runs) {
            const node = $createTextNode(run.text);
            for (const mark of run.marks)
              node.toggleFormat(mark === 'strikethrough' ? 'strikethrough' : mark);
            listItem.append(node);
          }
          list.append(listItem);
        }
        root.append(list);
      }
    }
    if (!root.getChildrenSize()) root.append($createParagraphNode());
  };
}

const textRuns = (
  node:
    | ReturnType<typeof $getRoot>
    | ReturnType<typeof $createParagraphNode>
    | ReturnType<typeof $createListItemNode>,
) =>
  node.getChildren().flatMap((child) => {
    if (!$isTextNode(child)) return [];
    const marks: Array<'bold' | 'italic' | 'strikethrough'> = [];
    if (child.hasFormat('bold')) marks.push('bold');
    if (child.hasFormat('italic')) marks.push('italic');
    if (child.hasFormat('strikethrough')) marks.push('strikethrough');
    return [{ text: child.getTextContent(), marks }];
  });

function readDocument(): MemoDocument {
  const blocks: MemoDocument['blocks'] = [];
  for (const node of $getRoot().getChildren()) {
    if ($isParagraphNode(node)) blocks.push({ type: 'paragraph', runs: textRuns(node) });
    else if ($isListNode(node))
      blocks.push({
        type: node.getListType() === 'number' ? 'orderedList' : 'unorderedList',
        items: node
          .getChildren()
          .filter($isListItemNode)
          .map((item) => ({ runs: textRuns(item) })),
      });
  }
  return { version: 1, blocks };
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const format = (value: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, value);
  return (
    <div className="memo-toolbar" role="toolbar" aria-label="Memo formatting">
      <button type="button" aria-label="Bold" onClick={() => format('bold')}>
        <strong>B</strong>
      </button>
      <button type="button" aria-label="Italic" onClick={() => format('italic')}>
        <em>I</em>
      </button>
      <button type="button" aria-label="Strikethrough" onClick={() => format('strikethrough')}>
        <s>S</s>
      </button>
      <button
        type="button"
        aria-label="Bulleted list"
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        • List
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        1. List
      </button>
    </div>
  );
}

export function MemoEditor({
  value,
  onChange,
}: {
  value?: MemoDocument;
  onChange: (value: MemoDocument) => void;
}) {
  const initial = value ?? plainMemoDocument('');
  const config = {
    namespace: 'NaasehMemo',
    nodes: [ListNode, ListItemNode],
    editorState: initialize(initial),
    onError(error: Error) {
      throw error;
    },
  };
  return (
    <LexicalComposer initialConfig={config}>
      <Toolbar />
      <RichTextPlugin
        contentEditable={<ContentEditable className="memo-editor" aria-label="Memo" />}
        placeholder={<span className="memo-placeholder">Write a memo…</span>}
        ErrorBoundary={({ children }) => children}
      />
      <ListPlugin />
      <OnChangePlugin onChange={(state) => state.read(() => onChange(readDocument()))} />
    </LexicalComposer>
  );
}
