import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("cost_report", Path(__file__).parents[1] / "operations" / "cost_report.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CostReportTests(unittest.TestCase):
    def test_separates_fixed_waf_fees_from_request_usage(self):
        def group(service, kind, cost, quantity, unit):
            return {"Keys": [service, kind], "Metrics": {"UnblendedCost": {"Amount": cost}, "UsageQuantity": {"Amount": quantity, "Unit": unit}}}
        rows = module.summarize({"ResultsByTime": [{"Groups": [group("AWS WAF", "Global-WebACLV2", "5", "1", "Months"), group("AWS WAF", "Global-RequestV2-Tier0", "0.0224466", "37411", "Requests"), group("Tax", "Global-WebACLV2", "0.26", "0", "")] }]})
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["cost"], "5")
        self.assertEqual(rows[1]["quantity"], "37411")
        self.assertEqual(rows[1]["unit"], "Requests")
        self.assertEqual(rows[1]["cost"], "0.0224466")

if __name__ == "__main__":
    unittest.main()
