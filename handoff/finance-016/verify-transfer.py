#!/usr/bin/env python3
"""Verify handoff file bytes against the committed transfer manifest."""

import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / "handoff/finance-016/transfer-manifest.json").read_text())
failures = []
for entry in manifest["files"]:
    path = root / entry["path"]
    if not path.is_file():
        failures.append(f"Missing: {entry['path']}")
        continue
    data = path.read_bytes()
    if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        failures.append(f"Changed: {entry['path']}")
if failures:
    print("\n".join(failures), file=sys.stderr)
    sys.exit(1)
print(f"Verified {len(manifest['files'])} transfer files against SHA-256 manifest.")
print("Historical validation is documented separately; this is a file-integrity check.")
