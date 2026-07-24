import MiniSearch from 'minisearch';
export class HiddenMemoIndex {
  private index = new MiniSearch<{ id: string; memo: string }>({ fields: ['memo'], idField: 'id' });
  unlock(id: string, memo: string) {
    this.index.add({ id, memo });
  }
  lock() {
    this.index.removeAll();
  }
  search(query: string) {
    return this.index.search(query, { prefix: true }).map((hit) => String(hit.id));
  }
}
