import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ListSection = 'lists' | 'directory';

export function ListsNavigation({
  section,
  navigate,
}: {
  section: string;
  navigate: (section: ListSection) => void;
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
      setPosition({ top: trigger.bottom + 8, left: Math.max(16, trigger.left) });
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

  useEffect(() => setOpen(false), [section]);

  const active = section === 'lists' || section === 'directory';
  return (
    <div ref={container} className="lists-navigation">
      <button
        type="button"
        className="quiet"
        aria-label="Lists"
        aria-expanded={open}
        aria-controls="lists-navigation-links"
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => {
          if (section !== 'lists') navigate('lists');
          setOpen((value) => !value);
        }}
      >
        Lists <span aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id="lists-navigation-links"
            className="lists-navigation-links"
            style={{ ...position }}
          >
            {(
              [
                ['lists', 'My Lists'],
                ['directory', 'Global Items'],
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
