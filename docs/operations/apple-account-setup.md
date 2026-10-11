# Apple Developer account setup for Na'aseh

This is a one-time operator procedure. The first release is internal TestFlight only, but it still
requires an active Apple Developer Program membership. A free Personal Team can run an app on a
developer's own device but cannot provide the planned TestFlight distribution.

## 1. Choose the legal account type

Choose before enrolling because it controls the seller/developer name and who can own the apps.

- Choose **Organization** if a corporation, LLC, limited partnership, educational institution, or
  other Apple-accepted legal entity will own Na'aseh. Use the exact legal name and obtain or verify
  its D-U-N-S number. Apple does not accept a DBA or trade name as the organization.
- Choose **Individual** if Steve will personally own the apps or operates as a sole proprietor. The
  apps will be associated with the person's legal name, and no D-U-N-S number is required.

Record the decision, legal owner name, and Account Holder in the private release records. Do not put
identity documents, D-U-N-S evidence, phone numbers, or payment details in this repository.

## 2. Prepare the Apple Account

1. Use a long-lived Apple Account controlled by the intended Account Holder. Do not use a shared
   password or an employee/student managed account.
2. Enable two-factor authentication and verify the trusted phone numbers and recovery options.
3. Sign in at <https://developer.apple.com/account/> and accept the current Apple Developer
   Agreement.
4. If enrolling as an organization, use Apple's D-U-N-S lookup and wait for any D&B update to reach
   Apple before continuing.
5. Enroll at <https://developer.apple.com/programs/enroll/>. Complete identity/legal-authority
   verification and pay the annual membership fee shown by Apple.
6. Wait until the membership page shows the program as active. Do not create production signing
   material while enrollment is pending.

## 3. Secure the team and delegate only what is needed

1. Sign in to <https://appstoreconnect.apple.com/> as the Account Holder and accept any current
   agreements in **Business**.
2. In **Users and Access**, invite the release operator. Grant **Admin** only if that person must
   create identifiers or APNs keys; otherwise **App Manager** plus **Developer**-level build access
   is sufficient for ordinary App Store Connect work.
3. Keep the Account Holder account for legal agreements and emergency recovery, not routine uploads.
4. Store recovery codes and any API/APNs private keys in the existing approved password/secret
   manager. Never send them through chat, email, issue trackers, screenshots, or Git.

## 4. Register both identifiers and capabilities

In **Certificates, Identifiers & Profiles > Identifiers**, create explicit App IDs for:

- `link.thepandas.naaseh` — universal iPhone/iPad app
- `link.thepandas.naaseh.macos` — native Apple-silicon Mac app

For each identifier, enable Push Notifications and the capabilities already present in the Xcode
target. Register the App Group used by the checked-in entitlements and associate it with both app
IDs where the portal permits. Do not create wildcard IDs, Catalyst IDs, or an Intel-only record.

In Xcode:

1. Open `apps/apple/Naaseh.xcworkspace`.
2. Open **Xcode > Settings > Accounts**, add the enrolled Apple Account, and download profiles if
   prompted.
3. For every application/extension target, open **Signing & Capabilities**, select the same Team,
   keep the checked-in bundle identifier, and use automatic signing for the first release.
4. Build once for an attached iPhone/iPad and once for **My Mac**. Resolve entitlement/signing errors
   in the portal or target settings; do not remove capabilities merely to make the build pass.

## 5. Create the App Store Connect records

Before the first upload, use **Apps > + > New App**. Create the iOS/iPadOS record for
`link.thepandas.naaseh` and the macOS record for `link.thepandas.naaseh.macos`. Use distinct,
non-secret SKUs such as `naaseh-ios` and `naaseh-macos`. Keep access limited to the people who need
the app unless the team is intentionally small.

Create an internal TestFlight group named **Naaseh Smoke**, turn off automatic distribution, and add
only the authorized smoke tester. Record the non-secret app record IDs and team ID in the private
release worksheet, not credentials in Git.

## Completion check

The account setup is complete only when both identifiers exist, Xcode can sign both apps, both App
Store Connect records exist, and the `Naaseh Smoke` internal group is visible. APNs key setup is a
separate procedure in `docs/runbooks/native-notification-delivery.md`.
