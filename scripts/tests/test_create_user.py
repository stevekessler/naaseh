import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).parents[1] / "create_user.py"


def load_module():
    spec = importlib.util.spec_from_file_location("create_user", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class CreateUserTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.lambda_client = Mock()
        self.lambda_client.invoke.return_value = {
            "StatusCode": 200,
            "Payload": io.BytesIO(json.dumps({
                "version": "naaseh.provision-user-result/v1",
                "created": True,
                "user": {
                    "id": "01J00000000000000000000000",
                    "username": "steve",
                    "displayName": "Steve",
                    "role": "admin",
                    "active": True,
                    "sessionEpoch": 0,
                },
            }).encode()),
        }

    def run_cli(self, argv, password="correct horse battery staple", pin="246810"):
        output, error = io.StringIO(), io.StringIO()
        session = Mock()
        session.client.return_value = self.lambda_client
        with patch.object(self.module.boto3, "Session", return_value=session) as session_factory, patch.object(
            self.module.getpass, "getpass", side_effect=[password, password, pin, pin]
        ), contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            code = self.module.main(argv)
        return code, output.getvalue(), error.getvalue(), session_factory

    def test_defaults_to_user_and_us_west_2_with_hidden_confirmed_prompts(self):
        code, output, error, session = self.run_cli(
            ["--username", " Steve ", "--display-name", "Steve", "--function-name", "provision"]
        )
        self.assertEqual(code, 0)
        session.assert_called_once_with(region_name="us-west-2", profile_name=None)
        payload = json.loads(self.lambda_client.invoke.call_args.kwargs["Payload"])
        self.assertEqual(payload["role"], "user")
        self.assertNotIn("correct horse", output + error)
        self.assertNotIn("246810", output + error)

    def test_admin_role_profile_and_idempotency_token_are_forwarded(self):
        code, _, _, session = self.run_cli([
            "--username", "steve", "--display-name", "Steve", "--role", "admin",
            "--profile", "operators", "--idempotency-token", "request-1",
            "--function-name", "provision",
        ])
        self.assertEqual(code, 0)
        session.assert_called_once_with(region_name="us-west-2", profile_name="operators")
        payload = json.loads(self.lambda_client.invoke.call_args.kwargs["Payload"])
        self.assertEqual((payload["role"], payload["idempotencyToken"]), ("admin", "request-1"))

    def test_rejects_other_regions_before_invocation(self):
        with self.assertRaises(SystemExit):
            self.module.main([
                "--username", "steve", "--display-name", "Steve", "--region", "us-east-1",
                "--function-name", "provision",
            ])

    def test_password_stdin_reads_two_secret_lines_without_argv_credentials(self):
        session = Mock()
        session.client.return_value = self.lambda_client
        with patch.object(self.module.boto3, "Session", return_value=session), patch(
            "sys.stdin", io.StringIO("correct horse battery staple\n246810\n")
        ), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = self.module.main([
                "--username", "steve", "--display-name", "Steve", "--password-stdin",
                "--function-name", "provision",
            ])
        self.assertEqual(code, 0)

    def test_confirmation_conflict_and_service_failures_have_stable_exit_codes(self):
        with patch.object(self.module.getpass, "getpass", side_effect=["one password long", "different"]):
            self.assertEqual(self.module.main([
                "--username", "steve", "--display-name", "Steve", "--function-name", "provision"
            ]), self.module.EXIT_USAGE)
        self.lambda_client.invoke.return_value = {
            "StatusCode": 200,
            "Payload": io.BytesIO(json.dumps({"error": {"code": "username_conflict"}}).encode()),
        }
        self.assertEqual(self.run_cli([
            "--username", "steve", "--display-name", "Steve", "--function-name", "provision"
        ])[0], self.module.EXIT_CONFLICT)


if __name__ == "__main__":
    unittest.main()
