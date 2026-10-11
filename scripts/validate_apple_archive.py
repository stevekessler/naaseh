#!/usr/bin/env python3
"""Validate Na'aseh Apple release configuration and exported archives without credentials."""

from __future__ import annotations

import argparse
import json
import plistlib
import subprocess
from pathlib import Path


class ValidationError(RuntimeError):
    pass


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    required = {"schemaVersion", "marketingVersion", "buildNumber", "minimumOS", "architecture", "contractVersion", "productionOrigin", "records"}
    missing = required - data.keys()
    if missing:
        raise ValidationError(f"distribution manifest missing: {', '.join(sorted(missing))}")
    if data["productionOrigin"] != "https://gsd.thepandas.link":
        raise ValidationError("release origin is not production")
    if data["architecture"] != "arm64" or data["minimumOS"] != {"ios": "27.0", "ipados": "27.0", "macos": "27.0"}:
        raise ValidationError("unsupported architecture or deployment target")
    return data


def validate_repository(root: Path) -> dict:
    manifest_path = root / "apps/apple/Distribution/DistributionManifest.json"
    manifest = load_manifest(manifest_path)
    config = (root / "apps/apple/Config/TestFlight.xcconfig").read_text(encoding="utf-8")
    project = (root / "apps/apple/Naaseh.xcodeproj/project.pbxproj").read_text(encoding="utf-8")
    if "https:/$()/gsd.thepandas.link" not in config:
        raise ValidationError("TestFlight origin is not production")
    forbidden = ("localhost", "127.0.0.1", "AWS_SECRET", "PRIVATE_KEY", "SESSION_SECRET", "APNS_KEY")
    if any(value.lower() in config.lower() for value in forbidden):
        raise ValidationError("TestFlight configuration contains a forbidden value")
    for required in ("ARCHS = arm64", "IPHONEOS_DEPLOYMENT_TARGET = 27.0", "MACOSX_DEPLOYMENT_TARGET = 27.0", "SUPPORTS_MACCATALYST = NO"):
        if required not in project:
            raise ValidationError(f"project missing required release setting: {required}")
    if "x86_64" in project:
        raise ValidationError("Intel architecture is unsupported")
    for record in manifest["records"]:
        privacy = (manifest_path.parent / record["privacyManifest"]).resolve()
        with privacy.open("rb") as handle:
            plistlib.load(handle)
    for name in ("ExportOptions-iOS.plist", "ExportOptions-macOS.plist"):
        with (manifest_path.parent / name).open("rb") as handle:
            options = plistlib.load(handle)
        if options.get("method") != "app-store-connect" or options.get("destination") != "upload":
            raise ValidationError(f"{name} is not an App Store Connect upload export")
        if options.get("manageAppVersionAndBuildNumber") is not False:
            raise ValidationError(f"{name} must preserve the reviewed build number")
    return manifest


def _app_in_archive(archive: Path) -> Path:
    apps = sorted((archive / "Products/Applications").glob("*.app"))
    if len(apps) != 1:
        raise ValidationError(f"expected one application in {archive}")
    return apps[0]


def validate_archive(
    archive: Path,
    expected_bundle: str,
    expected_minimum: str,
    expected_version: str,
    expected_build: int,
    minimum_key: str = "MinimumOSVersion",
) -> None:
    app = _app_in_archive(archive)
    with (app / "Info.plist").open("rb") as handle:
        info = plistlib.load(handle)
    expected = {
        "CFBundleIdentifier": expected_bundle,
        "CFBundleShortVersionString": expected_version,
        "CFBundleVersion": str(expected_build),
        minimum_key: expected_minimum,
    }
    for key, value in expected.items():
        if info.get(key) != value:
            raise ValidationError(f"{app.name}: {key} was {info.get(key)!r}, expected {value!r}")
    if not (app / "PrivacyInfo.xcprivacy").is_file():
        raise ValidationError(f"{app.name}: privacy manifest missing")
    executable = app / info["CFBundleExecutable"]
    architectures = subprocess.run(["lipo", "-archs", str(executable)], check=True, capture_output=True, text=True).stdout.split()
    if architectures != ["arm64"]:
        raise ValidationError(f"{app.name}: expected arm64 only, got {architectures}")
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True, capture_output=True)
    entitlement_result = subprocess.run(
        ["codesign", "-d", "--entitlements", ":-", str(app)],
        check=True, capture_output=True,
    )
    entitlement_bytes = entitlement_result.stdout or entitlement_result.stderr
    try:
        entitlements = plistlib.loads(entitlement_bytes)
    except Exception as error:
        raise ValidationError(f"{app.name}: could not parse signed entitlements") from error
    if entitlements.get("aps-environment") != "production":
        raise ValidationError(f"{app.name}: production APNs entitlement missing")
    groups = entitlements.get("com.apple.security.application-groups", [])
    if "group.link.thepandas.naaseh" not in groups:
        raise ValidationError(f"{app.name}: application group entitlement missing")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--ios-archive", type=Path)
    parser.add_argument("--macos-archive", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = validate_repository(args.root)
    records = {record["platform"]: record for record in manifest["records"]}
    if args.ios_archive:
        validate_archive(args.ios_archive, records["ios-ipados"]["bundleId"], "27.0", manifest["marketingVersion"], manifest["buildNumber"])
    if args.macos_archive:
        validate_archive(args.macos_archive, records["macos"]["bundleId"], "27.0", manifest["marketingVersion"], manifest["buildNumber"], minimum_key="LSMinimumSystemVersion")
    print("Apple release configuration and supplied archives are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
