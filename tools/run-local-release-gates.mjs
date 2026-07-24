import { spawnSync } from 'node:child_process';
import process from 'node:process';

const includeBrowsers = process.argv.includes('--browsers');
const enhancedLists = process.argv.includes('--enhanced-lists');
const steps = [
  ['Runtime', ['run', 'check:runtime']],
  ['TypeScript', ['run', 'typecheck']],
  ['Lint', ['run', 'lint']],
  ['Formatting', ['run', 'format:check']],
  ['Pinned GitHub Actions', ['run', 'validate:workflows']],
  [
    'Unit, contract, security, restore, and performance tests with coverage thresholds',
    ['run', 'test:coverage'],
  ],
  ['Python operator commands', ['run', 'test:python']],
  ['Build', ['run', 'build']],
  ['Infrastructure synthesis', ['run', 'cdk:synth']],
];
if (includeBrowsers) steps.push(['Chromium and WebKit browser suites', ['run', 'test:e2e']]);
if (enhancedLists) {
  steps.push(
    [
      'Enhanced lists unit, contract, integration, and security suites',
      [
        'exec',
        'vitest',
        'run',
        'packages/domain/test/list.test.ts',
        'tests/contract/lists.contract.test.ts',
        'tests/integration/list-repository.test.ts',
        'tests/security/content-authorization.security.test.ts',
      ],
    ],
    [
      'Enhanced lists performance suites',
      ['exec', 'vitest', 'run', 'tests/performance/mixed-local-search.test.ts'],
    ],
    ['Enhanced lists browser suites', ['run', 'test:e2e', '--', '--grep', '@enhanced-lists']],
  );
}

for (const [label, arguments_] of steps) {
  process.stdout.write(`\n[pre-aws] ${label}\n`);
  const result = spawnSync('npm', arguments_, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`[pre-aws] stopped at ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(
  `\n[pre-aws] local gates passed${includeBrowsers ? ', including Chromium/WebKit' : ''}. ` +
    'AWS deployment, CloudWatch delivery, replication lag, and real restore evidence remain external gates.\n',
);
