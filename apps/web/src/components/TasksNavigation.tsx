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
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const openOnHover = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeAfterHover = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  const active = ['tasks', 'stack', 'archive', 'dashboard'].includes(section);
  return (
    <div
      ref={container}
      className="tasks-navigation"
      onMouseEnter={openOnHover}
      onMouseLeave={closeAfterHover}
    >
      <button
        type="button"
        className="quiet navigation-primary"
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => {
          navigate('tasks');
          setOpen(false);
        }}
      >
        Tasks
      </button>
      <button
        type="button"
        className="quiet navigation-disclosure"
        aria-label="Show Tasks menu"
        aria-expanded={open}
        aria-controls="tasks-navigation-links"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id="tasks-navigation-links"
            className="tasks-navigation-links"
            style={{ ...position }}
            onMouseEnter={() => window.clearTimeout(closeTimer.current)}
            onMouseLeave={closeAfterHover}
          >
            {(
              [
                ['tasks', 'My Tasks'],
                ['stack', 'Personal Stack'],
                ['dashboard', 'Task Reporting'],
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
