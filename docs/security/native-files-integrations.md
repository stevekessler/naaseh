# Native files and exports

Selected documents, photos, and camera captures are copied into a no-backup protected staging
directory, encrypted with AES-256-GCM before upload, and removed deterministically after success,
cancellation, or terminal failure. The 25 MiB limit and allowlisted content types are enforced
before encryption. Downloads cannot be previewed until the server scan reports clean. Decrypted
Quick Look and share files are short-lived and removed on background, lock, sign-out, expiry, or
cleanup recovery.

Report exports are requested only while online. The client validates the download expiry and
SHA-256 digest before saving or sharing plaintext. Google Tasks and its OAuth/token paths are
retired from every client and backend. No filename, attachment content, report row, or export URL is
written to telemetry.
