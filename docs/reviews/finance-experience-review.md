# Finance 016 receipt and Spend Report review

This is the local T158 review checkpoint for Finance receipt recovery and
Spend Report source handling. The worktree is based on the Phase 14a local
commit `42bc68da4f08911fdf914b08bda38711a6d78eaa`.

| Finding | Correction and regression evidence |
| --- | --- |
| An expired upload returned a conflict when its uploader cancelled it. | Expired uploads now cancel idempotently. The lifecycle test verifies that initiation cannot revive the cancelled intent, a late completion cannot pin content, and cancellation still denies an available original. Existing exact-version cleanup handles cancelled uploads. |
| A denied re-read left the previously verified save link and Blob URL usable. | Starting a replacement read revokes the previous URL. Preview identity includes the current receipt version and ETag, and loss of availability unmounts its preview. The browser test reproduces a 404 after a successful read and verifies that the old URL no longer serves bytes. |
| A transaction receipt page could deliver stale results after refreshing the list, and rejected receipts-browser continuations could leave previously shown content on screen. | Transaction pagination shares the current list's abort signal and deduplicates IDs. Refresh aborts old pages and clears old rows. The receipt browser clears visible rows on authorization, missing source, or revision conflicts. Browser tests exercise both paths. |

Spend Report review covered owner-bound query pagination, rechecking current
source access before delivery, and the protected offline cache lease. The
affected browser run covers exact online totals, modal return, and explicitly
partial offline figures. It includes all four existing browser projects.

The expired upload and stale save link regressions were reproduced before the
fixes. This checkpoint covers only the reviewed parts of T158. The task remains
open for the integrated Finance branch and its remaining story changes.

| Local validation | Result | Real time |
| --- | --- | --- |
| Focused receipt lifecycle, security, contract and restore | 29 passed in 4 files | 0.46 s |
| Receipt and Spend Report browser tests | 24 passed across Chromium, WebKit, iPhone and iPad | 22.93 s |
| Required validation | 1,951 passed in 495 files, including runtime, typecheck, lint and builds | 69.66 s |
| Quick Playwright | 31 passed | 29.87 s |
| Apple contract interoperability | 11 closed fields and 7 crypto vectors | — |

The previous local baseline was 1,950 required tests across 495 files in
67.41 s, and 31 quick cases in 30.10 s. Browser projects, retries, timeouts,
and the quick selection were retained. The full-browser cases added here can
run in the existing full or local release browser suite. T018 still covers
the deferred real DynamoDB, hosted and cost acceptance.
