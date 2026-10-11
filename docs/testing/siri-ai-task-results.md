# Siri AI task evaluation — en-US v1

Status: **corpus ready; supported-device execution pending**

The versioned corpus is `packages/test-fixtures/fixtures/apple/siri-en-US-v1.json`. It contains 240
complete requests (80 each for iPhone, iPad, and Mac) and 60 ambiguous-project requests (20 per
platform). Within every platform, the complete set is balanced across Na’aseh/GSD invocation,
omitted/selected project, no-date/date/time/date-and-time forms, and natural filler phrasing. All
labels and project names are synthetic.

## Acceptance gates

- Complete requests: at least 228 of 240 (95%) must create the intended task on the first attempt.
- Ambiguous requests: all 60 must ask for clarification and must create no task before selection.
- Each committed request must produce exactly one durable task and one queued or applied sync
  mutation. Repeating the same invocation identifier must not create another durable effect.
- The results export must contain only corpus IDs, stage outcomes, bounded error codes, durations,
  build/device metadata, and durable-effect counts. It must not contain recognized task or project
  text.

## Required execution matrix

| Platform         | Representative supported hardware | Complete | Ambiguous |
| ---------------- | --------------------------------- | -------: | --------: |
| iPhone / iOS 27  | Siri AI-capable iPhone            |       80 |        20 |
| iPad / iPadOS 27 | A17 Pro or M-series iPad          |       80 |        20 |
| Mac / macOS 27   | Siri AI-capable Apple-silicon Mac |       80 |        20 |

For each corpus ID, record `recognition`, `parse`, `clarification`, `commit`, and `duplicateReplay`
as `pass`, `fail`, or `notApplicable`, plus a privacy-safe error code and duration. Run against the
smoke account first and reset its synthetic fixture projects before each platform pass.

## Current evidence

Automated service tests pass for project omission, authorized-only resolution, ambiguity, due date
and time parsing, local lock, cancellation, offline durable mutation, and invocation deduplication.
The App Intent source type-checks against the installed macOS 27 SDK.

The spoken corpus has not been executed. Xcode 27 now builds the App Intent and both native apps,
but the three supported physical Siri AI-capable devices are not attached to this workspace.
Recognition and end-to-end Siri AI results therefore remain a release gate; no success rate is
claimed in this document. Follow `docs/testing/native-apple-human-test-script.md`, section 4.

## Result summary

| Metric                         |    Required |                                     Observed |
| ------------------------------ | ----------: | -------------------------------------------: |
| Complete first-attempt success | ≥ 228 / 240 |                           Pending device run |
| Ambiguous clarification        |     60 / 60 |                           Pending device run |
| Duplicate durable effects      |           0 | 0 in service-level tests; device run pending |
