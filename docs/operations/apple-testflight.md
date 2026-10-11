# Apple TestFlight operations

Na’aseh ships as two native arm64 records: universal iPhone/iPad (`link.thepandas.naaseh`) and native Mac (`link.thepandas.naaseh.macos`). Both require OS 27, use contract version 4, and point only to the existing production origin. No beta-only AWS environment or service is permitted.

Complete the one-time [Apple account setup](apple-account-setup.md), the
[APNs key/secret procedure](../runbooks/native-notification-delivery.md), and the
[production deployment confirmation](native-production-readiness.md) before uploading or signing in.

## App Store Connect configuration checklist

- Create the two records from the bundle IDs above; do not enable Mac Catalyst or Intel support.
- Use automatic signing locally or CI-held distribution identities. Never commit certificates, profiles, APNs keys, API keys, issuer IDs, or passwords.
- Configure production APNs for both records using one team-scoped key in the existing managed
  Web Push/APNs secret; validate both bundle topics independently.
- Record export compliance as exempt encryption only (`ITSAppUsesNonExemptEncryption = NO`) and review that declaration whenever cryptography changes.
- Set the feedback address from the release operator’s secret/configuration store. Screenshots must use `apps/apple/Distribution/ScreenshotFixtures.json` only.
- Create one internal group named `Naaseh Smoke`, add only the dedicated smoke account, and disable automatic external distribution.
- Enable TestFlight feedback and crash collection. Feedback exports are limited to safe build, platform, bounded queue, compatibility, and correlation metadata.
- To stop an unsafe build, expire it in TestFlight, then raise the existing compatibility minimum only after pending-work recovery is verified.

## Non-secret evidence

For each release, attach record IDs, build numbers, upload timestamps, processing result, smoke-group assignment, and stop-testing exercise to `docs/testing/apple-testflight-smoke-results.md`. Do not record tester email addresses, account identifiers, credentials, APNs tokens, task content, or journal content.

Validate repository configuration with `python3 scripts/validate_apple_archive.py`; pass `--ios-archive` and `--macos-archive` for signed archive inspection. App Store Connect remains intentionally unconfigured until an authorized release operator completes this checklist. This process creates no AWS resources.
