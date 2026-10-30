import type { ReactNode } from 'react';

export type AppRoute =
  | { section: 'tasks'; taskId?: string }
  | { section: 'search' }
  | {
      section: 'finance';
      accountId?: string;
      budgetId?: string;
      view?: 'accounts' | 'transactions' | 'merchants' | 'budgets';
    }
  | { section: 'lists'; listId?: string }
  | { section: 'directory' }
  | { section: 'groups' }
  | { section: 'archive' }
  | { section: 'projects' }
  | { section: 'dashboard' }
  | { section: 'stack' }
  | { section: 'google' }
  | { section: 'profile' }
  | { section: 'admin' }
  | { section: 'admin-categories' }
  | {
      section: 'journal';
      entryId?: string;
      sharedPlanId?: string;
      create?: boolean;
      view?: 'settings' | 'dashboard' | 'crisis-plans';
    };

export function parseAppRoute(pathname: string): AppRoute {
  if (/^\/journal\/new\/?$/.test(pathname)) return { section: 'journal', create: true };
  if (/^\/journal\/settings\/?$/.test(pathname)) return { section: 'journal', view: 'settings' };
  if (/^\/journal\/dashboard\/?$/.test(pathname)) return { section: 'journal', view: 'dashboard' };
  if (/^\/journal\/crisis-plans\/?$/.test(pathname))
    return { section: 'journal', view: 'crisis-plans' };
  const sharedCrisisPlan = pathname.match(/^\/journal\/crisis-plans\/shared\/([^/]+)\/?$/u);
  if (sharedCrisisPlan)
    return {
      section: 'journal',
      view: 'crisis-plans',
      sharedPlanId: decodeURIComponent(sharedCrisisPlan[1]!),
    };
  const journal = pathname.match(/^\/journal(?:\/([^/]+))?\/?$/);
  if (journal)
    return {
      section: 'journal',
      ...(journal[1] ? { entryId: decodeURIComponent(journal[1]) } : {}),
    };
  const list = pathname.match(/^\/lists(?:\/([^/]+))?\/?$/);
  if (list)
    return { section: 'lists', ...(list[1] ? { listId: decodeURIComponent(list[1]) } : {}) };
  const task = pathname.match(/^\/tasks(?:\/([^/]+))?\/?$/);
  if (task)
    return { section: 'tasks', ...(task[1] ? { taskId: decodeURIComponent(task[1]) } : {}) };
  if (/^\/search\/?$/.test(pathname)) return { section: 'search' };
  const financeBudget = pathname.match(/^\/finance\/budgets(?:\/([^/]+))?\/?$/u);
  if (financeBudget)
    return {
      section: 'finance',
      view: 'budgets',
      ...(financeBudget[1] ? { budgetId: decodeURIComponent(financeBudget[1]) } : {}),
    };
  const financeAccount = pathname.match(/^\/finance\/accounts(?:\/([^/]+))?\/?$/u);
  if (financeAccount)
    return {
      section: 'finance',
      view: 'accounts',
      ...(financeAccount[1] ? { accountId: decodeURIComponent(financeAccount[1]) } : {}),
    };
  if (/^\/finance\/transactions\/?$/u.test(pathname))
    return { section: 'finance', view: 'transactions' };
  if (/^\/finance\/merchants(?:\/[^/]+)?\/?$/u.test(pathname))
    return { section: 'finance', view: 'merchants' };
  if (/^\/finance\/?$/u.test(pathname)) return { section: 'finance' };
  if (/^\/groups\/?$/.test(pathname)) return { section: 'groups' };
  if (/^\/directory\/?$/.test(pathname)) return { section: 'directory' };
  if (/^\/archive\/?$/.test(pathname)) return { section: 'archive' };
  if (/^\/projects\/?$/.test(pathname)) return { section: 'stack' };
  if (/^\/dashboard\/?$/.test(pathname)) return { section: 'dashboard' };
  if (/^\/stack\/?$/.test(pathname)) return { section: 'stack' };
  if (/^\/profile\/?$/.test(pathname)) return { section: 'profile' };
  if (/^\/admin\/?$/.test(pathname)) return { section: 'admin' };
  if (/^\/admin\/categories\/?$/.test(pathname)) return { section: 'admin-categories' };
  return { section: 'tasks' };
}

export function routePath(route: AppRoute): string {
  if (route.section === 'lists')
    return route.listId ? `/lists/${encodeURIComponent(route.listId)}` : '/lists';
  if (route.section === 'tasks')
    return route.taskId ? `/tasks/${encodeURIComponent(route.taskId)}` : '/tasks';
  if (route.section === 'finance')
    return route.budgetId
      ? `/finance/budgets/${encodeURIComponent(route.budgetId)}`
      : route.accountId
        ? `/finance/accounts/${encodeURIComponent(route.accountId)}`
        : route.view
          ? `/finance/${route.view}`
          : '/finance';
  if (route.section === 'journal')
    return route.sharedPlanId
      ? `/journal/crisis-plans/shared/${encodeURIComponent(route.sharedPlanId)}`
      : route.create
        ? '/journal/new'
        : route.view
          ? `/journal/${route.view}`
          : route.entryId
            ? `/journal/${encodeURIComponent(route.entryId)}`
            : '/journal';
  if (route.section === 'admin-categories') return '/admin/categories';
  if (route.section === 'projects') return '/stack';
  return `/${route.section}`;
}

export function navigate(route: AppRoute, replace = false) {
  const previousSection = parseAppRoute(location.pathname).section;
  const method = replace ? 'replaceState' : 'pushState';
  history[method]({}, '', `${routePath(route)}${location.search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  if (previousSection !== route.section) window.scrollTo({ top: 0, left: 0 });
}

export function RouteView({
  authenticated,
  publicView,
  privateView,
}: {
  authenticated: boolean;
  publicView: ReactNode;
  privateView: ReactNode;
}) {
  return authenticated ? privateView : publicView;
}
