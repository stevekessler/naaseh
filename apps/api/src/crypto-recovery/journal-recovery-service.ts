import {
  InMemoryJournalRecoveryRepository,
  journalRecoveryDigest,
  type JournalRecoveryRecord,
} from './journal-recovery-repository.js';

interface Dependencies {
  now(): number;
  verifyOwnerPassword(ownerId: string, password: string): Promise<boolean>;
  verifyAdminStrongAuth(adminId: string, password: string, factorCode: string): Promise<boolean>;
  rewrapForOwner(request: JournalRecoveryRecord): Promise<string>;
}
interface Initiate {
  ownerId: string;
  actorId: string;
  password: string;
  reason: string;
  sessionEpochDigest: string;
  keyEnvelopeVersion: number;
  recoveryKeyVersion: number;
  ephemeralPublicKeySpki: string;
  idempotencyKey: string;
}
interface Approve {
  requestId: string;
  adminId: string;
  role: 'admin' | 'recovery';
  password: string;
  factorCode: string;
  approvalId: string;
}

export class JournalRecoveryService {
  constructor(
    private readonly repository: InMemoryJournalRecoveryRepository,
    private readonly dependencies: Dependencies,
  ) {}
  async initiate(input: Initiate) {
    if (
      input.actorId !== input.ownerId ||
      !input.reason.trim() ||
      !(await this.dependencies.verifyOwnerPassword(input.ownerId, input.password))
    )
      throw new Error('Recovery is unavailable.');
    const now = this.dependencies.now();
    const record = this.repository.create({
      ownerId: input.ownerId,
      state: 'requested',
      sessionEpochDigest: input.sessionEpochDigest,
      keyEnvelopeVersion: input.keyEnvelopeVersion,
      recoveryKeyVersion: input.recoveryKeyVersion,
      ephemeralPublicKeySpki: input.ephemeralPublicKeySpki,
      ephemeralPublicKeyDigest: journalRecoveryDigest(input.ephemeralPublicKeySpki),
      reasonDigest: journalRecoveryDigest(input.reason),
      idempotencyKey: input.idempotencyKey,
      expiresAt: now + 5 * 60_000,
    });
    this.repository.appendAudit(record.id, 'requested', input.ownerId, 'success', now);
    return record;
  }
  private active(requestId: string) {
    const record = this.repository.get(requestId);
    if (!record) throw new Error('Recovery is unavailable.');
    if (this.dependencies.now() > record.expiresAt) {
      if (record.state === 'requested') this.repository.save({ ...record, state: 'expired' });
      throw new Error('Recovery request expired.');
    }
    return record;
  }
  async approve(input: Approve) {
    const record = this.active(input.requestId);
    if (
      input.role !== 'recovery' ||
      record.state !== 'requested' ||
      !(await this.dependencies.verifyAdminStrongAuth(
        input.adminId,
        input.password,
        input.factorCode,
      ))
    ) {
      this.repository.appendAudit(
        record.id,
        'approve',
        input.adminId,
        'denied',
        this.dependencies.now(),
      );
      throw new Error('Recovery is unavailable.');
    }
    const resultCiphertext = await this.dependencies.rewrapForOwner(record);
    const saved = this.repository.save({
      ...record,
      state: 'rewrapped',
      adminId: input.adminId,
      approvalId: input.approvalId,
      resultCiphertext,
    });
    this.repository.appendAudit(
      record.id,
      'rewrapped',
      input.adminId,
      'success',
      this.dependencies.now(),
    );
    return saved;
  }
  async ownerStatus(ownerId: string, requestId: string) {
    const record = this.active(requestId);
    if (record.ownerId !== ownerId) throw new Error('Recovery is unavailable.');
    const { ephemeralPublicKeySpki, resultCiphertext, ...view } = record;
    void ephemeralPublicKeySpki;
    void resultCiphertext;
    return view;
  }
  async consume(ownerId: string, requestId: string) {
    const record = this.active(requestId);
    if (record.ownerId !== ownerId || record.state !== 'rewrapped' || !record.resultCiphertext)
      throw new Error('Recovery is unavailable.');
    this.repository.save({ ...record, state: 'consumed', consumedAt: this.dependencies.now() });
    this.repository.appendAudit(record.id, 'consumed', ownerId, 'success', this.dependencies.now());
    return record.resultCiphertext;
  }
  async complete(ownerId: string, requestId: string) {
    const record = this.active(requestId);
    if (record.ownerId !== ownerId || record.state !== 'consumed')
      throw new Error('Recovery is unavailable.');
    const { resultCiphertext, ...completed } = record;
    void resultCiphertext;
    return this.repository.save({ ...completed, state: 'completed' });
  }
}
