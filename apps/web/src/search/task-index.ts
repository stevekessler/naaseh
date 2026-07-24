import MiniSearch from 'minisearch';
import type { Task } from '@naaseh/domain';

type SearchDocument = Pick<Task, 'id' | 'label' | 'memo'>;

export type ContentTypeFilter = 'all' | 'lists' | 'todos';
export interface MixedSearchDocument {
  id: string;
  type: 'todo' | 'list' | 'listItem';
  parentId?: string;
  title: string;
  body?: string;
}
export interface MixedSearchHit extends MixedSearchDocument {
  score?: number;
}
export class MixedContentIndex {
  private index = new MiniSearch<MixedSearchDocument>({
    fields: ['title', 'body'],
    storeFields: ['id', 'type', 'parentId', 'title', 'body'],
    idField: 'id',
  });
  private documents = new Map<string, MixedSearchDocument>();
  upsert(document: MixedSearchDocument) {
    if (this.documents.has(document.id)) this.index.discard(document.id);
    this.documents.set(document.id, document);
    this.index.add(document);
  }
  remove(id: string) {
    if (this.documents.has(id)) {
      this.index.discard(id);
      this.documents.delete(id);
    }
  }
  search(query: string, filter: ContentTypeFilter = 'all') {
    const allowed = (type: MixedSearchDocument['type']) =>
      filter === 'all' ||
      (filter === 'lists' ? type === 'list' || type === 'listItem' : type === 'todo');
    return this.index
      .search(query, {
        prefix: true,
        fuzzy: 0.2,
        filter: (result) => allowed(result.type as MixedSearchDocument['type']),
      })
      .map((hit) => String(hit.id));
  }
}
export function groupMixedHits(hits: MixedSearchHit[]) {
  const groups = new Map<string, MixedSearchHit[]>();
  for (const hit of hits) {
    const parentId = hit.type === 'listItem' && hit.parentId ? hit.parentId : hit.id;
    groups.set(parentId, [...(groups.get(parentId) ?? []), hit]);
  }
  return [...groups].map(([parentId, grouped]) => ({ parentId, hits: grouped }));
}

export class TaskIndex {
  private index = new MiniSearch<SearchDocument>({
    fields: ['label', 'memo'],
    storeFields: ['id'],
    idField: 'id',
  });
  private ids = new Set<string>();

  upsert(task: Task) {
    if (this.ids.has(task.id)) this.index.discard(task.id);
    this.index.add({ id: task.id, label: task.label, memo: task.memoHidden ? '' : task.memo });
    this.ids.add(task.id);
  }

  remove(id: string) {
    if (this.ids.has(id)) {
      this.index.discard(id);
      this.ids.delete(id);
    }
  }

  search(query: string) {
    return this.index.search(query, { prefix: true, fuzzy: 0.2 }).map((hit) => String(hit.id));
  }
}
