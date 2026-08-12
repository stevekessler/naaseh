import argparse
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from validate_production import (  # noqa: E402
    CommandRunner,
    ProductionValidator,
    Reporter,
    ValidationError,
    parse_args,
)


class ReporterTests(unittest.TestCase):
    def test_existing_directory_creates_timestamped_log(self):
        with tempfile.TemporaryDirectory() as directory:
            reporter = Reporter(False, directory)
            try:
                self.assertEqual(reporter.log_path.parent, Path(directory))
                self.assertRegex(
                    reporter.log_path.name,
                    r"^naaseh-production-validation-\d{8}-\d{6}\.log$",
                )
            finally:
                reporter.close()

    def test_concise_screen_still_writes_verbose_detail_to_log(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "validation.log"
            reporter = Reporter(False, str(log_path))
            try:
                with patch("sys.stdout", new=io.StringIO()) as output:
                    reporter.write("diagnostic", verbose_only=True)
                    self.assertEqual(output.getvalue(), "")
            finally:
                reporter.close()
            self.assertIn("diagnostic", log_path.read_text(encoding="utf-8"))


class CommandRunnerTests(unittest.TestCase):
    def test_sensitive_command_and_error_are_redacted(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "validation.log"
            reporter = Reporter(True, str(log_path))
            runner = CommandRunner(reporter)
            completed = subprocess.CompletedProcess(
                ["secret-command", "private-value"], 1, "", "private-error"
            )
            try:
                with patch("subprocess.run", return_value=completed):
                    with self.assertRaisesRegex(ValidationError, "\[redacted\]"):
                        runner.run(["secret-command", "private-value"], sensitive=True)
            finally:
                reporter.close()
            log = log_path.read_text(encoding="utf-8")
            self.assertIn("[REDACTED SENSITIVE COMMAND]", log)
            self.assertNotIn("private-value", log)
            self.assertNotIn("private-error", log)


class ArgumentTests(unittest.TestCase):
    def test_pre_wrapper_defaults_to_pre_and_concise(self):
        args = parse_args([], default_phase="pre")
        self.assertEqual(args.phase, "pre")
        self.assertFalse(args.verbose)

    def test_verbose_and_no_verbose_are_mutually_exclusive(self):
        with self.assertRaises(SystemExit):
            parse_args(["--verbose", "--no-verbose"])


class PhaseTests(unittest.TestCase):
    def args(self, phase):
        return argparse.Namespace(
            phase=phase,
            profile="naaseh-admin",
            account="093733938983",
            region="us-west-2",
            edge_region="us-east-1",
            stack="NaasehProd",
            edge_stack="NaasehEdge",
            base_url="https://gsd.thepandas.link",
            github_environment="production",
            pr_number=None,
            run_id=None,
            check_git=False,
            skip_git=False,
            http_timeout=15,
        )

    def collect_checks(self, phase):
        reporter = Reporter(False, None)
        validator = ProductionValidator(self.args(phase), reporter)
        checks = []
        validator.check = lambda name, operation: checks.append(name)
        validator.warn_check = lambda name, operation: checks.append(name)
        try:
            validator.run()
        finally:
            reporter.close()
        return checks

    def test_pre_phase_checks_git_but_not_deployed_endpoint(self):
        checks = self.collect_checks("pre")
        self.assertIn("local release checkout", checks)
        self.assertNotIn("production HTTPS endpoint", checks)
        self.assertNotIn("production deployment workflow", checks)

    def test_post_phase_checks_workflow_and_endpoint(self):
        checks = self.collect_checks("post")
        self.assertIn("production deployment workflow", checks)
        self.assertIn("production HTTPS endpoint", checks)
        self.assertNotIn("local release checkout", checks)

    def test_http_request_uses_curl_and_parses_redirect(self):
        reporter = Reporter(False, None)
        validator = ProductionValidator(self.args("post"), reporter)
        try:
            with patch.object(
                validator.commands,
                "run",
                return_value="301\nhttps://gsd.thepandas.link/",
            ) as run:
                status, location = validator.request(
                    "http://gsd.thepandas.link", follow_redirects=False
                )
        finally:
            reporter.close()
        self.assertEqual(status, 301)
        self.assertEqual(location, "https://gsd.thepandas.link/")
        self.assertNotIn("--location", run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
