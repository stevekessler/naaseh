import type { MouseEvent } from 'react';

export function FinanceReportsPage({ onOpenSpend }: { onOpenSpend: () => void }) {
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onOpenSpend();
  }
  return (
    <section aria-labelledby="finance-reports">
      <h2 id="finance-reports">Reports</h2>
      <a href="/finance/reports/spend" onClick={open}>
        Spend report
      </a>
    </section>
  );
}
