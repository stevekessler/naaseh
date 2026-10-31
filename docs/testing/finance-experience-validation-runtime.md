# Finance Experience Required Validation Runtime

## Before feature 016 test additions — 2026-10-31 (T002)

Environment: Node 24.18.0, macOS arm64, existing lockfile dependencies; checkout
`codex/task-item-creation-uploads` at HEAD
`c58fccb4be365fd0b0533a856fc853fcbdde4cc3`, including its pre-existing local changes.
No test or required workflow/quick configuration was changed before measurement.

| Baseline command                          | Cases / result                                                      |        Wall time | User / system                        |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------: | ------------------------------------ |
| `vitest list --json`                      | 1,175 enumerated cases                                              | Enumeration only | Parameterized executed count differs |
| `/usr/bin/time -p npm run validate`       | PASS; 405 files / 1,267 executed tests, typecheck/lint/build passed |          76.75 s | 258.47 / 63.16 s                     |
| `npm run test:e2e:quick -- --list`        | 31 Chromium cases / 20 files / one project                          | Enumeration only | No suite expansion                   |
| `/usr/bin/time -p npm run test:e2e:quick` | PASS; 31 passed (Playwright 28.3 s)                                 |          28.98 s | 45.43 / 10.78 s                      |

Commands ran sequentially for wall-time measurements; counts/metadata were
collected separately. Browser execution used the existing local preview server
without changing its tests or configuration. Vitest's own duration inside the
full validation command was 63.51 seconds. Existing native changes were present;
these results establish a starting point, not feature-016 acceptance.

## Existing hosted baseline

The connected GitHub tools confirmed successful Validate run **216**, run ID
**40156233875**, for the current committed HEAD. Its job started at
`2026-10-25T02:54:45Z` and completed at `2026-10-25T02:59:06Z`:
**261 seconds (4 minutes 21 seconds)**. GitHub's run timing endpoint reported
**270,000 ms (4 minutes 30 seconds)**, including run overhead.

[Existing hosted Validate run](https://github.com/stevekessler/naaseh/actions/runs/40156233875)

This is an existing committed baseline; it does **not** validate the current
uncommitted changes or feature 016. Current hosted workflow safety timeout is
15 minutes; the target remains ten minutes or less. No merge/deploy was attempted.

## Required after-change evidence

Before each new required-test batch, record expected resulting discovered counts;
after it, record actual discovered/executed counts and the affected required
command duration. Browser changes must use
`/usr/bin/time -p npm run test:e2e:quick`. Preserve representative quick coverage;
keep exhaustive device/browser/failure cases in full/local release gates.

After required-validation changes, confirm the total hosted PR duration including
install/audit/build/browser setup. A successful local run alone is insufficient.
Do not merge an expansion expected to exceed ten minutes without explicit approval
and a documented reason. No feature-016 after-change duration exists yet.

## Foundation batch 1 planned additions — 2026-10-31

Approval received for the $6.50/month combined Finance ceiling. Before adding
required cases, baseline remains 1,175 enumerated / 1,267 executed; validate
76.75 seconds. First Foundation test batch plans 26 additional cases across
spend (8), refunds (7), indexed reads (5), adapter performance (1), migration (3)
and capability compatibility (2): expected 1,201 enumerated / 1,293 executed.
Measure actual counts and required-command duration after this batch. Browser
quick selection is unchanged at 31 cases. Adapter timings alone do not satisfy
the mobile/network production T018 acceptance gate.

### Foundation batch 1 result

PASS: six new files / 26 new cases. Full `/usr/bin/time -p npm run validate`
passed **411 files / 1,293 executed cases**, real **60.07 s**, user 224.92 s,
system 49.37 s (baseline 405 / 1,267, 76.75 s). Initial missing-module/version
failures established red cases; the first full run then caught three new lint
errors, which were corrected before this successful measurement. Existing
schema/version tests were updated for additive v17/v8 without adding cases.
Quick configuration remains unchanged. A new hosted PR run is still required;
no current hosted result or feature acceptance is claimed.

## Foundation batch 2 planned additions

Before expansion, current executed count is 1,293 and measured validate is
60.07 seconds. Plan 16 additional failure-path cases: conditional unit of work
(3), interrupted projections (3), automatic query jobs (3), observability (2),
infrastructure (3), protected pending bytes (2). Expected total: 1,217 enumerated /
1,309 executed. Retain 31 quick Chromium cases; measure after this batch.

### Foundation batch 2 result

PASS: 16 new cases across seven files (conditional writes 3, projection recovery
3, automatic query jobs 3, protected bytes 2, observability 2, infrastructure 1,
HTTP/IAM invocation separation 2). Full `/usr/bin/time -p npm run validate`
passed **418 files / 1,309 tests**, real **61.28 s**, user 235.54 s,
system 50.03 s. Existing 26 Foundation cases were strengthened for interrupted
migration, real signed legacy budget plans and capability gates without adding
cases. Quick selection remains 31. Hosted PR duration remains pending.

The maximum-size receipt test caught and drove a chunked base64 fix in the
shared vault helper. Observability tests caught and drove preservation of trusted
EMF metric descriptors after redacting application context. Infrastructure tests
caught and drove removal of a self-invocation CloudFormation dependency cycle;
account/region and a unique function resource tag now restrict worker invocation.

### Browser regression after Foundation storage/crypto changes

`/usr/bin/time -p npm run test:e2e:quick`: **31 passed**, Playwright 26.0 s;
real **26.43 s**, user 40.38 s, system 8.60 s (baseline 28.98 s).
Vitest enumeration confirms batch 1 **1,201**, batch 2 **1,217** discovered
cases. Required quick/workflow configuration and selection are unchanged.

## Foundation batch 3 planned additions

Before further tests: 1,217 discovered / 1,309 executed; validate 61.28 s,
quick 31 cases / 26.43 s. Plan 12 cases for compact short-text postings,
resumable bounded reads, source/index correction and access safeguards; expected
1,229 discovered / 1,321 executed. The 100k sizing probe found 1,446,358,695
estimated projection bytes in the first representation (4,645,437 references),
so index/cost acceptance remains unresolved while compact postings are evaluated.
