import type { CategoryRecord, Project } from '@naaseh/domain';

export function ProjectForm({
  categories,
  initial,
  save,
}: {
  categories: CategoryRecord[];
  initial?: Project;
  save: (value: { categoryId: string; name: string; endDate?: string }) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const endDate = String(data.get('endDate') ?? '');
        save({
          categoryId: String(data.get('categoryId')),
          name: String(data.get('name')),
          ...(endDate ? { endDate } : {}),
        });
      }}
    >
      <label>
        Category
        <select name="categoryId" required defaultValue={initial?.categoryId}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project name
        <input name="name" required maxLength={80} defaultValue={initial?.name} />
      </label>
      <label>
        End date
        <input name="endDate" type="date" defaultValue={initial?.endDate} />
      </label>
      <button>{initial ? 'Save Project' : 'Create Project'}</button>
    </form>
  );
}
