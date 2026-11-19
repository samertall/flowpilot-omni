# Live execution evidence · must be filled from real transactions

**Status: NOT DEPLOYED / NOT VERIFIED.** Do not replace these placeholders with fabricated values. The project only satisfies buildathon execution eligibility once a live event→reactive transaction→callback is verified.

## Deployed contracts

| Contract | Network | Address | Verified source URL |
| --- | --- | --- | --- |
| PaymentGate | Base Sepolia | `PENDING` | `PENDING` |
| OmniRelay | Reactive Lasna | `PENDING` | `PENDING` |
| PayoutVault | Unichain Sepolia | `PENDING` | `PENDING` |
| MockUSD fUSD | Unichain Sepolia | `PENDING` | `PENDING` |

## Full-loop transaction evidence

| Stage | Transaction hash | Explorer URL | Recorded UTC timestamp |
| --- | --- | --- | --- |
| Create funded rule | `PENDING` | `PENDING` | `PENDING` |
| Origin event / PaymentMade | `PENDING` | `PENDING` | `PENDING` |
| Lasna react + CallbackRequest | `PENDING` | `PENDING` | `PENDING` |
| Destination proxy + PayoutExecuted | `PENDING` | `PENDING` | `PENDING` |

Rule ID: `PENDING`

Origin event ↔ Lasna proof ID ↔ destination payout verification: `PENDING`

Observed elapsed wall-clock from origin receipt to destination receipt: `NOT MEASURED`. Any reported timing must include methodology, block timestamps, and RPC polling delay limitations.

## Verification checklist

- [ ] Source contract was deployed on Base Sepolia and source Solidity is verifiable.
- [ ] Reactive contract subscription is active on Lasna.
- [ ] Destination vault's `_CALLBACK_SENDER` is the deployed OmniRelay.
- [ ] Destination vault's service provider is the official Unichain Sepolia callback proxy.
- [ ] Reactive contract and callback recipient are funded for fees.
- [ ] `PaymentMade` emitted in a real Base transaction.
- [ ] The actual Lasna Reactive transaction and `CallbackRequest` are visible.
- [ ] The destination transaction originated through the callback proxy, contains `PayoutExecuted`, and transfers fUSD.
- [ ] `rules(ruleId).state == 2` on Unichain.
- [ ] Public GitHub repository and live demo video exist.
