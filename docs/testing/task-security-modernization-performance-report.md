# Task security modernization performance report

Date: 2026-08-14

The `npm run test:performance` suite is the reproducible local performance gate. It uses bounded representative fixtures rather than production data.

Result: **PASS** — 16 files, 28 tests, 11.72 seconds. Notable p95 measurements were 101.03 ms for the slowest durable overall-rank acknowledgement, 15.65 ms for a 10,000-row filtered permutation, 1.20 ms for a 100-row stack refresh, 18.03 ms for workload/completion filter projection, 71.11 ms for 50,000-row local search, and 182.80 ms for the legacy 50,000-row export transform. The feature-specific memo/reference/rank tests completed together in 3 ms; individual assertions enforce the limits below.

NFR-006 mappings:

- cached task/modal and timer interaction: browser journeys complete from local data without a network dependency; timer projection of one million elapsed repeat intervals is bounded under 50 ms;
- editor feedback: maximum 20,000-character memo normalization and text projection must complete under 100 ms;
- rank feedback: a filtered permutation across 1,000 local rows must complete under 200 ms, with larger service/read/report p95 checks retained in the ranking performance suite;
- reference search: 1,000 authorized cached choices filter and cap at 50 rendered results under 200 ms;
- admin users: a 10,000-user source returns a stable, cursor-bearing first 100 rows under 200 ms;
- completion CSV: 10,000 complete rows transform within two seconds and contain 10,001 RFC4180 CRLF records.

The exhaustive browser matrix also verifies responsive usability on mobile profiles and degraded/offline behavior. Local CPU timings are regression thresholds, not claims about deployed Lambda cold starts or real network latency. Deployed performance and cost alarms remain release-environment validation.
