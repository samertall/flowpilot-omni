# DoraHacks submission copy (draft — confirm evidence before submitting)

## BUIDL title
FlowPilot — Autonomous Cross-Chain Automations

## Track
Set It and Forget It

## Tagline
Set your rules once. Let the blockchain execute them automatically.

## Short description
FlowPilot is a no-code on-chain automation builder powered by Reactive Omni. Users define an escrowed conditional payout on Unichain Sepolia. When a qualifying ETH payment occurs on Base Sepolia, a reactive contract on Lasna verifies the event and automatically triggers an authenticated Unichain callback to release prefunded demo tokens. No server-side watcher or manual settlement is needed.

## Description
Most cross-chain workflows still rely on centralized bots to monitor transactions, evaluate conditions and trigger the next action. FlowPilot turns that three-step job into a human-friendly rule that executes through Reactive Omni itself.

The demonstration uses a real source payment (Base Sepolia `PaymentGate`), a reactive on-chain evaluator (`OmniRelay` on Lasna), and a token escrow with authenticated callback (`PayoutVault` on Unichain Sepolia). The flow prevents forged direct callbacks, validates merchant and payment threshold, deduplicates source events and rejects duplicate payouts. The destination tokens are **prefunded demo tokens**; FlowPilot is not a bridge.

Built for non-contract users: connect a wallet, claim test tokens, choose a merchant/recipient/threshold/expiration, create the rule and make a test payment. On-chain evidence can be inspected via the three chain explorers.

## Why Reactive is essential
Without the Lasna `react()` event listener and `requestCallbackV_1_0`, the payout has no trusted automatic trigger. The relay authenticates and normalizes source events, creates unique proofs and issues actual cross-chain callback requests. The Unichain vault only accepts calls through the official callback proxy from the authorized OmniRelay.

## Technical stack
Solidity 0.8.29, Reactive Omni / Lasna testnet, Base Sepolia, Unichain Sepolia, Foundry, ethers.js v6, vanilla responsive HTML/CSS/JS, GitHub Actions. Open-source MIT.

## Deliverable fields (replace only with VERIFIED values)
Public repository: PENDING
Live demo URL: PENDING
PaymentGate address (Base Sepolia): PENDING
OmniRelay address (Lasna): PENDING
PayoutVault address (Unichain Sepolia): PENDING
MockUSD address (Unichain Sepolia): PENDING
Origin event transaction hash: PENDING
Reactive transaction hash: PENDING
Destination callback transaction hash: PENDING
Demo video (< 3 min): PENDING

## Non-negotiable disclosure
This is an unaudited testnet prototype. Demo fUSD is not real USD. Base ETH is not bridged to Unichain. End-to-end throughput or latency must be measured rather than inferred from the advertised Omni block interval.
