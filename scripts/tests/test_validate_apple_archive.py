import json
import plistlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_apple_archive import ValidationError, load_manifest, validate_archive, validate_repository  # noqa: E402


class ManifestTests(unittest.TestCase):
    def test_repository_release_configuration_is_safe(self):
        root = Path(__file__).resolve().parents[2]
        manifest = validate_repository(root)
        self.assertEqual(manifest["productionOrigin"], "https://gsd.thepandas.link")

    def test_rejects_nonproduction_origin(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps({
                "schemaVersion": 1, "marketingVersion": "1", "buildNumber": 1,
                "minimumOS": {"ios": "27.0", "ipados": "27.0", "macos": "27.0"},
                "architecture": "arm64", "contractVersion": 4,
                "productionOrigin": "https://example.invalid", "records": []
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValidationError, "not production"):
                load_manifest(path)


class ArchiveTests(unittest.TestCase):
    @patch("validate_apple_archive.subprocess.run")
    def test_validates_bundle_version_architecture_signature_and_privacy(self, run):
        entitlements = plistlib.dumps({
            "aps-environment": "production",
            "com.apple.security.application-groups": ["group.link.thepandas.naaseh"],
        })
        run.side_effect = [
            type("Result", (), {"stdout": "arm64\n", "stderr": ""})(),
            type("Result", (), {"stdout": b"", "stderr": b""})(),
            type("Result", (), {"stdout": entitlements, "stderr": b""})(),
        ]
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "Naaseh.xcarchive"
            app = archive / "Products/Applications/Naaseh.app"
            app.mkdir(parents=True)
            with (app / "Info.plist").open("wb") as handle:
                plistlib.dump({
                    "CFBundleIdentifier": "link.thepandas.naaseh", "CFBundleShortVersionString": "0.1.0",
                    "CFBundleVersion": "1", "MinimumOSVersion": "27.0", "CFBundleExecutable": "Naaseh"
                }, handle)
            (app / "PrivacyInfo.xcprivacy").write_text("privacy", encoding="utf-8")
            (app / "Naaseh").write_bytes(b"binary")
            validate_archive(archive, "link.thepandas.naaseh", "27.0", "0.1.0", 1)
        self.assertEqual(run.call_count, 3)


if __name__ == "__main__":
    unittest.main()
