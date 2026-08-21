export type SecurityFixtureUser = {
  id: string;
  username: string;
  displayName: string;
  role: 'user' | 'admin';
  active: boolean;
  sessionEpoch: number;
  credentialVersion: number;
  tfaStatus: 'disabled' | 'enrollment_required' | 'enabled' | 'recovery_required';
};

export const securityFixtureUsers = {
  ordinaryWithoutTfa: {
    id: 'fixture-user-without-tfa',
    username: 'fixture-user',
    displayName: 'Fixture User',
    role: 'user',
    active: true,
    sessionEpoch: 1,
    credentialVersion: 1,
    tfaStatus: 'disabled',
  },
  administratorEnrollmentRequired: {
    id: 'fixture-admin-enrollment-required',
    username: 'fixture-admin-new',
    displayName: 'Fixture New Administrator',
    role: 'admin',
    active: true,
    sessionEpoch: 4,
    credentialVersion: 2,
    tfaStatus: 'enrollment_required',
  },
  administratorWithTfa: {
    id: 'fixture-admin-with-tfa',
    username: 'fixture-admin',
    displayName: 'Fixture Administrator',
    role: 'admin',
    active: true,
    sessionEpoch: 7,
    credentialVersion: 3,
    tfaStatus: 'enabled',
  },
} as const satisfies Record<string, SecurityFixtureUser>;

export const administratorRecoveryFixture = {
  canonicalUsername: securityFixtureUsers.administratorWithTfa.username,
  reason: 'Lost authenticator during deterministic recovery test',
  idempotencyToken: 'fixture-recovery-0000000000000001',
  operatorPrincipalArn: 'arn:aws:iam::111122223333:role/fixture-tfa-recovery-operator',
} as const;

export type ControlledTimerClock = ReturnType<typeof createControlledTimerClock>;

export function createControlledTimerClock(initial = '2026-08-14T18:00:00.000Z') {
  let wallTimeMs = Date.parse(initial);
  let monotonicMs = 0;

  return {
    now: () => new Date(wallTimeMs),
    monotonicNow: () => monotonicMs,
    advance(milliseconds: number) {
      wallTimeMs += milliseconds;
      monotonicMs += milliseconds;
    },
    correctWallClock(milliseconds: number) {
      wallTimeMs += milliseconds;
    },
  };
}

export function buildReferenceChoices(count = 1_000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `reference-${String(index + 1).padStart(4, '0')}`,
    label: index % 25 === 0 ? 'Duplicate task' : `Authorized task ${index + 1}`,
    context: `Project ${Math.floor(index / 50) + 1}`,
    authorized: true,
    active: true,
  }));
}

export function buildAdminUserRows(count = 10_000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${String(index + 1).padStart(5, '0')}`,
    username: `user-${String(index + 1).padStart(5, '0')}`,
    displayName: `User ${index + 1}`,
    role: index % 100 === 0 ? ('admin' as const) : ('user' as const),
    active: index % 97 !== 0,
    tfaStatus: index % 100 === 0 ? ('enabled' as const) : ('disabled' as const),
    version: 1,
  }));
}

export const legacyDueTimeFixtures = [
  {
    name: 'legacy off-grid instant',
    dueAt: '2026-11-01T08:03:00.000Z',
    dueTimeZone: 'America/Denver',
    expectedPrecision: 'legacy_off_grid',
  },
  {
    name: 'spring-forward nonexistent local time',
    localDate: '2026-03-08',
    localTime: '02:30',
    browserTimeZone: 'America/Denver',
    expectedValid: false,
  },
] as const;

export const extraLowGuardFixtures = {
  zeroInventory: {
    tasks: 0,
    lists: 0,
    projections: 0,
    pendingMutations: 0,
    stackSnapshots: 0,
    restoreRecords: 0,
  },
  unexpectedTask: {
    location: 'tasks',
    record: { id: 'unexpected-extra-low', urgency: 'extra_low' },
  },
} as const;
