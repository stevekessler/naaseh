# Native Notification Delivery Runbook

Native APNs delivery reuses the existing notification Lambda, DynamoDB table, EventBridge Scheduler
role, runtime notification secret, task log group, and operational dashboard. It creates no SNS
mobile-push application, queue, table, log group, or always-on provider.

## Apple portal setup for both bundle IDs

Use one **team-scoped** APNs token-signing key for both Na'aseh topics. This avoids a second AWS
secret and is supported by Apple's token authentication. The topics are the bundle IDs:

- iPhone/iPad: `link.thepandas.naaseh`
- Mac: `link.thepandas.naaseh.macos`

1. As the Apple team Account Holder or Admin, open **Certificates, Identifiers & Profiles**.
2. Open each explicit App ID and confirm **Push Notifications** is enabled. Save any changed App ID
   and let Xcode refresh its automatic provisioning profile.
3. Open **Keys**, click **+**, and name the key `Naaseh APNs Production`.
4. Enable **Apple Push Notification service**, choose a team-scoped key, and choose the environment
   configuration that supports Sandbox and Production if Apple presents that choice. Production is
   mandatory for TestFlight.
5. Confirm and download the `.p8` file exactly once. Record the 10-character Key ID shown by Apple
   and the Team ID from the membership page.
6. Move the `.p8` file immediately into the approved secret manager. Do not rename it to a generic
   file and leave it in Downloads. Apple does not offer a second download.

Do not create an APNs certificate, SNS Platform Application, separate key per app, or separate AWS
secret. If organizational policy requires topic-specific keys instead, stop: the current runtime
expects one key and must be deliberately extended and reviewed before using two keys.

## Update the existing AWS secret

The shared notification secret is the existing Secrets Manager resource created as
`WebPushCredentials`. Preserve its current VAPID fields and add this nested object:

```json
{
  "subject": "<existing value>",
  "publicKey": "<existing value>",
  "privateKey": "<existing VAPID value>",
  "apns": {
    "teamId": "<Apple Team ID>",
    "keyId": "<APNs Key ID>",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n<contents of the p8 key>\n-----END PRIVATE KEY-----",
    "topics": {
      "ios": "link.thepandas.naaseh",
      "macos": "link.thepandas.naaseh.macos"
    }
  }
}
```

Use the AWS console so the private key does not enter shell history:

1. Sign in to the production AWS account and select `us-west-2`.
2. Open **Secrets Manager** and locate the secret whose CloudFormation resource is
   `WebPushCredentials`. Confirm its stack/tag belongs to `NaasehProd`.
3. Choose **Retrieve secret value**, then **Edit**. Copy the current JSON to the approved secret
   manager as a recoverable backup. Do not paste it into a ticket or repository file.
4. Add only the `apns` object shown above. The inner APNs `privateKey` is the `.p8` PEM text; the
   top-level `privateKey` remains the existing VAPID key and must not be replaced.
5. Save a new secret version. Record only the secret ARN, version ID, date, and operator in the
   private release worksheet—never the secret value.
6. Leave the prior version available for rollback until delivery succeeds on both topics.

No CDK deployment is required merely to change the secret value, but the native notification code
and routes must already be deployed. Follow `docs/operations/native-production-readiness.md` before
testing a production-backed build.

## Validate and rotate

1. Install a signed development build on physical hardware and verify sandbox delivery if the key
   configuration supports it.
2. Install the processed TestFlight builds and register one iPhone/iPad installation and one Mac
   installation. TestFlight tokens use the production APNs environment.
3. Send one generic synthetic alert to each topic. Confirm delivery and the `APNSDeliveries` metric.
4. Confirm there are no `configuration`, `BadTopic`, `InvalidProviderToken`, or `TopicDisallowed`
   failures. A success for one bundle ID does not validate the other.
5. For rotation, create/download the replacement key, update the same secret, verify both topics,
   and only then revoke the old key in Apple's portal. If validation fails, restore the previous AWS
   secret version before revoking anything.

Investigate `APNSDeliveryFailures` by the bounded `outcome` dimension: `invalid-token` deletes the
owned installation, `retryable` exhausts three attempts, `permanent` indicates payload/topic/input
configuration, and `configuration` means the shared secret is incomplete. Never log tokens,
provider JWTs, private keys, task labels, payload bodies, or user identifiers.

For a delivery incident, confirm the scheduled occurrence, re-check current task ownership and open
status, inspect aggregate APNs/Web Push metrics, and use a dedicated smoke installation. Do not
replay an occurrence ID that may already have produced a durable effect.
