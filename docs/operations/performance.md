# Archive and Reporting Performance

The release fixture covers 50,000 active/archived work records, 1,000 organization nodes, and
50,000 CompletionEvents. Local workload counting uses one pass; completion bucketing caches the
IANA formatter and uses `formatToParts`. On 2026-07-24 the focused Vitest runs completed the
50,000-work tree test and 50,000-event report calculation below the one-second acceptance target.
Re-run `npm run test:performance` on release hardware and record wall time and p95 browser
acknowledgement. A regression at or above one second blocks release.
