export function FinanceNavigation({ active, navigate }: { active: boolean; navigate: () => void }) {
  return (
    <button className="quiet" aria-current={active ? 'page' : undefined} onClick={navigate}>
      Finance
    </button>
  );
}
