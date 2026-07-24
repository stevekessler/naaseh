import type { Category } from '@naaseh/domain';
export function CategoriesAdminPage({ categories }: { categories: Category[] }) {
  return (
    <main>
      <h1>Categories</h1>
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            <span style={{ color: c.color }}>●</span> {c.name}
            {c.archived ? ' (archived)' : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
