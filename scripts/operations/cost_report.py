"""Read-only monthly cost breakdown. Never reads secret values or changes AWS resources."""
import argparse
import json
import subprocess
from decimal import Decimal


def summarize(report):
    rows = []
    for period in report.get("ResultsByTime", []):
        for group in period.get("Groups", []):
            service, usage_type = group["Keys"]
            amount = Decimal(group["Metrics"]["UnblendedCost"]["Amount"])
            if service == "Tax" or amount <= Decimal("0.001"):
                continue
            usage = group["Metrics"]["UsageQuantity"]
            rows.append({"service": service, "usage_type": usage_type,
                         "cost": str(amount), "quantity": usage["Amount"], "unit": usage["Unit"]})
    return sorted(rows, key=lambda row: Decimal(row["cost"]), reverse=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, help="Inclusive YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="Exclusive YYYY-MM-DD")
    parser.add_argument("--profile", default="naaseh-admin")
    args = parser.parse_args()
    output = subprocess.check_output([
        "aws", "ce", "get-cost-and-usage", "--profile", args.profile, "--region", "us-east-1",
        "--time-period", f"Start={args.start},End={args.end}", "--granularity", "MONTHLY",
        "--metrics", "UnblendedCost", "UsageQuantity", "--group-by",
        "Type=DIMENSION,Key=SERVICE", "Type=DIMENSION,Key=USAGE_TYPE", "--output", "json",
    ], text=True)
    print(json.dumps(summarize(json.loads(output)), indent=2))


if __name__ == "__main__":
    main()
