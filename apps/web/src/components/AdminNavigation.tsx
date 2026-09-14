import { useEffect, useRef, useState } from 'react';

type AdminSection = 'admin' | 'directory' | 'groups';

export function AdminNavigation({
  isAdmin,
  section,
  navigate,
}: {
  isAdmin: boolean;
  section: string;
  navigate: (section: AdminSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const active = ['admin', 'directory', 'groups'].includes(section);
  return (
    <div
      ref={container}
      className="admin-navigation"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        className="quiet"
        aria-expanded={open}
        aria-controls="admin-navigation-links"
        data-active={active || undefined}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen((value) => !value);
        }}
      >
        Admin <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id="admin-navigation-links" className="admin-navigation-links">
          {(
            [
              ...(isAdmin ? [['admin', 'Users and categories'] as const] : []),
              ['directory', 'Global Items'],
              ['groups', 'Groups'],
            ] as const
          ).map(([target, label]) => (
            <button
              type="button"
              className="quiet"
              key={target}
              aria-current={section === target ? 'page' : undefined}
              onClick={() => {
                navigate(target);
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
