export function parseFileLinks(value: string): string[] {
  const links = value
    .split(/\r?\n/u)
    .map((link) => link.trim())
    .filter(Boolean);
  if (links.length > 10) throw new Error('Add no more than 10 file links.');
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      throw new Error(`Enter a complete HTTPS file link: ${link}`);
    }
    if (url.protocol !== 'https:') throw new Error('File links must start with https://.');
  }
  return [...new Set(links)];
}
