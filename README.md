# FlowPilot — Set it. Forget it. Done.

**Reactive Omni Buildathon 2026 · Set It and Forget It track**

FlowPilot is an open-source, wallet-connected automation builder that releases **prefunded demo escrow tokens on Unichain Sepolia** when a **qualifying native ETH payment occurs on Base Sepolia**, using **Reactive Omni's Lasna testnet** as the only execution relay.

> **Current status (2026-11-19):** Public source repository published; GitHub Actions **successfully compiled** the Solidity contracts and passed **18/18 Foundry tests**, JavaScript checks and JSON validation. The responsive frontend is live at [flowpilot-omni.vercel.app](https://flowpilot-omni.vercel.app). **No real three-chain contract deployment or event-to-callback transaction proof has been completed yet.** The hosted interface is a functional UI preview, not a verified live blockchain demo. No contract addresses or transaction IDs are fabricated.

## The user problem

A freelancer, marketplace operator or small team often wants a simple if-then payment rule: *when customer A pays merchant B a specified amount, automatically release an earmarked payment to supplier C*. Today that usually requires a central server and a cron job. FlowPilot gives users a no-code rule wizard and an independently verifiable on-chain event-to-callback execution path.

## Network architecture

```
            Base Sepolia · 84532
      PaymentGate.pay(ruleId, merchant)
         │  transfers test ETH to merchant
         └─ PaymentMade(ruleId,payer,merchant,amount) [LOG4]
                        │
                        ▼
           Reactive Lasna · 5318007
        OmniRelay.react() via SYSTEM
         ├─ validates source chain and contract
         ├─ validates event signature and LOG4 shape
         ├─ computes proof = hash(chain,contract,txHash,logIndex)
         ├─ deduplicates source log
         └─ SYSTEM.requestCallbackV_1_0()
                        │
                        ▼
         Unichain Sepolia · 1301
       Callback Proxy (official address)
         └─ PayoutVault.executePayout(...)
               ├─ onlyServiceProvider
               ├─ onlyCallbackSender
               ├─ check funded rule, merchant & threshold
               ├─ check expiry & replay
               └─ sends prefunded fUSD to beneficiary
```

**No bridging is performed.** The source payment is transferred to the merchant in Base Sepolia ETH. The destination fUSD escrow is funded in a separate transaction on Unichain Sepolia. `fUSD` is a locally deployed demo token with **no monetary value**.

## Network details (verified against official Reactive docs on 2026-11-19)

| Role | Chain | Chain ID | Contract |
| --- | --- | ---: | --- |
| Origin | Base Sepolia | 84532 | `PaymentGate.sol` |
| Reactive engine | Lasna Omni | 5318007 | `OmniRelay.sol` |
| Destination | Unichain Sepolia | 1301 | `PayoutVault.sol` |
| Test-only ERC20 | Unichain Sepolia | 1301 | `MockUSD.sol` |
| Unichain Callback Proxy | Unichain Sepolia | 1301 | `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` |
| Lasna System Contract | Lasna Omni | 5318007 | `0x8888888888888888888888888888888888888888` |

Official docs: https://dev.reactive.network/reactive-contracts and https://dev.reactive.network/origins-and-destinations

## Quick start

Prerequisites: [Foundry](https://getfoundry.sh/), Git, Python 3, a browser wallet, **testnet-only** ETH on Base and Unichain, and testnet REACT on Lasna.

```bash
# Clone the published repository
git clone https://github.com/samertall/flowpilot-omni.git
cd flowpilot-omni
forge install foundry-rs/forge-std --no-commit
forge install Reactive-Network/reactive-lib-omni --no-commit
forge build
forge test -vvv

cp .env.example .env
# Edit .env to set PRIVATE_KEY of a NEW THROWAWAY TESTNET wallet.
# NEVER commit or share this key.
bash scripts/deploy.sh
# Optionally set RELAY_FUND_AMOUNT, VAULT_FUND_AMOUNT and CONFIRM_TESTNET_FUNDS=yes
# in .env, then run `bash scripts/fund.sh` (actual testnet transfers).

python3 -m http.server --directory app 8080
# Open http://localhost:8080
```

Deployment requires funded testnet wallets and working RPCs. After deploying, transfer **testnet REACT** to the Lasna `OmniRelay`, and **testnet Unichain ETH** to the `PayoutVault` to cover callback charges. The deploy script writes `app/deployments.json` and `deployments/lasna.json` including deployment transaction hashes; no private key is included.

Lasna testnet REACT faucet instructions: https://dev.reactive.network/debugging

### Live demo: exact action sequence

1. Fund the test wallet on **Base Sepolia, Lasna and Unichain Sepolia**.
2. Run the deployment script and verify `PaymentGate`, `MockUSD`, `OmniRelay`, `PayoutVault`, and `setDestination` transactions.
3. Open FlowPilot and connect your MetaMask-compatible browser wallet.
4. On Unichain Sepolia, click **Get 1,000 demo fUSD**; this is a one-time per wallet testnet faucet.
5. Set a merchant, beneficiary, minimum source payment, fUSD payout and expiration.
6. Click **Approve & create rule**. The fUSD moves into the vault escrow and `RuleCreated` is emitted.
7. Select the resulting rule in **Trigger your rule** and click **Send testnet payment**. Your wallet switches to **Base Sepolia**; `PaymentGate` forwards the ETH to the specified merchant and emits `PaymentMade`.
8. Omni Lasna consumes the origin event and emits `RelayRequested` when it calls `SYSTEM.requestCallbackV_1_0`. Reactive delivers a callback via the official Unichain callback proxy.
9. On Unichain, inspect `PayoutExecuted`, the beneficiary fUSD balance and the rule's on-chain state (`2 = PAID`). Refresh the interface to show verified status.

> Only create test rules whose addresses you control. An event triggers a payout only when the merchant and minimum ETH amount match, and the rule is active. **Do not send real assets.**

## Execution evidence checklist

Judges require the **full loop**, not just unit tests. Capture the following after a real run:

- `origin_payment_tx`: Base Sepolia transaction containing `PaymentMade` (link to `https://sepolia.basescan.org/tx/<hash>`).
- `reactive_execution_tx`: Lasna transaction calling `OmniRelay.react`, containing `RelayRequested` and the system's `CallbackRequest` (link to Lasna explorer).
- `destination_callback_tx`: Unichain Sepolia callback-proxy delivery containing `PayoutExecuted` (link to `https://sepolia.uniscan.xyz/tx/<hash>`).
- Four verified deployed contract addresses, and `setDestination` transaction hash.
- Timings from actual transaction receipts. **Do not claim a measured 1-second end-to-end execution without measuring it.** The ~1-second figure refers to Omni's block interval.

Fill in [`docs/EVIDENCE.md`](docs/EVIDENCE.md) from live chain explorers. **Do not submit an unverified local simulation as on-chain evidence.**

### Machine-verifiable proof (after deployment, never before)

Install Node 20+ and dependencies, then provide *real* hashes from the three supported explorers:

```bash
npm install --no-audit --no-fund
node scripts/verify-evidence.mjs \
  --origin 0xBASE_TRANSACTION_HASH \
  --reactive 0xLASNA_REACTIVE_TRANSACTION_HASH \
  --callback 0xUNICHAIN_CALLBACK_TRANSACTION_HASH
```

Replace each placeholder with the complete 66-character transaction hash, without spaces. The verifier reads only RPCs, checks the system's `CallbackRequest` payload, recomputes the event proof, validates the callback's payout event and final escrow state, and writes `docs/VERIFIED_EVIDENCE.json` and `.md` **only after all checks pass**. If anything mismatches, it exits nonzero and does not label the run verified.

See [`docs/LIVE_EXECUTION_CHECKLIST.md`](docs/LIVE_EXECUTION_CHECKLIST.md) for detailed instructions. Testnet funding and confirmation are manual, intentional wallet actions.


## Preview assets

**Live interface:** https://flowpilot-omni.vercel.app (connects to contracts only after real deployment addresses are configured).

![FlowPilot desktop UI](docs/preview-dashboard-desktop.png)


- [`docs/preview-dashboard-desktop.png`](docs/preview-dashboard-desktop.png): desktop UI capture.
- [`docs/preview-dashboard-mobile.png`](docs/preview-dashboard-mobile.png): mobile UI capture.
- [`docs/flowpilot-intro-preview.mp4`](docs/flowpilot-intro-preview.mp4): **35-second introduction only**. It does not show a real on-chain execution, and cannot replace the required live transaction demo.
- [`docs/LOCAL_VALIDATION.json`](docs/LOCAL_VALIDATION.json): exact static checks and explicit unverified items.

## Security properties and limitations

- Source event authenticity: `react()` requires a call from the official Lasna system and validates origin chain/address, signature, `LOG4` topic count and ABI payload length.
- `OmniRelay` uses `keccak256(chainId, originContract, txHash, logIndex)` to deduplicate callbacks. Its destination may be configured only once by the deployment owner.
- Destination authentication checks **both** the official callback proxy and the originating Reactive contract via `AbstractCallback` modifiers.
- Escrow is token-funded with exact-balance verification, reentrancy protection, immutable routing parameters per rule, and a one-time payout state machine.
- The sponsor may refund unused escrow only after expiry plus a 1-hour callback grace period.
- The payout is made by **whoever first satisfies the rule**: it does not authenticate payer identity beyond the logged sender. Treat each rule ID as public. Do not use for applications requiring named-payer authorization.
- The `OmniRelay` currently sends callbacks for any structurally valid source event. The destination enforces threshold/merchant conditions. Callback fees may be incurred for unmatched or expired events. For production, per-rule filters and authenticated cross-chain rule-registration should be implemented.
- Callback delivery is asynchronous; failure or insufficient funding can leave a qualifying payment made but a destination payout unexecuted. Do not use without monitoring, reconciliation and dispute procedures.
- **Unaudited hackathon prototype; no real-value token, no financial guarantees, no bridge, no oracle.**

## Repository layout

```
app/                 Responsive no-code interface (HTML, CSS, JS + ethers v6)
src/                 PaymentGate, OmniRelay, PayoutVault, MockUSD
scripts/deploy.sh    Three-network deployment and configuration
scripts/fund.sh      Opt-in native testnet funding to pay execution fees
scripts/verify-evidence.mjs  Read-only end-to-end receipt verification
scripts/check-loop.sh  Post-deployment inspection helper
test/                Foundry authentication, replay, refund and loop simulation tests
docs/                Evidence template, demo script, submission copy
.github/workflows/   Build and test in GitHub Actions
```

## Scoring alignment

- **Execution:** PaymentMade → reactive transaction → authenticated payout; must be proven live via explorer transaction hashes.
- **Integration:** Essential on-chain logic is performed by Reactive; no back-end watcher performs the automation.
- **Usefulness:** Easy-to-understand no-code rules for conditional business payouts; merchant and recipient independently selectable.
- **Craft:** Accessible, responsive UI; Foundry tests; documented deployments, limitations and proof links.

## License
MIT © 2026 Samer Tallauze.
