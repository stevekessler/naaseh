#!/bin/sh
set -eu

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
derived_root=${NAASEH_DERIVED_DATA_ROOT:-/tmp/naaseh-apple-derived}
swift_cache=${NAASEH_SWIFT_CACHE_ROOT:-/tmp/naaseh-swift-cache}
project="$repository_root/apps/apple/Naaseh.xcodeproj"

export SWIFTPM_MODULECACHE_OVERRIDE="$swift_cache/swiftpm"
export CLANG_MODULE_CACHE_PATH="$swift_cache/clang"

run_swift_tests() {
  swift test --disable-sandbox --package-path "$repository_root/packages/apple"
}

build_ios() {
  xcodebuild \
    -project "$project" \
    -scheme Naaseh-iOS \
    -configuration Debug \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$derived_root/ios" \
    CODE_SIGNING_ALLOWED=NO \
    build
}

build_macos() {
  xcodebuild \
    -project "$project" \
    -scheme Naaseh-macOS \
    -configuration Debug \
    -destination 'platform=macOS,arch=arm64' \
    -derivedDataPath "$derived_root/macos" \
    CODE_SIGNING_ALLOWED=NO \
    build
}

archive_scheme() {
  scheme=$1
  destination=$2
  archive_path=$3
  xcodebuild \
    -project "$project" \
    -scheme "$scheme" \
    -configuration TestFlight \
    -destination "$destination" \
    -archivePath "$archive_path" \
    archive
}

case "${1:-all}" in
  test)
    run_swift_tests
    ;;
  build-ios)
    build_ios
    ;;
  build-macos)
    build_macos
    ;;
  archive-ios)
    archive_scheme Naaseh-iOS 'generic/platform=iOS' "$derived_root/archives/Naaseh-iOS.xcarchive"
    ;;
  archive-macos)
    archive_scheme Naaseh-macOS 'generic/platform=macOS' "$derived_root/archives/Naaseh-macOS.xcarchive"
    ;;
  release-gates)
    "$repository_root/tools/run-apple-release-gates.sh"
    ;;
  all)
    run_swift_tests
    build_ios
    build_macos
    ;;
  *)
    echo "usage: $0 [test|build-ios|build-macos|archive-ios|archive-macos|release-gates|all]" >&2
    exit 64
    ;;
esac
