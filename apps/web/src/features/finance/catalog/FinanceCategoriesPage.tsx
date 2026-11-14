import { FinanceCategoryManager } from './FinanceCategoryManager.js';

export function FinanceCategoriesPage({
  userId,
  isAdmin,
  csrfToken,
}: {
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
}) {
  return (
    <section aria-labelledby="finance-categories-title">
      <h2 id="finance-categories-title">Categories and subcategories</h2>
      <p>Use one optional child level. Existing assignments keep their historical labels.</p>
      <FinanceCategoryManager userId={userId} isAdmin={isAdmin} csrfToken={csrfToken} />
    </section>
  );
}
