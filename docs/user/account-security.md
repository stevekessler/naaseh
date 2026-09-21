# Account security

Administrators must use two-factor authentication (TFA). Other users may enable it from **Profile → Account security**. Enrollment begins after a password check, signs the current browser out, and completes during the next sign-in. Add the displayed setup key to an authenticator, enter its current six-digit code, and save the ten one-use recovery codes before continuing.

When TFA is enabled, sign-in accepts either a current authenticator code or one unused recovery code. A code cannot be replayed. Password and factor changes require the current password and a current factor. Replacing recovery codes invalidates every previous code; administrators cannot disable TFA.

After a successful code check, **Remember this browser for 30 days** stores a separate server-verified browser trust cookie. Future sign-ins on that browser still require the password but can skip the code until the fixed 30-day expiry. In **Profile → Account security → Remembered browsers**, you can name each browser and forget either this browser or another one. Forgetting removes only that browser's TFA exemption; an already-active sign-in remains active. Browser labels are inferred from the user agent and may not identify the exact device model, so rename them when needed. Browsers remembered before this list was added appear after their next successful use. Clearing browser cookies or using private browsing also removes the local proof and requires a code again.

The sign-in page can reset a password using the username, account PIN, and a new password. The response is deliberately identical whether the account or PIN was valid. Password and factor changes revoke all existing sessions. A browser locks protected local data while checking its session at startup and reconnect; revoked sessions cause an atomic local-data purge.

If validation cannot run while offline, cached account data remains locked. Reconnect and choose **Retry validation**. If clearing browser storage fails, the data remains locked and retryable rather than exposing a partial cache.
