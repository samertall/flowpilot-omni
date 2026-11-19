# FlowPilot — Live three-chain demo and submission gate

**Current state:** No live transaction hashes or contract addresses are pre-populated. This document deliberately does not imply deployment or submission.

## Part A — Local compile and tests (first)

Use a throwaway testnet-only EVM account, a supported shell (Windows 11: WSL Ubuntu recommended), Foundry (`forge`, `cast`), Git and Node 20+.

```bash
git init                       # skip if already a git repository
forge install foundry-rs/forge-std --no-commit
forge install Reactive-Network/reactive-lib-omni --no-commit
forge build
forge test -vvv
npm install --no-audit --no-fund
npm run check
```

**Stop if tests fail.** Check official docs: https://dev.reactive.network/reactive-contracts and https://dev.reactive.network/callback-contracts.

## Part B — Deploy once

1. Copy `.env.example` to `.env`, configure `BASE_RPC_URL`, `LASNA_RPC_URL`, `UNI_RPC_URL` and a **new throwaway testnet-only** `PRIVATE_KEY`. Never share `.env` or its values.
2. Obtain testnet ETH on **Base Sepolia** and **Unichain Sepolia**, plus testnet REACT on **Reactive Lasna**. Faucets and fee instructions are available from official Reactive docs.
3. Run `bash scripts/deploy.sh`. The script enforces exact chain IDs and runs the Solidity test suite before deployment. It writes `deployments/lasna.json` with addresses and **deployment transaction hashes**, and copies it into `app/deployments.json`.
4. Verify all contract deployment hashes on the correct explorer. The script will refuse to overwrite `deployments/lasna.json` accidentally.

### Required network mapping

| Contract | Network | Chain ID |
|---|---|---|
| PaymentGate | Base Sepolia | 84532 |
| MockUSD | Unichain Sepolia | 1301 |
| OmniRelay | Reactive Lasna | 5318007 |
| PayoutVault | Unichain Sepolia | 1301 |

The official Unichain callback proxy address is `0x775c9B990ADe401060B78D0e98684eEf8d2466C1`. The Lasna system is `0x8888888888888888888888888888888888888888`.

## Part C — Fund callback gas **explicitly**

Fund **two deployed contracts**, not just the deployer wallet: Lasna `OmniRelay` must receive testnet REACT, and Unichain `PayoutVault` must receive testnet ETH to pay the callback network. Set the amounts in `.env` according to current faucet balances and anticipated fees; the values in `.env.example` are **examples**, not guaranteed sufficient.

```bash
# In local, gitignored .env:
RELAY_FUND_AMOUNT=0.05ether
VAULT_FUND_AMOUNT=0.002ether
CONFIRM_TESTNET_FUNDS=yes
bash scripts/fund.sh
```

Verify both funding receipts. The native network currencies are not the demo fUSD escrow token.

## Part D — Trigger the actual callback

```bash
python3 -m http.server --directory app 8080
```

Open http://localhost:8080 with a browser wallet. Claim the Unichain demo fUSD; configure a rule, merchant, beneficiary, minimum source amount, payout and expiry; approve fUSD; create an escrow rule; and send a **real Base Sepolia testnet ETH payment** through `PaymentGate`.

Check the following on the relevant explorer:

1. Base `PaymentMade` exists in a successful `PaymentGate` transaction.
2. Lasna `OmniRelay.react` was invoked by `SYSTEM` and has a `RelayRequested` event, with the system `CallbackRequest` event.
3. Unichain callback was relayed by the official proxy, the vault emitted `PayoutExecuted`, and `rules(ruleId).state == 2` (PAID).

If step 2 or 3 stalls, inspect Lasna reserve/debt, destination contract native gas funding, origin log matching and callback failures. Do not assert successful completion until independently verified.

## Part E — Cryptographic receipt verification

```bash
node scripts/verify-evidence.mjs --origin 0xBASE_TX_HASH --reactive 0xLASNA_TX_HASH --callback 0xUNICHAIN_TX_HASH
```

The verifier requires genuine matching logs and on-chain state. On success, add its `docs/VERIFIED_EVIDENCE.md` output to the public repository. On any mismatch, fix the cause and rerun. Never use local Foundry simulation hashes as live proof.

## Part F — Public materials and final submission

1. Create a new public repository named `flowpilot-omni`, commit the project **without `.env`, private keys, or API secrets**, and run the GitHub Actions pipeline.
2. Record the live flow, including all three explorer transaction hashes, in a video **shorter than 3 minutes**; see `docs/VIDEO_SCRIPT.md`. A presentation or UI mock alone is insufficient.
3. Include the exact contract addresses, hash links and repository URL in `docs/SUBMISSION.md`.
4. Submit the project to https://dorahacks.io/hackathon/reactive-omni-buildathon/detail before **December 5, 2026** (verify the precise portal close time in DoraHacks).

**Submission gate:** Only mark the project *fully deployed* when Part E succeeds. The judges explicitly say projects without an on-chain reactive transaction and destination callback are not scored further.
