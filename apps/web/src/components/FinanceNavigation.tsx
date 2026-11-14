import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FinanceRoute } from '../app/router.js';

const destinations: ReadonlyArray<[FinanceRoute, string]> = [
  [{ section: 'finance', view: 'dashboard' }, 'Dashboard'],
  [{ section: 'finance', view: 'accounts' }, 'Accounts'],
  [{ section: 'finance', view: 'account-new' }, 'New Account'],
  [{ section: 'finance', view: 'transactions' }, 'Transactions'],
  [{ section: 'finance', view: 'upcoming-expenses' }, 'Upcoming Expenses'],
  [{ section: 'finance', view: 'budgets' }, 'Budgets'],
  [{ section: 'finance', view: 'categories' }, 'Categories'],
  [{ section: 'finance', view: 'merchants' }, 'Merchants'],
  [{ section: 'finance', view: 'receipts' }, 'Receipts'],
  [{ section: 'finance', view: 'reports' }, 'Reports'],
];

export function FinanceNavigation({
  active,
  navigate,
}: {
  active: boolean;
  navigate: (route: FinanceRoute) => void;
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
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openOnHover = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeAfterHover = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  const go = (route: FinanceRoute) => {
    navigate(route);
    setOpen(false);
  };

  return (
    <div
      ref={container}
      className="finance-navigation"
      onMouseEnter={openOnHover}
      onMouseLeave={closeAfterHover}
    >
      <button
        type="button"
        className="quiet navigation-primary"
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => go({ section: 'finance', view: 'dashboard' })}
      >
        Finance
      </button>
      <button
        type="button"
        className="quiet navigation-disclosure"
        aria-label="Show Finance menu"
        aria-expanded={open}
        aria-controls="finance-navigation-links"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id="finance-navigation-links"
            role="group"
            aria-label="Finance destinations"
            className="finance-navigation-links"
            style={{ ...position }}
            onMouseEnter={() => window.clearTimeout(closeTimer.current)}
            onMouseLeave={closeAfterHover}
          >
            {destinations.map(([route, label]) => (
              <button type="button" className="quiet" key={label} onClick={() => go(route)}>
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
