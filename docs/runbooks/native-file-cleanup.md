# Native temporary-file cleanup

Run cleanup at launch, after every upload/preview/export terminal state, when protected data becomes
unavailable, and at sign-out. Delete files in the app’s dedicated protected staging and preview
directories only; never recursively target a container root. Treat missing files as already clean.

If cleanup fails, lock the affected preview/export workflow, record only the bounded
`temporary_cleanup_failed` diagnostic with correlation ID and file class, and retry on the next
foreground activation. Never log paths, filenames, URLs, report contents, or attachment metadata.
Users may retry cleanup without re-uploading encrypted server data.
