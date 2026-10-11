#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

const [
  manifestText,
  problemText,
  envelopeText,
  typescript,
  swift,
  openapi,
  cryptoText,
  browserTest,
  browserConfig,
] = await Promise.all([
  read('packages/test-fixtures/fixtures/apple/manifest.json'),
  read('packages/test-fixtures/fixtures/apple/contracts/api-problem.json'),
  read('packages/test-fixtures/fixtures/apple/contracts/sync-envelope-v4.json'),
  read('packages/contracts/src/apple-native.ts'),
  read('packages/apple/Sources/NaasehContracts/WireContracts.swift'),
  read('specs/012-native-apple-apps/contracts/native-api-additions.openapi.yaml'),
  read('packages/test-fixtures/fixtures/apple/crypto/vectors.json'),
  read('tests/e2e/native-sync-interop.spec.ts'),
  read('playwright.config.ts'),
]);

const manifest = JSON.parse(manifestText);
const problem = JSON.parse(problemText);
const envelope = JSON.parse(envelopeText);
const crypto = JSON.parse(cryptoText);

assert.equal(manifest.schema, 'naaseh-apple-fixtures/v1');
for (const fixture of manifest.fixtures) {
  assert.equal(fixture.containsProtectedData, false, `${fixture.id} must be synthetic`);
}

const problemFields = ['type', 'title', 'status', 'code', 'message', 'correlationId'];
assert.deepEqual(Object.keys(problem).sort(), [...problemFields].sort());
for (const field of problemFields) {
  assert.match(typescript, new RegExp(`\\b${field}\\b`), `TypeScript API problem missing ${field}`);
  assert.match(swift, new RegExp(`\\b${field}\\b`), `Swift API problem missing ${field}`);
  assert.match(openapi, new RegExp(`\\b${field}\\b`), `OpenAPI API problem missing ${field}`);
}

const envelopeFields = ['contractVersion', 'audience', 'cursor', 'operations', 'serverTime'];
assert.equal(envelope.contractVersion, 4);
assert.deepEqual(Object.keys(envelope).sort(), [...envelopeFields].sort());
for (const field of envelopeFields) {
  assert.match(
    typescript,
    new RegExp(`\\b${field}\\b`),
    `TypeScript sync envelope missing ${field}`,
  );
  assert.match(swift, new RegExp(`\\b${field}\\b`), `Swift sync envelope missing ${field}`);
}

const cryptoVectorCount = ['aes256Gcm', 'hkdfSha256', 'argon2id', 'base64url']
  .map((name) => crypto[name])
  .reduce((count, vectors) => count + (Array.isArray(vectors) ? vectors.length : 0), 0);
assert.ok(cryptoVectorCount > 0, 'crypto vectors must be non-empty');
assert.match(browserTest, /native-created record/);
assert.match(browserTest, /setOffline\(true\)/);
assert.match(browserConfig, /name:\s*'chromium'/);
assert.match(browserConfig, /name:\s*'webkit'/);

process.stdout.write(
  `Apple interop drift check passed: ${problemFields.length + envelopeFields.length} closed fields, ${cryptoVectorCount} crypto vectors, Chromium and WebKit configured.\n`,
);
