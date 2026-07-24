import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('administrator provisioning command security', () => {
  it('never accepts password or PIN as command-line arguments or prints the request', () => {
    const source = readFileSync('scripts/create_user.py', 'utf8');
    expect(source).not.toContain('add_argument("--password"');
    expect(source).not.toContain('add_argument("--pin"');
    expect(source).toContain('getpass.getpass');
    expect(source).not.toMatch(/print\([^\n]*(password|pin|payload)/i);
  });

  it('limits the operator surface to invoking the provisioning function', () => {
    const source = readFileSync('infra/lib/admin-stack.ts', 'utf8');
    expect(source).toContain('lambda:InvokeFunction');
    expect(source).not.toContain('dynamodb:*');
    expect(source).not.toContain('secretsmanager:*');
    expect(source).not.toContain('kms:*');
  });
});
