# Completed-task reports and CSV export

Completed-task dates are calculated in the current browser time zone. There is no time-zone field to
configure, and an obsolete saved report-zone value is removed without changing the saved week-start
preference. Refocusing the app after the browser zone changes refreshes the displayed boundaries.

Choose **Export CSV** to start a private, snapshot-consistent server export for the current filters.
The button shows progress while the export runs. No browser-built partial CSV is offered: the file is
downloaded only after its exact header, row count, byte length, and SHA-256 checksum are verified by
the server and the downloaded bytes pass checksum/header/row-count validation again in the browser.

The stable schema is `naaseh.completed-tasks/v1` and contains the 56 columns documented in
`specs/009-task-security-modernization/contracts/completed-task-csv.md`. Missing optional values are
empty. Repeated values are deterministic JSON. Hidden memo plaintext/ciphertext, credentials, keys,
attachment bytes and storage paths, revision history, deleted records, and private download URLs are
never CSV fields. Spreadsheet-like text is neutralized before RFC 4180 quoting.

Ordinary users export only currently authorized completion rows and fields. All-user export is a
separate administrator-only, explicitly confirmed, audited action.
