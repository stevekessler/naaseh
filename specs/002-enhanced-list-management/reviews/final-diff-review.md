# Final diff review

Last reviewed: 2026-07-23

The implemented paths use shared domain schemas and one parent-first authorization policy. Content
mutations retain conditional versions, immutable revisions, stable mutation results, and feed
changes. Locked/group visibility and administrator reads do not grant administrator mutation.

Attachment capabilities and bytes stay out of browser persistence. Upload and download grants are
short-lived and exact-version/checksum bound; non-clean objects fail closed. Reconciliation and
deletion operate on explicit object keys and versions. Logs use content-free event fields.

The remaining release risk is external validation, not an ignored local assertion: the full test
run's only interruption was a concurrent CDK setup timeout, and that complete suite passed in
isolation. Browser/device journeys and live AWS restore/GuardDuty behavior remain deliberately
unverified until an authorized environment is available.
