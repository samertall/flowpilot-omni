#!/usr/bin/env bash
# Deploy FlowPilot demo on exactly Base Sepolia, Reactive Lasna and Unichain Sepolia.
# This script sends LIVE TESTNET transactions. Use a new throwaway testnet-only EVM wallet.
set -euo pipefail
cd "$(dirname "$0")/.."
for cmd in forge cast python3; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${PRIVATE_KEY:?Provide a fresh testnet-only PRIVATE_KEY in local .env (never commit/share it)}"
: "${BASE_RPC_URL:?Missing BASE_RPC_URL}"
: "${LASNA_RPC_URL:?Missing LASNA_RPC_URL}"
: "${UNI_RPC_URL:?Missing UNI_RPC_URL}"
[[ "$(cast chain-id --rpc-url "$BASE_RPC_URL")" == 84532 ]] || { echo 'Wrong Base Sepolia RPC' >&2; exit 1; }
[[ "$(cast chain-id --rpc-url "$LASNA_RPC_URL")" == 5318007 ]] || { echo 'Wrong Reactive Lasna RPC' >&2; exit 1; }
[[ "$(cast chain-id --rpc-url "$UNI_RPC_URL")" == 1301 ]] || { echo 'Wrong Unichain Sepolia RPC' >&2; exit 1; }
[[ -f lib/reactive-lib-omni/src/base/AbstractReactive.sol && -f lib/forge-std/src/Test.sol ]] || {
  echo 'Dependencies missing. Run: forge install foundry-rs/forge-std --no-commit && forge install Reactive-Network/reactive-lib-omni --no-commit' >&2
  exit 1
}
if [[ -f deployments/lasna.json ]]; then
  echo 'deployments/lasna.json already exists. Refusing accidental duplicate deployment; back up and remove it intentionally.' >&2
  exit 1
fi
DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "TESTNET deployment account: $DEPLOYER"
echo "Base Sepolia ETH balance: $(cast balance "$DEPLOYER" --ether --rpc-url "$BASE_RPC_URL")"
echo "Lasna REACT balance: $(cast balance "$DEPLOYER" --ether --rpc-url "$LASNA_RPC_URL")"
echo "Unichain Sepolia ETH balance: $(cast balance "$DEPLOYER" --ether --rpc-url "$UNI_RPC_URL")"
forge build
forge test -q

# Foundry --json returns { deployedTo, transactionHash }; require both to avoid guessing.
deploy() {
  local output
  output=$(forge create "$1" --rpc-url "$2" --private-key "$PRIVATE_KEY" --broadcast --json "${@:3}")
  python3 -c '
import json, re, sys
try:
    data=json.load(sys.stdin)
    addr=data["deployedTo"]
    tx=data["transactionHash"]
    assert re.fullmatch(r"0x[0-9a-fA-F]{40}",addr)
    assert re.fullmatch(r"0x[0-9a-fA-F]{64}",tx)
    print(addr,tx)
except Exception as exc:
    print(f"Cannot parse successful forge create JSON: {exc}",file=sys.stderr)
    sys.exit(2)
' <<< "$output"
}

PAYMENT_OUTPUT=$(deploy src/PaymentGate.sol:PaymentGate "$BASE_RPC_URL")
read -r PAYMENT PAYMENT_TX <<< "${PAYMENT_OUTPUT}"
echo "Base PaymentGate: $PAYMENT ($PAYMENT_TX)"
TOKEN_OUTPUT=$(deploy src/MockUSD.sol:MockUSD "$UNI_RPC_URL")
read -r TOKEN TOKEN_TX <<< "${TOKEN_OUTPUT}"
echo "Unichain MockUSD: $TOKEN ($TOKEN_TX)"
RELAY_OUTPUT=$(deploy src/OmniRelay.sol:OmniRelay "$LASNA_RPC_URL" --constructor-args 84532 "$PAYMENT" 1301)
read -r RELAY RELAY_TX <<< "${RELAY_OUTPUT}"
echo "Lasna OmniRelay: $RELAY ($RELAY_TX)"
PROXY=0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4
VAULT_OUTPUT=$(deploy src/PayoutVault.sol:PayoutVault "$UNI_RPC_URL" --constructor-args "$TOKEN" "$PROXY" "$RELAY")
read -r VAULT VAULT_TX <<< "${VAULT_OUTPUT}"
echo "Unichain PayoutVault: $VAULT ($VAULT_TX)"
SET_RESULT=$(cast send "$RELAY" 'setDestination(address)' "$VAULT" --rpc-url "$LASNA_RPC_URL" --private-key "$PRIVATE_KEY" --json)
SET_TX=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])' <<< "$SET_RESULT")

mkdir -p deployments
export DEPLOYER PAYMENT PAYMENT_TX TOKEN TOKEN_TX RELAY RELAY_TX VAULT VAULT_TX SET_TX PROXY
python3 - <<'PY'
import os, json
v=os.environ
out={
  'network':'Reactive Lasna / Omni testnet', 'chainId':5318007, 'deployer':v['DEPLOYER'],
  'baseSepolia':{'chainId':84532,'paymentGate':v['PAYMENT'], 'deploymentTx':v['PAYMENT_TX']},
  'unichainSepolia':{'chainId':1301,'mockUSD':v['TOKEN'],'mockUSDDeploymentTx':v['TOKEN_TX'],
      'payoutVault':v['VAULT'],'vaultDeploymentTx':v['VAULT_TX'],'callbackProxy':v['PROXY']},
  'lasna':{'chainId':5318007,'omniRelay':v['RELAY'],'deploymentTx':v['RELAY_TX'],'setDestinationTx':v['SET_TX']}}
with open('deployments/lasna.json','w') as f:json.dump(out,f,indent=2);f.write('\n')
with open('app/deployments.json','w') as f:json.dump(out,f,indent=2);f.write('\n')
PY
cat <<'NEXT'

Deployment transactions recorded in deployments/lasna.json and app/deployments.json.
NEXT ACTIONS: Fund OmniRelay on Lasna with testnet REACT, and PayoutVault on Unichain
with testnet ETH to cover network callback fees. Then use the app to create and trigger
one conditional payout, and verify the 3 tx hashes using scripts/verify-evidence.mjs.
Do NOT publish any private key or claim a working cross-chain callback until verified.
NEXT
