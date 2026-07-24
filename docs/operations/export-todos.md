# Export all to-do items

Run `python3 scripts/export_todos.py --output /secure/path/todos.csv --region us-west-2
--function-name "$NAASEH_EXPORT_TODOS_FUNCTION"` from an IAM identity allowed to invoke only
the export coordinator. The output is sensitive and is created with mode `0600`.

The command exits `0` only after validating the SHA-256 digest, byte length, CSV row count,
flushing the file, and atomically moving it into place. Exit `2` means invalid arguments or an
existing destination, `3` means authorization was denied, `4` means the workflow failed or
could not be reached, and `5` means downloaded content failed verification. A partial download
is removed and never receives the requested filename. After success, the command acknowledges
the result so temporary encrypted storage can be deleted.
