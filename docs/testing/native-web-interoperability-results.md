# Native/web interoperability results

Run 2026-10-08. Result: **PASS**.

```sh
npx playwright test tests/e2e/native-sync-interop.spec.ts tests/e2e/offline-sync.spec.ts --project=chromium --project=webkit
```

All 10 tests passed in 10.3 seconds. Both engines displayed native-created private data, preserved web-created offline work through reload/update activation, drained an offline mutation exactly once, and presented/resolved conflicts without losing failed or pending choices. Proxy connection-refused messages were expected for routes not exercised by the mocked cases and did not affect results.

`node tools/validate-apple-contract-interop.mjs` also passed 11 closed contract fields, 7 shared crypto vectors, and confirmed both Chromium and WebKit remain configured. No web schema or existing browser journey was changed to accommodate native clients.
