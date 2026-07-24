import importlib.util
import io
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).parents[1] / "export_todos.py"
SPEC = importlib.util.spec_from_file_location("export_todos", MODULE_PATH)
export_todos = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(export_todos)


class Payload(io.BytesIO):
    pass


class LambdaClient:
    def __init__(self, csv_bytes=b"id,label\r\n1,Milk\r\n"):
        self.csv_bytes = csv_bytes
        self.calls = []
        self.status_calls = 0

    def invoke(self, **kwargs):
        request = json.loads(kwargs["Payload"])
        self.calls.append(request)
        if request["action"] == "start":
            body = {"job": {"id": "job-1", "status": "pending"}}
        elif request["action"] == "status":
            self.status_calls += 1
            digest = __import__("hashlib").sha256(self.csv_bytes).hexdigest()
            body = {
                "job": {"id": "job-1", "status": "ready"},
                "result": {
                    "downloadUrl": "https://download.invalid/result",
                    "manifest": {
                        "byteLength": len(self.csv_bytes),
                        "sha256": digest,
                        "rowCount": 1,
                    },
                },
            }
        else:
            body = {"job": {"id": "job-1", "status": "acknowledged"}}
        return {"Payload": Payload(json.dumps(body).encode())}


class ExportTodosTests(unittest.TestCase):
    def test_region_is_restricted_to_us_west_2(self):
        with self.assertRaises(SystemExit):
            export_todos.parser().parse_args(["--output", "x.csv", "--region", "us-east-1"])

    def test_existing_destination_requires_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "todos.csv"
            destination.write_text("existing")
            result = export_todos.main(
                ["--output", str(destination), "--function-name", "export-function"]
            )
            self.assertEqual(result, export_todos.EXIT_USAGE)
            self.assertEqual(destination.read_text(), "existing")

    def test_download_is_verified_private_atomic_and_acknowledged(self):
        client = LambdaClient()
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "todos.csv"
            session = mock.Mock()
            session.client.return_value = client
            response = mock.MagicMock()
            response.__enter__.return_value = io.BytesIO(client.csv_bytes)
            with mock.patch.object(export_todos.boto3, "Session", return_value=session), mock.patch.object(
                export_todos.urllib.request, "urlopen", return_value=response
            ):
                result = export_todos.main(
                    [
                        "--output",
                        str(destination),
                        "--function-name",
                        "export-function",
                        "--poll-seconds",
                        "0.1",
                    ]
                )
            self.assertEqual(result, export_todos.EXIT_OK)
            self.assertEqual(destination.read_bytes(), client.csv_bytes)
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o600)
            self.assertEqual([call["action"] for call in client.calls], ["start", "status", "acknowledge"])

    def test_manifest_mismatch_never_replaces_destination(self):
        client = LambdaClient()
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "todos.csv"
            session = mock.Mock()
            session.client.return_value = client
            response = mock.MagicMock()
            response.__enter__.return_value = io.BytesIO(b"corrupt")
            with mock.patch.object(export_todos.boto3, "Session", return_value=session), mock.patch.object(
                export_todos.urllib.request, "urlopen", return_value=response
            ):
                result = export_todos.main(
                    ["--output", str(destination), "--function-name", "export-function", "--poll-seconds", "0.1"]
                )
            self.assertEqual(result, export_todos.EXIT_VERIFY)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
