#!/usr/bin/env python3
"""Run the Naaseh production pre-deployment validation."""

import sys

from validate_production import main


if __name__ == "__main__":
    sys.exit(main(default_phase="pre"))
