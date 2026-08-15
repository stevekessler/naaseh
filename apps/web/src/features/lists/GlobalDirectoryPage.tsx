import type { GlobalDirectoryItem, List } from '@naaseh/domain';
import { GlobalDirectory } from './GlobalDirectory.js';

export function GlobalDirectoryPage({
  actorId,
  lists,
  addToList,
}: {
  actorId: string;
  lists: List[];
  addToList: (listId: string, item: GlobalDirectoryItem) => Promise<void>;
}) {
  return (
    <section>
      <header className="welcome">
        <div>
          <p className="eyebrow">Reusable list items</p>
          <h1>Global directory</h1>
        </div>
      </header>
      <GlobalDirectory actorId={actorId} lists={lists} addToList={addToList} />
    </section>
  );
}
