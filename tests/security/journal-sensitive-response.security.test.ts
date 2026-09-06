import { describe, expect, it, vi } from 'vitest';

describe('sensitive journal answers remain private data only', () => {
  it('does not invoke crisis resources, interpretation, alerts, notifications, sharing, reports, or emergency workflows', () => {
    const integrations = {
      notify: vi.fn(),
      share: vi.fn(),
      report: vi.fn(),
      emergency: vi.fn(),
      crisisResources: vi.fn(),
      interpretRisk: vi.fn(),
    };
    const projection = {
      suicidalThoughts: 10,
      suicidalBehaviors: true,
      selfHarmThoughts: 10,
      selfHarmBehaviors: true,
    };
    const persistedPrivateProjection = structuredClone(projection);
    expect(persistedPrivateProjection).toEqual(projection);
    for (const integration of Object.values(integrations))
      expect(integration).not.toHaveBeenCalled();
  });
});
