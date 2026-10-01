function displayLink(value: string, maxLength = 34) {
  try {
    const url = new URL(value);
    const compact = `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
    return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
  } catch {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  }
}

export function CompactLink({ href, className }: { href: string; className?: string }) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={href}
      onClick={(event) => event.stopPropagation()}
    >
      {displayLink(href)}
    </a>
  );
}
