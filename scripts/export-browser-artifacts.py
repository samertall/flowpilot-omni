#!/usr/bin/env python3
"""Export audited Foundry compiler outputs to browser-deployable artifacts.

Only the ABI and creation bytecode are published. Requires `forge build` first.
Artifacts are pinned to the committed Solidity source via the GitHub Actions workflow.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ["PaymentGate", "MockUSD", "OmniRelay", "PayoutVault"]
OUTPUT = ROOT / "app" / "artifacts"
OUTPUT.mkdir(parents=True, exist_ok=True)
for name in CONTRACTS:
    source = ROOT / "out" / f"{name}.sol" / f"{name}.json"
    if not source.is_file():
        raise SystemExit(f"Missing {source.relative_to(ROOT)}: run `forge build` first")
    compiled = json.loads(source.read_text())
    abi = compiled.get("abi")
    creation = compiled.get("bytecode", {}).get("object", "")
    if not isinstance(abi, list) or not re.fullmatch(r"0x(?:[0-9a-fA-F]{2})+", creation):
        raise SystemExit(f"Invalid or unlinked creation bytecode for {name}")
    result = {"contractName": name, "compiler": "0.8.29", "abi": abi, "bytecode": creation}
    target = OUTPUT / f"{name}.json"
    target.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(f"{target.relative_to(ROOT)}: {len(creation)//2-1:,} bytes")
