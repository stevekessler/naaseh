export function UpdatePrompt({ waiting, apply }: { waiting: boolean; apply: () => void }) {
  return waiting ? (
    <aside role="status">
      <span>An update is ready. Saved offline work will be preserved.</span>
      <button onClick={apply}>Update</button>
    </aside>
  ) : null;
}
