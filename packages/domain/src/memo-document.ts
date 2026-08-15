import { z } from 'zod';

export const memoMarkSchema = z.enum(['bold', 'italic', 'strikethrough']);
const memoRunSchema = z
  .object({
    text: z.string().max(20_000),
    marks: z.array(memoMarkSchema).max(3).default([]),
  })
  .strict();
const paragraphSchema = z
  .object({ type: z.literal('paragraph'), runs: z.array(memoRunSchema).max(2_000) })
  .strict();
const listItemSchema = z.object({ runs: z.array(memoRunSchema).max(2_000) }).strict();
const listSchema = z
  .object({
    type: z.enum(['orderedList', 'unorderedList']),
    items: z.array(listItemSchema).max(1_000),
  })
  .strict();
export const memoDocumentSchema = z
  .object({
    version: z.literal(1),
    blocks: z.array(z.union([paragraphSchema, listSchema])).max(2_000),
  })
  .strict()
  .superRefine((document, context) => {
    if (memoDocumentText(document).length > 20_000)
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'Memo text cannot exceed 20,000 characters.',
      });
  });
export type MemoDocument = z.infer<typeof memoDocumentSchema>;

const canonicalMarks = (marks: readonly z.infer<typeof memoMarkSchema>[]) =>
  [...new Set(marks)].sort(
    (left, right) =>
      ['bold', 'italic', 'strikethrough'].indexOf(left) -
      ['bold', 'italic', 'strikethrough'].indexOf(right),
  );

const normalizeRuns = (
  runs: ReadonlyArray<{
    text: string;
    marks?: Array<z.infer<typeof memoMarkSchema>> | undefined;
  }>,
) => {
  const result: Array<{ text: string; marks: Array<z.infer<typeof memoMarkSchema>> }> = [];
  for (const run of runs) {
    if (!run.text) continue;
    const marks = canonicalMarks(run.marks ?? []);
    const prior = result.at(-1);
    if (prior && JSON.stringify(prior.marks) === JSON.stringify(marks)) prior.text += run.text;
    else result.push({ text: run.text, marks });
  }
  return result;
};

export function normalizeMemoDocument(input: z.input<typeof memoDocumentSchema>): MemoDocument {
  return memoDocumentSchema.parse({
    version: 1,
    blocks: input.blocks.map((block) =>
      block.type === 'paragraph'
        ? { type: 'paragraph', runs: normalizeRuns(block.runs) }
        : {
            type: block.type,
            items: block.items.map((item) => ({ runs: normalizeRuns(item.runs) })),
          },
    ),
  });
}

export function memoDocumentText(document: z.input<typeof memoDocumentSchema>) {
  return document.blocks
    .flatMap((block) => {
      if (block.type === 'paragraph') return block.runs.map((run) => run.text).join('');
      return block.items.map(
        (item, index) =>
          `${block.type === 'orderedList' ? `${index + 1}.` : '•'} ${item.runs.map((run) => run.text).join('')}`,
      );
    })
    .join('\n');
}

export const plainMemoDocument = (text: string): MemoDocument =>
  memoDocumentSchema.parse({
    version: 1,
    blocks: [{ type: 'paragraph', runs: [{ text, marks: [] }] }],
  });
