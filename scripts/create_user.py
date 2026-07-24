#!/usr/bin/env python3
"""Provision a Na'aseh user through the IAM-protected provisioning Lambda."""

import argparse
import getpass
import json
import os
import sys
import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError


EXIT_OK = 0
EXIT_USAGE = 2
EXIT_CONFLICT = 3
EXIT_SERVICE = 4
REGION = "us-west-2"


def parser():
    value = argparse.ArgumentParser(description="Create a Na'aseh user securely.")
    value.add_argument("--username", required=True)
    value.add_argument("--display-name", required=True)
    value.add_argument("--role", choices=("user", "admin"), default="user")
    value.add_argument("--profile")
    value.add_argument("--region", choices=(REGION,), default=REGION)
    value.add_argument("--function-name", default=os.getenv("NAASEH_PROVISION_USER_FUNCTION"))
    value.add_argument("--idempotency-token", default=None)
    value.add_argument(
        "--password-stdin",
        action="store_true",
        help="Read password and PIN from two newline-delimited standard-input lines.",
    )
    return value


def read_secrets(from_stdin):
    if from_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
        pin = sys.stdin.readline().rstrip("\r\n")
        return password, pin
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        raise ValueError("Password confirmation does not match.")
    pin = getpass.getpass("PIN: ")
    if pin != getpass.getpass("Confirm PIN: "):
        raise ValueError("PIN confirmation does not match.")
    return password, pin


def valid_result(value):
    if not isinstance(value, dict) or value.get("version") != "naaseh.provision-user-result/v1":
        return False
    user = value.get("user")
    return (
        isinstance(value.get("created"), bool)
        and isinstance(user, dict)
        and isinstance(user.get("id"), str)
        and isinstance(user.get("username"), str)
        and user.get("role") in ("user", "admin")
        and isinstance(user.get("active"), bool)
        and isinstance(user.get("sessionEpoch"), int)
        and not any(field in user for field in ("password", "pin", "passwordHash", "pinHash"))
    )


def main(argv=None):
    arguments = parser().parse_args(argv)
    if not arguments.function_name:
        print("Provisioning function name is required.", file=sys.stderr)
        return EXIT_USAGE
    try:
        password, pin = read_secrets(arguments.password_stdin)
        if len(password) < 12 or not (6 <= len(pin) <= 12 and pin.isdigit()):
            raise ValueError("Password or PIN does not meet the provisioning policy.")
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return EXIT_USAGE

    request = {
        "version": "naaseh.provision-user/v1",
        "username": arguments.username,
        "displayName": arguments.display_name,
        "password": password,
        "pin": pin,
        "role": arguments.role,
        "idempotencyToken": arguments.idempotency_token or str(uuid.uuid4()),
    }
    try:
        session = boto3.Session(region_name=arguments.region, profile_name=arguments.profile)
        response = session.client("lambda").invoke(
            FunctionName=arguments.function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(request).encode("utf-8"),
        )
        payload = json.loads(response["Payload"].read())
    except (BotoCoreError, ClientError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        print("User provisioning service could not be reached.", file=sys.stderr)
        return EXIT_SERVICE
    finally:
        password = ""
        pin = ""
        request.clear()

    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        print("User provisioning was not completed.", file=sys.stderr)
        return EXIT_CONFLICT if error.get("code") in {
            "username_conflict",
            "idempotency_conflict",
        } else EXIT_SERVICE
    if not valid_result(payload):
        print("User provisioning returned an invalid response.", file=sys.stderr)
        return EXIT_SERVICE
    user = payload["user"]
    action = "Created" if payload["created"] else "Found existing"
    print(f"{action} {user['role']} user @{user['username']} ({user['id']}).")
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
