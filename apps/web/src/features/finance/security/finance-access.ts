import type { FinanceAccessController } from './finance-access-controller.js';
let active: FinanceAccessController | undefined;
let unsubscribe: (() => void) | undefined;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};
export function subscribeFinanceAccess(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function peekFinanceAccess() {
  return active;
}
export function installFinanceAccess(controller: FinanceAccessController) {
  if (active === controller) return;
  clearFinanceAccess();
  active = controller;
  unsubscribe = controller.subscribe(changed);
  changed();
}
export function currentFinanceAccess() {
  if (!active) throw new Error('Unlock Finance to continue.');
  return active;
}
export function clearFinanceAccess() {
  const previous = active;
  active = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  previous?.dispose();
  changed();
}
