#!/bin/bash
set -euo pipefail

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
results_root=${NAASEH_APPLE_RESULTS_ROOT:-/tmp/naaseh-apple-release-gates}
mkdir -p "$results_root"

run() {
  name=$1
  shift
  echo "[apple-release] $name"
  "$@" 2>&1 | tee "$results_root/$name.log"
}

cd "$repository_root"
run contracts node tools/validate-apple-contract-interop.mjs
run archive-config python3 scripts/validate_apple_archive.py
run archive-validator-tests python3 -m unittest scripts.tests.test_validate_apple_archive
run api-release npx vitest run \
  apps/api/test/client/native-release-compatibility.test.ts \
  apps/api/test/client/native-compatibility.test.ts \
  apps/api/test/client/native-telemetry.test.ts
run swift-package env \
  CLANG_MODULE_CACHE_PATH=/tmp/naaseh-clang-module-cache \
  SWIFT_MODULECACHE_PATH=/tmp/naaseh-swift-module-cache \
  swift test --package-path packages/apple --disable-sandbox
run ios-build sh tools/run-apple-validation.sh build-ios
run macos-build sh tools/run-apple-validation.sh build-macos

cat <<'EOF'
[apple-release] Automated local gates passed.
Physical iPhone/iPad/Mac Siri, notification, upgrade, and TestFlight matrices remain mandatory
release evidence. VoiceOver support is implemented, but manual VoiceOver testing is optional for
this release. This script intentionally does not promote or upload a build.
EOF
