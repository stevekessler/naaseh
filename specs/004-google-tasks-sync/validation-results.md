# Validation results: Bidirectional Google Tasks Sync

Validated locally on 2026-07-25 with Node.js 24 in `us-west-2` infrastructure configuration.

## Automated gates

| Gate | Result | Evidence |
|---|---|---|
| TypeScript | Pass | `npm run typecheck` |
| ESLint | Pass | `npm run lint` |
| Prettier | Pass | `npm run format:check` |
| Unit/integration/contract/security/performance/infra | Pass | `npm test`: 164 files, 385 tests |
| Production build | Pass | `npm run build`; API/infra TypeScript and web Vite/PWA build |
| Infrastructure synthesis | Pass with capacity warning | `npm run cdk:synth -- --quiet`; 490 resources, below the 500-resource CloudFormation limit |
| Browser journeys | Pass | 12/12 Google sync tests across Chromium, WebKit, iPhone 14, and iPad Pro 11 |
| Diff hygiene | Pass | `git diff --check` |

The browser gate covers responsive preview/settings, date-only disclosure, offline connection state,
encrypted offline conflict reading, keyboard/touch-capable controls, edited resolution after
reconnection, and live status announcements. Service workers were blocked to keep fixtures
deterministic; PWA generation passed in the production build.

The performance fixture summarizes 5,000 links and performs 100 independent three-way merges inside
the 250 ms local release budget. Infrastructure assertions cover the five-minute schedule, separate
bounded runtimes, filtered task and queued-run stream consumers, least-privilege secret/KMS access,
30-day logs, metrics, alarms, routes, and concurrency.

## Recovery and security evidence

- OAuth state is one-time, PKCE-protected, session-bound, hashed at rest, and TTL-limited.
- Refresh-token ciphertext is KMS context-bound to purpose, owner, and connection.
- Redaction fuzz tests cover credentials, titles, dates, notes, conflict candidates, and resolved
  values.
- Restore tests require restored refresh tokens to be invalidated and pending/retry/running provider
  operations to be cancelled before exposure.
- Disconnect/list-move integration tests prove deletion is allowlisted to Na'aseh-origin Google
  tasks and local records remain.
- Full repository tests passed after infrastructure count assertions were updated for the new secret,
  log group, alarms, and asynchronous run consumer.

## External release gates

The live portion of `quickstart.md` was not executed because this workspace does not contain an
authorized disposable Google test account, configured OAuth client secret, or deployed disposable
AWS integration environment. This is an explicit release gate, not substituted by local mocks.

Before production enablement, an operator must:

1. Configure the exact callback URL and OAuth secret in a disposable Google Cloud/AWS environment.
2. Execute all 12 end-to-end acceptance steps in `quickstart.md`, including consent denial,
   lost-response replay, throttling, revocation, both disconnect modes, and provider-side inspection.
3. Capture content-free run IDs, CloudWatch metric names, timestamps, and pass/fail outcomes; do not
   capture task content or credentials.
4. Confirm Google consent verification and current Tasks API quotas.
5. Review the synthesized stack's 490/500 resource count and split the stack before adding more
   resources that could breach the CloudFormation limit.

Production rollout remains blocked until these external gates are recorded by an authorized
operator.
