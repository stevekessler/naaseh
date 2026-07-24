export function PrivacyControl({
  privateTask,
  change,
}: {
  privateTask: boolean;
  change: (value: boolean) => void;
}) {
  return (
    <div className="privacy-control">
      <button
        type="button"
        aria-pressed={privateTask}
        aria-label={privateTask ? 'Unlock to-do item' : 'Lock to-do item'}
        onClick={() => change(!privateTask)}
      >
        {privateTask ? '🔒 Locked' : '🔓 Unlocked'}
      </button>
      <span>
        {privateTask
          ? 'Only you can see this to-do item.'
          : 'All active users can see this to-do item.'}
      </span>
    </div>
  );
}
