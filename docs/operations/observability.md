# Observability

All Lambda application events use `@naaseh/observability`. It emits one-line JSON to
CloudWatch and supports embedded metrics without a second logging framework. `VERBOSE_LOGGING`
is enabled only by the literal value `true` and defaults off. Both modes permanently redact
credentials, cookies, tokens, PINs, memo/label/payload content, ciphertext, key material, and
before/after values. Correlation IDs, operation names, safe resource identifiers, outcomes,
durations, retry state, and error classifications are the intended diagnostic fields.
