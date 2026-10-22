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
  const closeTimer = useRef<number | undefined>(undefined);
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
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openOnHover = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeAfterHover = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  const active = section === 'lists' || section === 'directory';
  return (
    <div
      ref={container}
      className="lists-navigation"
      onMouseEnter={openOnHover}
      onMouseLeave={closeAfterHover}
    >
      <button
        type="button"
        className="quiet navigation-primary"
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => {
          navigate('lists');
          setOpen(false);
        }}
      >
        Lists
      </button>
      <button
        type="button"
        className="quiet navigation-disclosure"
        aria-label="Show Lists menu"
        aria-expanded={open}
        aria-controls="lists-navigation-links"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id="lists-navigation-links"
            className="lists-navigation-links"
            style={{ ...position }}
            onMouseEnter={() => window.clearTimeout(closeTimer.current)}
            onMouseLeave={closeAfterHover}
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
