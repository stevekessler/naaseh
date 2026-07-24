export const authControls = {
  memoryMiB: 1024,
  reservedConcurrency: 5,
  pepperInSecretsManager: true,
  wafRateLimit: true,
  p95AlarmMs: 1000,
} as const;
