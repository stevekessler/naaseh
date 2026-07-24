import { describe, expect, it, vi } from 'vitest';
import {
  authorizeRecovery,
  canRecover,
  RecoveryAuthorizationError,
} from '../../apps/api/src/crypto-recovery/authorization.js';
import { createRecoveryAudit } from '../../apps/api/src/crypto-recovery/telemetry.js';

const now = new Date('2026-07-23T12:00:00.000Z');
const approved = {
  actorId: '01J00000000000000000000001',
  role: 'recovery' as const,
  recoveryApproved: true,
  approvalKind: 'manual' as const,
  approvalId: 'restore-2026-q3',
  approvalExpiresAt: '2026-07-23T13:00:00.000Z',
  isolatedEnvironment: true,
};

describe('recovery authorization and audit boundary', () => {
  it('requires the recovery role, explicit unexpired approval, and isolation', () => {
    expect(authorizeRecovery(approved, now)).toEqual(approved);
    expect(canRecover(approved, now)).toBe(true);
    for (const mutation of [
      { role: 'admin' },
      { recoveryApproved: false },
      { isolatedEnvironment: false },
      { approvalExpiresAt: '2026-07-23T11:59:59.000Z' },
    ]) {
      expect(() => authorizeRecovery({ ...approved, ...mutation }, now)).toThrow(
        RecoveryAuthorizationError,
      );
    }
  });

  it('accepts only fresh EventBridge quarterly approvals', () => {
    const scheduled = {
      actorId: 'system:restore-schedule',
      role: 'recovery',
      recoveryApproved: true,
      approvalKind: 'scheduled-quarterly',
      approvalId: 'quarterly-restore-schedule',
      isolatedEnvironment: true,
      scheduledAt: '2026-07-23T11:30:00.000Z',
    };
    expect(canRecover(scheduled, now)).toBe(true);
    expect(canRecover({ ...scheduled, scheduledAt: '2026-07-23T09:00:00.000Z' }, now)).toBe(false);
  });

  it('rejects malformed or additional claim fields instead of trusting them', () => {
    expect(() => authorizeRecovery({ ...approved, productionOverride: true }, now)).toThrow();
    expect(canRecover({ role: 'recovery', recoveryApproved: true }, now)).toBe(false);
  });

  it('emits only allowlisted recovery audit context', () => {
    const sink = vi.fn();
    const audit = createRecoveryAudit({}, sink);
    audit('restore.validate', approved.actorId, 'denied', {
      approvalId: approved.approvalId,
      elapsedMs: 12,
      password: 'must-never-appear',
      memoText: 'must-never-appear',
    });
    const line = sink.mock.calls[0]?.[0] as string;
    expect(line).toContain('restore.validate');
    expect(line).toContain(approved.approvalId);
    expect(line).not.toContain('must-never-appear');
    expect(line).not.toContain('password');
    expect(line).not.toContain('memoText');
  });
});
