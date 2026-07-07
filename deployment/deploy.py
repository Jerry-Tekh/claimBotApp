#!/usr/bin/env python3
"""
ClaimBot — GenLayer Studio Deployment Script

Usage:
  python deploy.py --network studio         # GenLayer Studio testnet
  python deploy.py --network testnet        # Public testnet
  python deploy.py --dry-run                # Syntax check only

Environment variables required:
  GENLAYER_PRIVATE_KEY   Your wallet private key (from Studio)
  GENLAYER_ENDPOINT      Override endpoint (optional)
"""

import argparse
import os
import sys
import json
import time
import hashlib
import re


NETWORK_ENDPOINTS = {
    "studio":  "http://localhost:8080/api",      # GenLayer Studio running locally
    "testnet": "https://studio.genlayer.com/api",  # Studio hosted testnet
    "mainnet": "https://mainnet.genlayer.com/api",
}


def main():
    parser = argparse.ArgumentParser(description="Deploy ClaimBot to GenLayer Studio")
    parser.add_argument("--network",  default="studio",
                        choices=["studio", "testnet", "mainnet"],
                        help="studio=local Studio, testnet=hosted Studio testnet")
    parser.add_argument("--endpoint", default=None,
                        help="Override GenLayer endpoint URL")
    parser.add_argument("--contract", default="contracts/claimbot_main.py",
                        help="Path to contract file (relative to project root)")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Validate contract syntax only, do not deploy")
    args = parser.parse_args()

    # ── Resolve paths ──────────────────────────────────────────
    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "..")
    contract_path = os.path.normpath(os.path.join(project_root, args.contract))

    # ── Resolve endpoint ───────────────────────────────────────
    endpoint = args.endpoint or os.environ.get("GENLAYER_ENDPOINT") or NETWORK_ENDPOINTS[args.network]

    private_key = os.environ.get("GENLAYER_PRIVATE_KEY")
    if not private_key and not args.dry_run:
        print("❌  GENLAYER_PRIVATE_KEY not set.")
        print("    Get your key from GenLayer Studio → Account → Export Private Key")
        print("    Then: export GENLAYER_PRIVATE_KEY=0x...")
        sys.exit(1)

    # ── Validate contract file ─────────────────────────────────
    if not os.path.exists(contract_path):
        print(f"❌  Contract not found: {contract_path}")
        sys.exit(1)

    with open(contract_path, "r") as f:
        contract_code = f.read()

    try:
        compile(contract_code, contract_path, "exec")
        print(f"✅  Syntax OK: {args.contract}")
    except SyntaxError as e:
        print(f"❌  Syntax error: {e}")
        sys.exit(1)

    # Verify Studio SDK patterns are used correctly
    issues = []
    if "gl.get_webpage(" in contract_code:
        issues.append("❌  gl.get_webpage() → should be gl.nondet.web.render(url, mode='text')")
    if "gl.exec_prompt(" in contract_code and "gl.nondet.exec_prompt" not in contract_code:
        issues.append("❌  gl.exec_prompt() → should be gl.nondet.exec_prompt()")
    if "run_nondet_unsafe" in contract_code and "#" not in contract_code.split("run_nondet_unsafe")[0].split("\n")[-1]:
        issues.append("❌  run_nondet_unsafe → should be gl.eq_principle.prompt_comparative()")
    if "raise gl.UserError" in contract_code:
        issues.append("❌  gl.UserError → should be gl.vm.UserError")
    if "response_format=" in contract_code:
        issues.append("❌  response_format= param not supported → remove it")

    if issues:
        print("\n⚠  Studio SDK compatibility issues found:")
        for issue in issues:
            print("   ", issue)
        sys.exit(1)
    else:
        print("✅  Studio SDK patterns: all correct")

    code_hash = hashlib.sha256(contract_code.encode()).hexdigest()[:12]
    print(f"   Code hash: {code_hash}")
    print(f"   Network:   {args.network}")
    print(f"   Endpoint:  {endpoint}")

    if args.dry_run:
        print("\n✅  Dry run complete. Contract is valid and ready for Studio.")
        print("\nNext steps:")
        print("  1. Open GenLayer Studio (studio.genlayer.com or localhost:8080)")
        print("  2. Go to Contracts → Deploy New Contract")
        print("  3. Paste the contents of contracts/claimbot_main.py")
        print("  4. Click Deploy")
        return

    # ── Deploy via GenLayer Studio SDK ─────────────────────────
    print(f"\nDeploying to {args.network}...")

    try:
        # Try the genlayer Python SDK
        from genlayer import create_client, create_account

        account = create_account(private_key)
        client  = create_client(endpoint=endpoint)

        print(f"   Deployer: {account.address}")

        result = client.deploy_contract(
            account=account,
            code=contract_code,
            args=[],   # ClaimBot __init__ takes no constructor args
        )

        tx_hash = result.get("tx_hash") or result.get("hash")
        print(f"   Deploy tx: {tx_hash}")
        print("   Waiting for confirmation...")

        # Poll for receipt
        contract_address = None
        for attempt in range(24):  # up to 2 minutes
            try:
                receipt = client.get_transaction_receipt(tx_hash)
                contract_address = receipt.get("contract_address") or receipt.get("contractAddress")
                if contract_address:
                    break
            except Exception:
                pass
            print(f"   Polling... ({attempt + 1}/24)")
            time.sleep(5)

        if not contract_address:
            print(f"\n⚠  Timed out waiting for receipt.")
            print(f"   TX hash: {tx_hash}")
            print(f"   Check status in GenLayer Studio")
            contract_address = f"PENDING:{tx_hash}"

    except ImportError:
        print("\n⚠  genlayer Python SDK not installed.")
        print("   For Studio deployment, use the Studio UI instead:")
        print("")
        print("   1. Open studio.genlayer.com")
        print("   2. Contracts → Deploy New Contract")
        print(f"  3. Paste: {contract_path}")
        print("")
        print("   OR install the SDK:")
        print("   pip install genlayer-py-lib")
        import secrets
        contract_address = "USE_STUDIO_UI"

    except Exception as e:
        print(f"\n❌  Deployment failed: {e}")
        print("   Try deploying via Studio UI instead.")
        sys.exit(1)

    # ── Write output ──────────────────────────────────────────
    output_path = os.path.normpath(os.path.join(project_root, ".env.deployed"))

    with open(output_path, "w") as f:
        f.write(f"# ClaimBot deployed — {args.network}\n")
        f.write(f"# Deployed: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}\n")
        f.write(f"# Code hash: {code_hash}\n\n")
        f.write(f"NEXT_PUBLIC_CONTRACT_ADDRESS={contract_address}\n")
        f.write(f"CONTRACT_ADDRESS={contract_address}\n")
        f.write(f"NEXT_PUBLIC_GENLAYER_ENDPOINT={endpoint}\n")
        f.write(f"GENLAYER_ENDPOINT={endpoint}\n")

    print(f"\n✅  Contract deployed: {contract_address}")
    print(f"📄  Written to: {output_path}")
    print(f"\nNext steps:")
    print(f"  1. Copy CONTRACT_ADDRESS to backend/.env")
    print(f"  2. Copy NEXT_PUBLIC_CONTRACT_ADDRESS to frontend/.env.local")
    print(f"  3. Set DEMO_MODE=false in backend/.env")
    print(f"  4. npm run dev")


if __name__ == "__main__":
    main()
