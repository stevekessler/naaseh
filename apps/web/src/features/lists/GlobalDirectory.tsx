import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatMinor, parseSignedMinor, type GlobalDirectoryItem, type List } from '@naaseh/domain';
import { listLocalDirectoryItems, saveDirectoryItem } from '../../db/directory-repository.js';

export function GlobalDirectory({
  actorId,
  lists,
  addToList,
}: {
  actorId: string;
  lists: List[];
  addToList: (listId: string, item: GlobalDirectoryItem) => Promise<void>;
}) {
  const items = useLiveQuery(() => listLocalDirectoryItems(), []) ?? [];
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(lists[0]?.id ?? '');
  useEffect(() => {
    if (!lists.some((list) => list.id === selected)) setSelected(lists[0]?.id ?? '');
  }, [lists, selected]);
  return (
    <section className="global-directory">
      <h2>Global item directory</h2>
      <p>Every active user can add or edit reusable items.</p>
      <form
        className="list-add"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDirectoryItem(
            { name, amountMinor: value ? parseSignedMinor(value, 'cost') : null },
            actorId,
          ).then(() => {
            setName('');
            setValue('');
          });
        }}
      >
        <label>
          Item name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Cost or credit
          <input
            inputMode="decimal"
            placeholder="12.34 or +5.00"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button>Add global item</button>
      </form>
      {lists.length > 0 && (
        <label>
          Add global items to
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul>
        {items
          .filter((item) => item.status === 'active')
          .map((item) => (
            <li key={item.id}>
              <span>
                {item.name}{' '}
                {item.amountMinor === null ? '—' : formatMinor(item.amountMinor, item.currency)}
              </span>
              <button disabled={!selected} onClick={() => void addToList(selected, item)}>
                Add to list
              </button>
              <button
                className="quiet"
                onClick={() => {
                  const nextName = prompt('New name', item.name)?.trim();
                  if (!nextName) return;
                  const currentAmount =
                    item.amountMinor === null ? '' : String(item.amountMinor / 100);
                  const nextAmount = prompt('Cost or credit (use + for a credit)', currentAmount);
                  if (nextAmount === null) return;
                  void saveDirectoryItem(
                    {
                      name: nextName,
                      amountMinor: nextAmount.trim() ? parseSignedMinor(nextAmount, 'cost') : null,
                      currency: item.currency,
                    },
                    actorId,
                    item,
                  );
                }}
              >
                Edit
              </button>
              <button
                className="quiet"
                onClick={() =>
                  void saveDirectoryItem(
                    {
                      name: item.name,
                      amountMinor: item.amountMinor,
                      currency: item.currency,
                      status: 'archived',
                    },
                    actorId,
                    item,
                  )
                }
              >
                Archive
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
