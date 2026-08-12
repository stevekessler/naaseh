#!/usr/bin/env python3
"""Read-only validation for the Naaseh production deployment."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Callable


EXPECTED_VARIABLES = {
    "NAASEH_DOMAIN_NAME": "gsd.thepandas.link",
    "NAASEH_HOSTED_ZONE_ID": "Z03233042WRAYW9S16I7T",
    "NAASEH_HOSTED_ZONE_NAME": "thepandas.link",
    "PRODUCTION_BASE_URL": "https://gsd.thepandas.link",
}
EXPECTED_SECRETS = {
    "AWS_DEPLOY_ROLE_ARN",
    "RECOVERY_BREAK_GLASS_ROLE_ARN",
    "PRODUCTION_SMOKE_USERNAME",
    "PRODUCTION_SMOKE_PASSWORD",
}
HEALTHY_STACK_STATUSES = {"CREATE_COMPLETE", "UPDATE_COMPLETE"}


class ValidationError(RuntimeError):
    pass


class Reporter:
    def __init__(self, verbose: bool, save_location: str | None) -> None:
        self.verbose = verbose
        self.log_path = self._resolve_log_path(save_location)
        self._log = None
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            self._log = self.log_path.open("a", encoding="utf-8")

    @staticmethod
    def _resolve_log_path(value: str | None) -> Path | None:
        if not value:
            return None
        expanded = Path(value).expanduser()
        if expanded.is_dir() or value.endswith(("/", os.sep)):
            stamp = dt.datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
            return expanded / f"naaseh-production-validation-{stamp}.log"
        return expanded

    def close(self) -> None:
        if self._log:
            self._log.close()

    def write(self, message: str, *, verbose_only: bool = False) -> None:
        timestamp = dt.datetime.now().astimezone().isoformat(timespec="seconds")
        if not verbose_only or self.verbose:
            print(message, flush=True)
        if self._log:
            self._log.write(f"{timestamp} {message}\n")
            self._log.flush()


class CommandRunner:
    def __init__(self, reporter: Reporter) -> None:
        self.reporter = reporter

    def run(self, command: list[str], *, sensitive: bool = False) -> str:
        display = " ".join(command)
        self.reporter.write(
            f"  command: {'[REDACTED SENSITIVE COMMAND]' if sensitive else display}",
            verbose_only=True,
        )
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        if result.returncode != 0:
            stderr = "[redacted]" if sensitive else result.stderr.strip()
            raise ValidationError(
                f"command exited {result.returncode}" + (f": {stderr}" if stderr else "")
            )
        if result.stderr.strip() and not sensitive:
            self.reporter.write(f"  stderr: {result.stderr.strip()}", verbose_only=True)
        return result.stdout.strip()

    def json(self, command: list[str], *, sensitive: bool = False) -> Any:
        output = self.run(command, sensitive=sensitive)
        try:
            return json.loads(output)
        except json.JSONDecodeError as error:
            raise ValidationError("command did not return valid JSON") from error


class ProductionValidator:
    def __init__(self, args: argparse.Namespace, reporter: Reporter) -> None:
        self.args = args
        self.reporter = reporter
        self.commands = CommandRunner(reporter)
        self.failures = 0
        self.warnings = 0
        self.passes = 0
        self.web_push_secret_arn = ""
        self.public_key = ""

    def aws(self, *parts: str, region: str | None = None) -> list[str]:
        return [
            "aws",
            *parts,
            "--profile",
            self.args.profile,
            "--region",
            region or self.args.region,
        ]

    def check(self, name: str, operation: Callable[[], str]) -> None:
        self.reporter.write(f"CHECK {name}", verbose_only=True)
        try:
            detail = operation()
        except Exception as error:  # Each check must report and allow remaining checks to run.
            self.failures += 1
            self.reporter.write(f"FAIL  {name}: {error}")
            return
        self.passes += 1
        self.reporter.write(f"PASS  {name}: {detail}")

    def warn_check(self, name: str, operation: Callable[[], str]) -> None:
        try:
            detail = operation()
        except Exception as error:
            self.warnings += 1
            self.reporter.write(f"WARN  {name}: {error}")
            return
        self.passes += 1
        self.reporter.write(f"PASS  {name}: {detail}")

    def run(self) -> int:
        self.reporter.write(f"Naaseh {self.args.phase}-deployment production validation")
        self.reporter.write("Read-only checks; secret values are never written to the log.")
        if self.reporter.log_path:
            self.reporter.write(f"Log: {self.reporter.log_path}")

        self.check("required command-line tools", self.check_tools)
        self.check("AWS identity", self.check_identity)
        self.check("GitHub authentication", self.check_github_auth)
        self.check("GitHub production variables", self.check_github_variables)
        self.check("GitHub production secret names", self.check_github_secret_names)
        if self.args.pr_number:
            self.check(f"pull request {self.args.pr_number}", self.check_pull_request)
        if self.args.phase == "post":
            self.check("production deployment workflow", self.check_deployment_run)
        if self.args.check_git or (self.args.phase == "pre" and not self.args.skip_git):
            self.check("local release checkout", self.check_git_checkout)

        self.check(f"{self.args.edge_stack} stack", self.check_edge_stack)
        self.check(f"{self.args.stack} stack", self.check_production_stack)
        self.check("Web Push secret discovery", self.discover_web_push_secret)
        self.check("Web Push secret metadata", self.check_web_push_metadata)
        self.check("VAPID secret schema and public-key match", self.check_vapid_secret)
        if self.args.phase == "post":
            self.check("production HTTPS endpoint", self.check_https)
            self.check("HTTP-to-HTTPS redirect", self.check_redirect)
            self.check("latest CloudFront invalidation", self.check_cloudfront_invalidation)
            self.check("CloudWatch alarms", self.check_alarms)
            self.warn_check(
                "Web Push delivery metric", lambda: self.check_metric("WebPushDeliveries")
            )
            self.warn_check(
                "Web Push failure metric", lambda: self.check_metric("WebPushDeliveryFailures")
            )

        status = "SUCCESS" if self.failures == 0 else "FAILURE"
        self.reporter.write(
            f"{status}: {self.passes} passed, {self.failures} failed, {self.warnings} warnings"
        )
        return 0 if self.failures == 0 else 1

    def check_tools(self) -> str:
        missing = []
        for tool in ("aws", "gh", "git", "curl"):
            try:
                subprocess.run([tool, "--version"], capture_output=True, check=False)
            except FileNotFoundError:
                missing.append(tool)
        if missing:
            raise ValidationError(f"missing tools: {', '.join(missing)}")
        return "aws, gh, git, and curl are installed"

    def check_identity(self) -> str:
        identity = self.commands.json(self.aws("sts", "get-caller-identity", "--output", "json"))
        account = str(identity.get("Account", ""))
        if account != self.args.account:
            raise ValidationError(f"expected AWS account {self.args.account}, received {account}")
        return f"AWS account {account}"

    def check_github_auth(self) -> str:
        self.commands.run(["gh", "auth", "status"])
        return "authenticated"

    def github_variable(self, name: str) -> str:
        return self.commands.run(
            ["gh", "variable", "get", name, "--env", self.args.github_environment],
            sensitive=name == "VITE_WEB_PUSH_PUBLIC_KEY",
        )

    def check_github_variables(self) -> str:
        for name, expected in EXPECTED_VARIABLES.items():
            actual = self.github_variable(name)
            if actual != expected:
                raise ValidationError(f"{name} is missing or does not equal {expected}")
        self.public_key = self.github_variable("VITE_WEB_PUSH_PUBLIC_KEY")
        if not self.public_key:
            raise ValidationError("VITE_WEB_PUSH_PUBLIC_KEY is empty")
        return f"{len(EXPECTED_VARIABLES) + 1} required variables are configured"

    def check_github_secret_names(self) -> str:
        output = self.commands.run(
            ["gh", "secret", "list", "--env", self.args.github_environment]
        )
        present = {line.split()[0] for line in output.splitlines() if line.split()}
        missing = sorted(EXPECTED_SECRETS - present)
        if missing:
            raise ValidationError(f"missing secret names: {', '.join(missing)}")
        return f"{len(EXPECTED_SECRETS)} required secret names are configured"

    def check_pull_request(self) -> str:
        data = self.commands.json(
            [
                "gh",
                "pr",
                "view",
                str(self.args.pr_number),
                "--json",
                "state,mergeable,statusCheckRollup,url",
            ]
        )
        failed = []
        pending = []
        for check in data.get("statusCheckRollup", []):
            status = check.get("status")
            conclusion = check.get("conclusion")
            if status != "COMPLETED":
                pending.append(check.get("name", "unnamed"))
            elif conclusion not in {"SUCCESS", "NEUTRAL", "SKIPPED"}:
                failed.append(check.get("name", "unnamed"))
        if failed or pending:
            raise ValidationError(
                f"failed checks={failed or 'none'}, pending checks={pending or 'none'}"
            )
        if data.get("state") == "OPEN" and data.get("mergeable") != "MERGEABLE":
            raise ValidationError(f"open PR is {data.get('mergeable', 'not mergeable')}")
        return f"state={data.get('state')}; all reported checks passed"

    def check_deployment_run(self) -> str:
        run_id = self.args.run_id
        if not run_id:
            runs = self.commands.json(
                [
                    "gh",
                    "run",
                    "list",
                    "--workflow",
                    "deploy-production.yml",
                    "--branch",
                    "main",
                    "--event",
                    "workflow_dispatch",
                    "--limit",
                    "1",
                    "--json",
                    "databaseId",
                ]
            )
            if not runs:
                raise ValidationError("no production deployment workflow run was found")
            run_id = runs[0].get("databaseId")
        if not run_id:
            raise ValidationError("deployment run ID is empty")
        data = self.commands.json(
            ["gh", "run", "view", str(run_id), "--json", "conclusion,status,url,jobs"]
        )
        if data.get("status") != "completed" or data.get("conclusion") != "success":
            raise ValidationError(
                f"status={data.get('status')}, conclusion={data.get('conclusion')}"
            )
        failed_jobs = [
            job.get("name", "unnamed")
            for job in data.get("jobs", [])
            if job.get("conclusion") not in {"success", "skipped"}
        ]
        if failed_jobs:
            raise ValidationError(f"unsuccessful jobs: {', '.join(failed_jobs)}")
        return f"run {run_id}; workflow and all required jobs succeeded"

    def check_git_checkout(self) -> str:
        status = self.commands.run(["git", "status", "--porcelain"])
        if status:
            raise ValidationError("working tree is not clean")
        branch = self.commands.run(["git", "branch", "--show-current"])
        if branch != "main":
            raise ValidationError(f"expected branch main, received {branch or 'detached HEAD'}")
        head = self.commands.run(["git", "rev-parse", "HEAD"])
        remote = self.commands.run(
            ["git", "ls-remote", "--exit-code", "origin", "refs/heads/main"]
        )
        remote_sha = remote.split()[0] if remote.split() else ""
        if head != remote_sha:
            raise ValidationError("HEAD does not match the current remote main SHA")
        return f"clean main at {head[:12]}"

    def stack(self, name: str, region: str) -> dict[str, Any]:
        data = self.commands.json(
            self.aws(
                "cloudformation",
                "describe-stacks",
                "--stack-name",
                name,
                "--output",
                "json",
                region=region,
            )
        )
        stacks = data.get("Stacks", [])
        if len(stacks) != 1:
            raise ValidationError(f"expected one stack, received {len(stacks)}")
        return stacks[0]

    def validate_stack(self, name: str, region: str) -> dict[str, Any]:
        stack = self.stack(name, region)
        status = stack.get("StackStatus")
        if status not in HEALTHY_STACK_STATUSES:
            raise ValidationError(f"unhealthy status {status}")
        return stack

    def check_edge_stack(self) -> str:
        stack = self.validate_stack(self.args.edge_stack, self.args.edge_region)
        return str(stack["StackStatus"])

    def check_production_stack(self) -> str:
        stack = self.validate_stack(self.args.stack, self.args.region)
        outputs = {item["OutputKey"]: item["OutputValue"] for item in stack.get("Outputs", [])}
        if outputs.get("SiteUrl") != self.args.base_url:
            raise ValidationError(f"SiteUrl is not {self.args.base_url}")
        return f"{stack['StackStatus']}; SiteUrl is correct"

    def stack_resources(self, stack: str, region: str) -> list[dict[str, Any]]:
        data = self.commands.json(
            self.aws(
                "cloudformation",
                "list-stack-resources",
                "--stack-name",
                stack,
                "--output",
                "json",
                region=region,
            )
        )
        return data.get("StackResourceSummaries", [])

    def discover_web_push_secret(self) -> str:
        matches = [
            resource
            for resource in self.stack_resources(self.args.stack, self.args.region)
            if resource.get("ResourceType") == "AWS::SecretsManager::Secret"
            and "WebPushCredentials" in resource.get("LogicalResourceId", "")
        ]
        if len(matches) != 1:
            raise ValidationError(f"expected one Web Push secret, received {len(matches)}")
        self.web_push_secret_arn = str(matches[0].get("PhysicalResourceId", ""))
        prefix = f"arn:aws:secretsmanager:{self.args.region}:{self.args.account}:secret:WebPushCredentials"
        if not self.web_push_secret_arn.startswith(prefix):
            raise ValidationError("secret ARN has an unexpected account, region, or name")
        return "found exactly one CDK-managed Web Push secret"

    def require_secret_arn(self) -> None:
        if not self.web_push_secret_arn:
            raise ValidationError("Web Push secret discovery did not succeed")

    def check_web_push_metadata(self) -> str:
        self.require_secret_arn()
        data = self.commands.json(
            self.aws(
                "secretsmanager",
                "describe-secret",
                "--secret-id",
                self.web_push_secret_arn,
                "--output",
                "json",
            )
        )
        if not data.get("KmsKeyId"):
            raise ValidationError("secret is not encrypted with the expected customer-managed key")
        stages = data.get("VersionIdsToStages", {}).values()
        if not any("AWSCURRENT" in stage for stage in stages):
            raise ValidationError("secret has no AWSCURRENT version")
        return "customer-managed KMS key and AWSCURRENT version are present"

    def check_vapid_secret(self) -> str:
        self.require_secret_arn()
        if not self.public_key:
            raise ValidationError("GitHub public key validation did not succeed")
        data = self.commands.json(
            self.aws(
                "secretsmanager",
                "get-secret-value",
                "--secret-id",
                self.web_push_secret_arn,
                "--query",
                "SecretString",
                "--output",
                "text",
            ),
            sensitive=True,
        )
        if set(data) != {"subject", "publicKey", "privateKey"}:
            raise ValidationError("secret must contain exactly subject, publicKey, and privateKey")
        if not all(isinstance(data[key], str) and data[key] for key in data):
            raise ValidationError("VAPID fields must be non-empty strings")
        if not re.match(r"^(mailto:|https://)", data["subject"]):
            raise ValidationError("subject must start with mailto: or https://")
        if data["publicKey"] != self.public_key:
            raise ValidationError("AWS and GitHub VAPID public keys do not match")
        return "schema is valid and AWS/GitHub public keys match"

    def request(self, url: str, *, follow_redirects: bool) -> tuple[int, str | None]:
        command = [
            "curl",
            "--silent",
            "--show-error",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}\n%{redirect_url}",
            "--max-time",
            str(self.args.http_timeout),
            "--head",
        ]
        if follow_redirects:
            command.append("--location")
        command.append(url)
        try:
            output = self.commands.run(command)
            status_line, _, redirect_url = output.partition("\n")
            return int(status_line), redirect_url or None
        except ValueError as error:
            raise ValidationError("curl returned an invalid HTTP status") from error

    def check_https(self) -> str:
        status, _ = self.request(self.args.base_url, follow_redirects=True)
        if not 200 <= status < 400:
            raise ValidationError(f"unexpected HTTP status {status}")
        return f"HTTP {status}"

    def check_redirect(self) -> str:
        http_url = re.sub(r"^https://", "http://", self.args.base_url)
        status, location = self.request(http_url, follow_redirects=False)
        if status not in {301, 302, 307, 308}:
            raise ValidationError(f"expected redirect, received HTTP {status}")
        if not location or not location.startswith(self.args.base_url):
            raise ValidationError("redirect location is not the production HTTPS URL")
        return f"HTTP {status} to HTTPS"

    def find_distribution(self) -> str:
        matches = []
        for stack, region in (
            (self.args.edge_stack, self.args.edge_region),
            (self.args.stack, self.args.region),
        ):
            matches.extend(
                str(resource.get("PhysicalResourceId", ""))
                for resource in self.stack_resources(stack, region)
                if resource.get("ResourceType") == "AWS::CloudFront::Distribution"
            )
        matches = sorted(set(value for value in matches if value))
        if len(matches) != 1:
            raise ValidationError(f"expected one CloudFront distribution, received {len(matches)}")
        return matches[0]

    def check_cloudfront_invalidation(self) -> str:
        distribution = self.find_distribution()
        data = self.commands.json(
            self.aws(
                "cloudfront",
                "list-invalidations",
                "--distribution-id",
                distribution,
                "--max-items",
                "1",
                "--output",
                "json",
                region=self.args.edge_region,
            )
        )
        items = data.get("InvalidationList", {}).get("Items", [])
        if not items:
            raise ValidationError("no invalidation history exists")
        if items[0].get("Status") != "Completed":
            raise ValidationError(f"latest invalidation is {items[0].get('Status')}")
        return "latest invalidation completed"

    def check_alarms(self) -> str:
        data = self.commands.json(
            self.aws(
                "cloudwatch",
                "describe-alarms",
                "--alarm-name-prefix",
                self.args.stack,
                "--output",
                "json",
            )
        )
        alarms = data.get("MetricAlarms", []) + data.get("CompositeAlarms", [])
        firing = [alarm.get("AlarmName", "unnamed") for alarm in alarms if alarm.get("StateValue") == "ALARM"]
        if firing:
            raise ValidationError(f"alarms in ALARM state: {', '.join(firing)}")
        insufficient = sum(alarm.get("StateValue") == "INSUFFICIENT_DATA" for alarm in alarms)
        return f"{len(alarms)} alarms checked; none firing; {insufficient} insufficient-data"

    def check_metric(self, metric_name: str) -> str:
        data = self.commands.json(
            self.aws(
                "cloudwatch",
                "list-metrics",
                "--namespace",
                "Naaseh",
                "--metric-name",
                metric_name,
                "--output",
                "json",
            )
        )
        count = len(data.get("Metrics", []))
        if count == 0:
            raise ValidationError("metric has not been emitted yet; perform a real browser push test")
        return f"{count} metric series found"


def parse_args(argv: list[str] | None = None, *, default_phase: str = "post") -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run read-only validation of the Naaseh production deployment."
    )
    parser.add_argument(
        "--save-location",
        help="Log file path, or an existing/trailing-slash directory for a timestamped log.",
    )
    verbosity = parser.add_mutually_exclusive_group()
    verbosity.add_argument("--verbose", action="store_true", help="Show command-level details.")
    verbosity.add_argument(
        "--no-verbose", action="store_false", dest="verbose", help="Show only results (default)."
    )
    parser.set_defaults(verbose=False)
    parser.add_argument(
        "--phase",
        choices=("pre", "post"),
        default=default_phase,
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--profile", default="naaseh-admin", help="AWS CLI profile.")
    parser.add_argument("--account", default="093733938983", help="Expected AWS account ID.")
    parser.add_argument("--region", default="us-west-2", help="Production AWS region.")
    parser.add_argument("--edge-region", default="us-east-1", help="CloudFront edge stack region.")
    parser.add_argument("--stack", default="NaasehProd", help="Production CloudFormation stack.")
    parser.add_argument("--edge-stack", default="NaasehEdge", help="Edge CloudFormation stack.")
    parser.add_argument("--base-url", default="https://gsd.thepandas.link", help="Production URL.")
    parser.add_argument("--github-environment", default="production", help="GitHub environment.")
    parser.add_argument("--pr-number", type=int, help="Optionally require a PR's checks to pass.")
    parser.add_argument("--run-id", type=int, help="Optionally require a deployment run to pass.")
    parser.add_argument(
        "--check-git",
        action="store_true",
        help="Require a clean local main branch matching origin/main (automatic for pre-deployment).",
    )
    parser.add_argument(
        "--skip-git",
        action="store_true",
        help="Skip the automatic pre-deployment local Git check.",
    )
    parser.add_argument("--http-timeout", type=float, default=15, help="HTTP timeout in seconds.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, *, default_phase: str = "post") -> int:
    args = parse_args(argv, default_phase=default_phase)
    try:
        reporter = Reporter(args.verbose, args.save_location)
    except OSError as error:
        print(f"FAILURE: could not create validation log: {error}", file=sys.stderr)
        return 2
    try:
        return ProductionValidator(args, reporter).run()
    finally:
        reporter.close()


if __name__ == "__main__":
    sys.exit(main())
