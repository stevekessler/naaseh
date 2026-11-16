import { useEffect, useRef, type ReactNode } from 'react';

export function TransactionModal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      className="finance-transaction-modal"
      ref={dialogRef}
      aria-label="Transaction details"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button type="button" autoFocus onClick={onClose}>
        Close transaction
      </button>
      {children}
    </dialog>
  );
}
