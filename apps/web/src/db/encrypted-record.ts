export interface EncryptedRecord {
  id: string;
  schemaVersion: number;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}
export const isEncryptedRecord = (value: unknown): value is EncryptedRecord =>
  Boolean(value && typeof value === 'object' && 'ciphertext' in value && 'iv' in value);
