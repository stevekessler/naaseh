import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TaskSection = 'tasks' | 'stack' | 'dashboard' | 'archive';

export function TasksNavigation({
  section,
  navigate,
}: {
  section: string;
  navigate: (section: TaskSection) => void;
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
  const active = ['tasks', 'stack', 'archive', 'dashboard'].includes(section);
  return (
    <div ref={container} className="tasks-navigation">
      <button
        type="button"
        className="quiet"
        aria-expanded={open}
        aria-controls="tasks-navigation-links"
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => setOpen((value) => !value)}
      >
        Tasks <span aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id="tasks-navigation-links"
            className="tasks-navigation-links"
            style={{ ...position }}
          >
            {(
              [
                ['tasks', 'My Tasks'],
                ['stack', 'Personal Stack'],
                ['dashboard', 'Completed Tasks'],
                ['archive', 'Archive'],
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
