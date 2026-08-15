import type { PostItColor, Task } from '@naaseh/domain';

const hex = (value: string) => value.match(/^#([0-9a-f]{6})$/i)?.[1];
export function categoryForeground(background: string) {
  const value = hex(background) ?? 'fff2a8';
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  const r = channels[0]!,
    g = channels[1]!,
    b = channels[2]!;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { background: `#${value}`, foreground: luminance > 0.55 ? '#102b49' : '#ffffff' };
}

export const postItPalette: Readonly<
  Record<PostItColor, { background: string; foreground: string }>
> = {
  yellow: { background: '#fff2a8', foreground: '#102b49' },
  pink: { background: '#f8c8dc', foreground: '#102b49' },
  blue: { background: '#bde0fe', foreground: '#102b49' },
  green: { background: '#cdeccf', foreground: '#102b49' },
  purple: { background: '#ddd1f5', foreground: '#102b49' },
  orange: { background: '#ffd1a3', foreground: '#102b49' },
};

export function resolvePostItPalette(task: Pick<Task, 'postItColor'>, categoryColor?: string) {
  if (task.postItColor) return postItPalette[task.postItColor];
  return categoryForeground(categoryColor ?? '#fff2a8');
}
