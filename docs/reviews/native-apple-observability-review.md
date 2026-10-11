# Native Apple observability review

Reviewed 2026-10-08. Repository result: **PASS**. Production CloudWatch sampling: **pending smoke gate**.

The authenticated telemetry POST reuses the existing sync Lambda and log group. CDK assertions prove it creates no telemetry table, queue, topic, log group, or other managed service. Origin/CSRF and session authorization are required, native headers must match every event, batches are closed to 1–50 events and 32 KiB, and response caching is disabled.

Client events contain only platform/build/contract, operation/outcome/error enums, bounded duration, retryability, queue/freshness buckets, and correlation IDs. The on-disk ring holds the newest 100 events, counts overflow, AES-GCM encrypts with a this-device-only Keychain key, and falls back to memory-only if no key exists. Upload waits for a validated session, sends at most 50, retries three times, retains failures, and avoids recursive failure logging.

Server logs permit reconstruction by safe correlation ID plus operation class for notification, sync, authentication, lifecycle, migration, Siri, crypto, store, and file failures. Metrics use a closed five-dimension set. Failed/blocked client events also increment dimensionless `NativeClientFailures`, added to the existing `OperationalFailureSignalAlarm` at five events per five-minute evaluation. The sync log group retains three months; API access logs retain one month.

Automated evidence: 5 API telemetry tests, 4 Swift telemetry tests, and 4 native-client/notification CDK assertions passed. Production smoke must still verify actual ingestion, alarm routing, retained fields, event reconstruction, and absence of protected values in the existing CloudWatch account.
