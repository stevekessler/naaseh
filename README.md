<p align="center">
	<img src="./assets/naaseh_logo.png" alt="Na'aseh logo">
</p>
# Na'aseh Task Manager

Na'aseh is a responsive, offline-capable task manager for Steve and collaborators. This repository contains a React PWA, bounded Node Lambda handlers, a Python operator command, shared domain/contracts, and AWS CDK infrastructure. Production is served over HTTPS at `gsd.thepandas.link`. The application, data, PITR, and locked backups remain in `us-west-2`; a small required edge stack in `us-east-1` holds the CloudFront certificate and WAF. Total loss of `us-west-2` is outside the current recovery scope.

## Local development

1. Install Node.js 24.x and run `npm install`.
2. Copy `.env.example` to a local untracked environment file if needed.
3. Run `npm run dev`, then open `http://127.0.0.1:5173`.
4. In development only, entered credentials fall back to the local Steve profile when the API is unavailable. Production never enables this fallback.

Run `npm run validate` for type checking, linting, unit tests, and builds, and `npm run test:python` for the operator-command tests. Pull requests use the focused `npm run test:e2e:quick` browser gate; run `npm run test:e2e` for the complete four-profile browser suite. Before AWS work, use `npm run validate:pre-aws`; add the complete browser suite with `npm run validate:pre-aws:browsers`. On a Mac with Safari Technology Preview installed, run `npm run test:safari-preview` for the independent native-WebDriver smoke check. `VERBOSE_LOGGING` is enabled only by the literal value `true`; it defaults off. Logs must never include passwords, PINs, cookies, tokens, cryptographic material, or protected task content.

See `specs/001-naaseh-v1-baseline/` for requirements and architecture. Before the first cloud deployment, follow the [first AWS deployment runbook](docs/operations/first-aws-deployment.md); see `docs/operations/recovery.md` for recovery controls.

## Lists and completion feedback

Lists are named collections whose items can be edited, reordered, completed with an animated
strike, removed, and valued. Costs are negative by default, positive credits are supported, and a
signed total remains at the bottom. Reusable global-directory entries can be added to any list;
each linked item may override its name or amount and reset to the latest global value. Lists can be
global, limited to a group, locked to their owner, or copied with clean attachment references.

Tasks and list items share the same completion animation and optional scrunch sound. The sound is
on by default and can be disabled from the header; reduced-motion users receive the completed state
without animation. Search defaults to all content and can be narrowed to Lists or To-do Lists.

PDF, JPEG, PNG, text, and CSV files up to 25 MiB can be attached to tasks and list items while
online. Files are encrypted in private, versioned S3 storage and remain unavailable until malware
scanning reports clean. The interface shows upload progress, scan state, retry, download, and
remove actions. Administrators may read all application content but cannot mutate content they do
not own and cannot decrypt another user's hidden memo.

Operators can export every to-do field with `scripts/export_todos.py`; setup, verification, cleanup,
and exit codes are documented in [the export runbook](docs/operations/export-todos.md).

User bootstrap and administration use the secret-safe Python command in `scripts/create_user.py`;
see [the provisioning runbook](docs/operations/user-provisioning.md). The retired TypeScript tool
must not be used because positional credentials are visible in process listings.

## Archive, Categories, Projects, and reporting

Finished to-dos and Lists move to Archive instead of being deleted. Restoring a completed to-do
reopens it and reverses its previous completion credit; completing it again creates new credit.
Categories contain Projects, work may be assigned to one Project or left Unassigned, and a
Project assignment always supplies its parent Category. The Projects page shows active to-do and
List counts plus Project end dates. The Dashboard shows personal daily, weekly, or monthly
completion totals in the selected time zone and retains completion-time labels after organization
changes. Administrators can edit, archive, restore, or—only when empty—permanently delete
Categories and Projects. Every permanent delete presents an irreversible warning and has no
recycle-bin recovery path. See [the user guide](docs/user/archive-project-reporting.md).
