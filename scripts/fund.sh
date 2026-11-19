#!/usr/bin/env bash
# Explicit opt-in testnet contract funding. Never run with a real-value mainnet key.
set -euo pipefail
cd "$(dirname "$0")/.."
for cmd in cast python3; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${PRIVATE_KEY:?Use your throwaway testnet-only key in .env}"
: "${LASNA_RPC_URL:?}"
: "${UNI_RPC_URL:?}"
: "${RELAY_FUND_AMOUNT:?Set RELAY_FUND_AMOUNT (e.g. 0.05ether) explicitly in .env}"
: "${VAULT_FUND_AMOUNT:?Set VAULT_FUND_AMOUNT (e.g. 0.002ether) explicitly in .env}"
[[ "${CONFIRM_TESTNET_FUNDS:-}" == "yes" ]] || { echo 'Set CONFIRM_TESTNET_FUNDS=yes only after reviewing amount and recipients' >&2; exit 1; }
[[ "$(cast chain-id --rpc-url "$LASNA_RPC_URL")" == 5318007 ]] || exit 1
[[ "$(cast chain-id --rpc-url "$UNI_RPC_URL")" == 1301 ]] || exit 1
[[ -f deployments/lasna.json ]] || { echo 'Deploy contracts first'; exit 1; }
read -r RELAY VAULT < <(python3 -c 'import json; d=json.load(open("deployments/lasna.json")); print(d["lasna"]["omniRelay"], d["unichainSepolia"]["payoutVault"])')
echo "About to fund Lasna OmniRelay $RELAY with $RELAY_FUND_AMOUNT testnet REACT"
echo "About to fund Unichain PayoutVault $VAULT with $VAULT_FUND_AMOUNT testnet ETH"
cast send "$RELAY" --value "$RELAY_FUND_AMOUNT" --rpc-url "$LASNA_RPC_URL" --private-key "$PRIVATE_KEY"
cast send "$VAULT" --value "$VAULT_FUND_AMOUNT" --rpc-url "$UNI_RPC_URL" --private-key "$PRIVATE_KEY"
echo 'Both funding transactions submitted. Verify receipts and balances on explorers.'
