"""
Schema-facing checks for the main GenLayer contract.

These tests cover the failure class behind GenLayer Studio's
"Could not load contract schema" message: import errors, missing pinned runner
headers, unsupported public ABI annotations, and unsupported storage types.
"""

import importlib
from pathlib import Path

from scripts.check_genlayer_schema import check_contract


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "claimbot_main.py"


def test_claimbot_contract_imports():
    module = importlib.import_module("claimbot_main")
    assert module.ClaimBot.__name__ == "ClaimBot"


def test_claimbot_schema_guard_passes():
    assert check_contract(CONTRACT) == []
