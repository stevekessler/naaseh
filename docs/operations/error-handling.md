# API error handling

Na'aseh maps server failures through one safe classifier before returning them to a browser.
Every mapped failure emits a structured `api.request_failed` CloudWatch event containing the
correlation ID, operation, safe actor/resource identifiers, classification, HTTP status, and
retryability. Raw exception messages and request payloads are deliberately excluded.

| Classification                        |        HTTP/result | Browser behavior                                              |
| ------------------------------------- | -----------------: | ------------------------------------------------------------- |
| Validation                            |     400 / rejected | Correct the submitted value.                                  |
| Authentication or authorization       | 401/403 / rejected | Sign in again or stop the unauthorized operation.             |
| Deliberately concealed resource       |     404 / rejected | Treat the resource as unavailable.                            |
| Conditional or transactional conflict |     409 / conflict | Refresh or resolve the conflicting change.                    |
| AWS throttling or temporary outage    |        503 / retry | Keep pending work and retry with backoff using `Retry-After`. |
| Other AWS dependency failure          |        502 / retry | Keep pending work; retry because the dependency may recover.  |
| Unexpected internal failure           |        500 / retry | Keep pending work and report the correlation ID.              |

Problem responses use `application/problem+json`. They expose only a stable code, safe title,
status, and correlation ID. Group join failures intentionally use one generic response for an
incorrect PIN, a revoked membership, or another policy denial. Verbose logging does not add
raw errors, PINs, task content, mutation payloads, or other protected values.
