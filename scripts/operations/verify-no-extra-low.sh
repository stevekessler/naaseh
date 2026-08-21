#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${EXTRA_LOW_INVENTORY_FUNCTION:-}" ]]; then
  echo "Set EXTRA_LOW_INVENTORY_FUNCTION to the deployed inventory Lambda name." >&2
  exit 2
fi

result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

aws_args=()
[[ -n "${AWS_PROFILE:-}" ]] && aws_args+=(--profile "$AWS_PROFILE")
[[ -n "${AWS_REGION:-}" ]] && aws_args+=(--region "$AWS_REGION")

aws "${aws_args[@]}" lambda invoke \
  --function-name "$EXTRA_LOW_INVENTORY_FUNCTION" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  "$result_file" >/dev/null

if jq -e '.FunctionError? // empty' "$result_file" >/dev/null; then
  echo "Extra Low inventory failed closed; deletion rollout is blocked." >&2
  jq -r '.errorMessage // "Inventory Lambda returned an error"' "$result_file" >&2
  exit 1
fi

jq -e '.allowed == true and .total == 0' "$result_file" >/dev/null || {
  echo "Extra Low values remain; deletion rollout is blocked." >&2
  jq '{allowed,total,counts,scanned}' "$result_file" >&2
  exit 1
}

jq '{allowed,total,counts,scanned}' "$result_file"
