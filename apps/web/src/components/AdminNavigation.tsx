import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type AdminSection = 'admin' | 'admin-categories' | 'directory' | 'groups';

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
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 16 });
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = container.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = menu.current?.getBoundingClientRect().width ?? 224;
      setPosition({
        top: trigger.bottom + 8,
        left: Math.max(16, Math.min(trigger.left, window.innerWidth - width - 16)),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const active = ['admin', 'admin-categories', 'directory', 'groups'].includes(section);
  return (
    <div
      ref={container}
      className="admin-navigation"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget) &&
          !menu.current?.contains(event.relatedTarget)
        )
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
      {open &&
        createPortal(
          <div
            ref={menu}
            id="admin-navigation-links"
            className="admin-navigation-links"
            style={{ ...position, maxHeight: `calc(100dvh - ${position.top + 16}px)` }}
          >
            {(
              [
                ...(isAdmin
                  ? ([
                      ['admin', 'Users'],
                      ['admin-categories', 'Categories & Projects'],
                    ] as const)
                  : []),
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
          </div>,
          document.body,
        )}
    </div>
  );
}
