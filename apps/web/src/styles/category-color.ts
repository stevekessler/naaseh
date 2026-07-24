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
