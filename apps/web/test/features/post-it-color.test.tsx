import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import { TaskForm } from '../../src/features/tasks/TaskForm.js';
import { PostItNote } from '../../src/features/postit/PostItNote.js';
import { postItPalette, resolvePostItPalette } from '../../src/styles/category-color.js';

describe('post-it color controls', () => {
  it('renders labeled radio swatches with the durable color checked', () => {
    const task = createTask({ label: 'Colored note', postItColor: 'green' }, 'owner');
    const html = renderToStaticMarkup(<TaskForm task={task} save={vi.fn()} />);
    for (const label of ['Yellow', 'Pink', 'Blue', 'Green', 'Purple', 'Orange'])
      expect(html).toContain(label);
    expect(html).toMatch(/checked="" value="green"/);
    expect(html).toContain('Use category color');
  });

  it('resolves explicit color before category color and yellow by default', () => {
    expect(resolvePostItPalette({ postItColor: 'pink' }, '#000000')).toEqual(postItPalette.pink);
    expect(resolvePostItPalette({}, '#000000').background).toBe('#000000');
    expect(resolvePostItPalette({}).background).toBe(postItPalette.yellow.background);
    const task = createTask({ label: 'Blue note', postItColor: 'blue' }, 'owner');
    const html = renderToStaticMarkup(
      <PostItNote task={task} color="#000000" complete={() => undefined} />,
    );
    expect(html).toContain(`background:${postItPalette.blue.background}`);
    expect(html).toContain('data-post-it-color="blue"');
  });

  it('uses text labels and a high-contrast foreground for every fixed swatch', () => {
    for (const palette of Object.values(postItPalette)) expect(palette.foreground).toBe('#102b49');
  });
});
