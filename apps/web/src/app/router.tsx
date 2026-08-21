import type { ReactNode } from 'react';

export type AppRoute =
  | { section: 'tasks'; taskId?: string }
  | { section: 'lists'; listId?: string }
  | { section: 'directory' }
  | { section: 'groups' }
  | { section: 'archive' }
  | { section: 'projects' }
  | { section: 'dashboard' }
  | { section: 'stack' }
  | { section: 'google' }
  | { section: 'profile' }
  | { section: 'admin' };

export function parseAppRoute(pathname: string): AppRoute {
  const list = pathname.match(/^\/lists(?:\/([^/]+))?\/?$/);
  if (list)
    return { section: 'lists', ...(list[1] ? { listId: decodeURIComponent(list[1]) } : {}) };
  const task = pathname.match(/^\/tasks(?:\/([^/]+))?\/?$/);
  if (task)
    return { section: 'tasks', ...(task[1] ? { taskId: decodeURIComponent(task[1]) } : {}) };
  if (/^\/groups\/?$/.test(pathname)) return { section: 'groups' };
  if (/^\/directory\/?$/.test(pathname)) return { section: 'directory' };
  if (/^\/archive\/?$/.test(pathname)) return { section: 'archive' };
  if (/^\/projects\/?$/.test(pathname)) return { section: 'projects' };
  if (/^\/dashboard\/?$/.test(pathname)) return { section: 'dashboard' };
  if (/^\/stack\/?$/.test(pathname)) return { section: 'stack' };
  if (/^\/google\/?$/.test(pathname)) return { section: 'profile' };
  if (/^\/profile\/?$/.test(pathname)) return { section: 'profile' };
  if (/^\/admin\/?$/.test(pathname)) return { section: 'admin' };
  return { section: 'tasks' };
}

export function routePath(route: AppRoute): string {
  if (route.section === 'lists')
    return route.listId ? `/lists/${encodeURIComponent(route.listId)}` : '/lists';
  if (route.section === 'tasks')
    return route.taskId ? `/tasks/${encodeURIComponent(route.taskId)}` : '/tasks';
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
