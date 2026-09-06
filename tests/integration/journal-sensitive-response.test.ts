import { describe, expect, it, vi } from 'vitest';

describe('journal sensitive response integration', () => {
  it('persists through the journal boundary without side-effect services', async () => {
    const services = {
      notification: vi.fn(),
      export: vi.fn(),
      reporting: vi.fn(),
      sharing: vi.fn(),
    };
    const persist = vi.fn(async () => ({ encrypted: true }));
    await persist({ suicidalBehaviors: true, selfHarmBehaviors: true });
    expect(persist).toHaveBeenCalledOnce();
    for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
  });
});
