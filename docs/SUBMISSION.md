# DoraHacks — Reactive Omni Buildathon submission (ready to enter)

**Project:** FlowPilot — Autonomous Cross-Chain Automations  
**Track:** Set It and Forget It  
**Tagline:** Set your rules once. Let the blockchain execute them automatically.  
**Status:** Actual three-chain testnet callback **verified** on 2026-11-23. **DoraHacks form has not yet been submitted.**

## Public submission links

- **GitHub (public, MIT):** https://github.com/samertall/flowpilot-omni
- **Live web app:** https://flowpilot-omni.vercel.app
- **72-second verified demonstration video:** https://github.com/samertall/flowpilot-omni/blob/main/docs/flowpilot-verified-demo.mp4
- **Public machine-readable evidence:** https://github.com/samertall/flowpilot-omni/blob/main/docs/CLOUD_EVIDENCE.json
- **Successful GitHub Actions verification and video:** https://github.com/samertall/flowpilot-omni/actions/runs/45133361653
- **Original successful callback Action (failed only at video-generation step):** https://github.com/samertall/flowpilot-omni/actions/runs/45133010436

## Short project description

FlowPilot is a no-code, event-driven cross-chain automation prototype built on Reactive Omni. A user escrows demonstration fUSD on Unichain Sepolia and defines a payout condition. When a qualifying ETH payment emits `PaymentMade` on Base Sepolia, a reactive contract on Lasna detects and validates the event, then requests an authenticated callback. The Unichain callback proxy invokes the vault, which releases the independently prefunded demo fUSD to the beneficiary. **No centralized polling server, keeper bot, or token bridge is required.**

## What problem does it solve?

Cross-chain conditional settlement is traditionally implemented with a server-side event watcher, off-chain rule evaluator, and destination transaction sender. Each adds operational complexity, uptime requirements, and a potential point of failure. FlowPilot demonstrates a human-centered alternative: define a settlement rule once, then let the Reactive Omni system deliver the action on-chain after the specified event occurs. It is designed for escrow-based marketplace or freelancer payment workflows where source and destination assets are held separately.

## Technical implementation and security controls

- `PaymentGate.sol` emits an indexed `PaymentMade` event on **Base Sepolia** (84532).
- `OmniRelay.sol` subscribes on **Reactive Lasna** (5318007), validates the event origin and source contract, constructs a unique proof ID, deduplicates events, and calls `SYSTEM.requestCallbackV_1_0`.
- `PayoutVault.sol` on **Unichain Sepolia** (1301) verifies the official callback proxy and authorized reactive sender, checks the merchant, source payment threshold, rule state and proof uniqueness, and releases **prefunded** demo fUSD.
- The project is an unaudited testnet prototype. **fUSD has no monetary value; source ETH is never bridged.** The first two attempts used an obsolete callback proxy and are archived. The corrected deployment uses the current Unichain Sepolia proxy `0x775c9B990ADe401060B78D0e98684eEf8d2466C1`.

## Verified deployed contracts

| Chain | Contract | Address |
| --- | --- | --- |
| Base Sepolia · 84532 | PaymentGate | `0xf576B471ABE85087D20E053256AF8b8858fC9f89` |
| Reactive Lasna · 5318007 | OmniRelay V2 | `0x79e01302E20347911352c717c38129274C78d606` |
| Unichain Sepolia · 1301 | PayoutVault V2 | `0x401859D55E599300fFaE1DbEE07B0B6C87F1d300` |
| Unichain Sepolia · 1301 | MockUSD (demo token) | `0x08b5f621d08153110d27c27A1BE5AD185d97E1f6` |

Official active Unichain callback proxy: `0x775c9B990ADe401060B78D0e98684eEf8d2466C1`.

## Actual end-to-end transaction hashes (required by judges)

1. **Source payment / event (Base Sepolia):** `0xe2bd03244e06ef405682f82e87158072468f68ec6f026e06b3beb26b23fc86bf`  
   https://sepolia.basescan.org/tx/0xe2bd03244e06ef405682f82e87158072468f68ec6f026e06b3beb26b23fc86bf
2. **Autonomous reactive execution (Lasna):** `0xf305110afc82c9b0ce3af75a68ac9c7b7dbcf1154dd3946d23841aeac783a8fa`  
   https://lasna.reactscan.net/tx/0xf305110afc82c9b0ce3af75a68ac9c7b7dbcf1154dd3946d23841aeac783a8fa
3. **Authenticated destination payout (Unichain Sepolia):** `0xd9eb71621529ebadfa5cfc1ffde2b953b18932b18a42eece76d2de8473ad2084`  
   https://sepolia.uniscan.xyz/tx/0xd9eb71621529ebadfa5cfc1ffde2b953b18932b18a42eece76d2de8473ad2084

Associated on-chain rule: `0x5472bf35a4581726776bc000e93b5ab6782d2c89191dbd935770e6965a2374f9`  
Payment amount: **0.00005 testnet ETH**. Payout amount: **25 demonstration fUSD**.  
The GitHub Actions verifier checked receipt success, callback proxy authorization, beneficiary, and the escrow rule's paid state before writing `VERIFIED_THREE_CHAIN_PAYMENT_CALLBACK`.

## Demo video

**Duration: 72 seconds** (under three-minute limit).  
https://github.com/samertall/flowpilot-omni/blob/main/docs/flowpilot-verified-demo.mp4

The video is a narrated-by-text walkthrough, combining the product UI **preview** with the **actual confirmed** transaction hashes and deployed addresses. It does **not** misrepresent the UI preview as a browser screen recording. The accompanying evidence JSON and transaction explorers establish on-chain correctness.

## Technology and maintainability

Solidity 0.8.29, Reactive Omni, Foundry, ethers.js v6, HTML/CSS/JavaScript, GitHub Actions, Vercel. Public MIT-licensed source. Tests cover event validation, destination authorization, duplicate protection, and escrow lifecycle. Deployment scripts use a dedicated testnet-only wallet, verify chain IDs, and archive failed attempts rather than fabricate data.

## Submission checklist

- [x] Public MIT-licensed repository
- [x] Real deployed contracts on the three required chains
- [x] Original Base Sepolia event transaction
- [x] Real Lasna reactive execution
- [x] Authenticated Unichain payout transaction and verified paid state
- [x] Demo video under three minutes
- [x] Hosted frontend
- [ ] Submit the official DoraHacks BUIDL form under **Set It and Forget It**, using an authenticated DoraHacks account
- [ ] Capture the resulting submitted BUIDL URL

**Organizer deadline:** December 5, 2026, at 20:00 UTC, as displayed by the official DoraHacks event page.

**Disclosure:** This is a research and hackathon demonstration only, not audited or intended for mainnet assets. The product frontend is a prototype. Independent on-chain transaction evidence is available above.
