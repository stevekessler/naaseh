import {
  hostProtocol,
  type FeatureModule,
} from '../../packages/contacts-inventory-contracts/src/host.js';

export const protocol = hostProtocol;

export const mount: FeatureModule['mount'] = (container, location, host) => {
  const heading = document.createElement('h1');
  heading.textContent = 'Contacts and Inventory release fixture';
  const result = document.createElement('p');
  result.setAttribute('role', 'status');
  const refresh = document.createElement('button');
  refresh.textContent = 'Check feature release';
  const controller = new AbortController();

  const read = async () => {
    try {
      const response = await host.request('/fixture', { signal: controller.signal });
      if (!response.ok) return;
      const payload: { releaseId: string } = await response.json();
      if (!controller.signal.aborted) result.textContent = `${location.page}: ${payload.releaseId}`;
    } catch {
      if (!controller.signal.aborted) result.textContent = 'Could not reach the fixture release.';
    }
  };
  refresh.addEventListener('click', () => void read(), { signal: controller.signal });
  container.append(heading, result, refresh);
  void read();

  return () => {
    controller.abort();
    container.replaceChildren();
  };
};
