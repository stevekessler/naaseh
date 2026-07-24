import { type FormEvent } from 'react';
export function UnlockMemoDialog({
  unlock,
  recover,
}: {
  unlock: (pin: string) => void;
  recover: () => void;
}) {
  return (
    <dialog open>
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          unlock(String(new FormData(e.currentTarget).get('pin')));
        }}
      >
        <label>
          PIN
          <input name="pin" type="password" inputMode="numeric" required />
        </label>
        <button>Unlock offline</button>
        <button type="button" onClick={recover}>
          Recover with password
        </button>
      </form>
    </dialog>
  );
}
