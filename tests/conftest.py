"""
pytest configuration — adds the contracts directory to sys.path
so test imports (policy_manager, claim_manager, etc.) resolve correctly.
"""
import sys
import os

# Add contracts directory to Python path
contracts_dir = os.path.join(os.path.dirname(__file__), '..', 'contracts')
sys.path.insert(0, os.path.abspath(contracts_dir))
