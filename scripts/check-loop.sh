#!/usr/bin/env bash
# Read-only helper: view source receipt and later confirm destination state via a rule ID.
set -euo pipefail
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${BASE_RPC_URL:=https://sepolia.base.org}"
: "${LASNA_RPC_URL:=https://lasna-rpc.rnk.dev/}"
: "${UNI_RPC_URL:=https://sepolia.unichain.org}"
: "${ORIGIN_TX:?Set ORIGIN_TX to a REAL Base Sepolia payment hash}"
: "${RULE_ID:?Set RULE_ID to its bytes32 rule ID}"
: "${PAYOUT_VAULT:?Set PAYOUT_VAULT to the deployed Unichain vault address}"
command -v cast >/dev/null || { echo 'Foundry cast is required'; exit 1; }
echo '=== SOURCE: Base Sepolia receipt ==='
cast receipt "$ORIGIN_TX" --rpc-url "$BASE_RPC_URL"
echo '=== DESTINATION: Unichain rule state (0 absent,1 funded,2 paid,3 refunded) ==='
cast call "$PAYOUT_VAULT" 'rules(bytes32)(address,address,address,uint256,uint256,uint64,uint8)' "$RULE_ID" --rpc-url "$UNI_RPC_URL"
echo '=== LASNA: inspect OmniRelay and system contract events ==='
echo 'Use https://lasna-omni.reactscan.net and https://dev.reactive.network/reactive-mcp for the matching reactive transaction.'
echo 'Record the exact Lasna and Unichain callback transaction hashes in docs/EVIDENCE.md.'
