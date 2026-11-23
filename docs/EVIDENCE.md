# FlowPilot — verified on-chain execution evidence

**Status: VERIFIED_THREE_CHAIN_PAYMENT_CALLBACK**  
**Date verified:** 2026-11-23 07:42:46 UTC (GitHub Actions verifier).  
**Submission track:** Reactive Omni Buildathon · Set It and Forget It.

The end-to-end payment-to-escrow release was completed on public **testnets**, with independently checkable contract addresses, receipts and the Unichain vault rule's `PAID` state. The original attempts on an obsolete callback proxy are explicitly archived and are **not** presented as successful.

## Active deployed contracts

| Contract | Network (chain ID) | Contract address | Deployment transaction |
| --- | --- | --- | --- |
| PaymentGate | Base Sepolia (84532) | `0xf576B471ABE85087D20E053256AF8b8858fC9f89` | [Transaction](https://sepolia.basescan.org/tx/0x792bf01fb6b8128038abb1213a9e9ca70d7200c7318845d64d015c3b4c01674f) |
| OmniRelay V2 | Reactive Lasna (5318007) | `0x79e01302E20347911352c717c38129274C78d606` | [Transaction](https://lasna.reactscan.net/tx/0x5b222d64e65ef2a85616431a05ec62f8d3c391414b25a95dfc0efd137acea4dd) |
| PayoutVault V2 | Unichain Sepolia (1301) | `0x401859D55E599300fFaE1DbEE07B0B6C87F1d300` | [Transaction](https://sepolia.uniscan.xyz/tx/0xf866069f0187b97f8324426d5d37ece30dd53d3166cb927a0fd4e78a27bc2a25) |
| MockUSD (test fUSD) | Unichain Sepolia (1301) | `0x08b5f621d08153110d27c27A1BE5AD185d97E1f6` | [Transaction](https://sepolia.uniscan.xyz/tx/0x2119f70998db72d23ecb42a621d1472144119d7aecf4093e243a968279b8ca9e) |

Unichain callback proxy (post-Omni): `0x775c9B990ADe401060B78D0e98684eEf8d2466C1`. The old proxy `0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4` did not deliver Omni callbacks in the initial deployment.

## Verified full-loop transaction evidence

| Stage | Real transaction hash | Chain explorer |
| --- | --- | --- |
| Funded escrow rule | `0x611f82c3769115611f28209c3675593419b9c0a95400260676156f41a01442c1` | [Unichain Sepolia](https://sepolia.uniscan.xyz/tx/0x611f82c3769115611f28209c3675593419b9c0a95400260676156f41a01442c1) |
| Origin event `PaymentMade` | `0xe2bd03244e06ef405682f82e87158072468f68ec6f026e06b3beb26b23fc86bf` | [Base Sepolia](https://sepolia.basescan.org/tx/0xe2bd03244e06ef405682f82e87158072468f68ec6f026e06b3beb26b23fc86bf) |
| Lasna `RelayRequested` + callback request | `0xf305110afc82c9b0ce3af75a68ac9c7b7dbcf1154dd3946d23841aeac783a8fa` | [Reactive Lasna](https://lasna.reactscan.net/tx/0xf305110afc82c9b0ce3af75a68ac9c7b7dbcf1154dd3946d23841aeac783a8fa) |
| Destination `PayoutExecuted` | `0xd9eb71621529ebadfa5cfc1ffde2b953b18932b18a42eece76d2de8473ad2084` | [Unichain Sepolia](https://sepolia.uniscan.xyz/tx/0xd9eb71621529ebadfa5cfc1ffde2b953b18932b18a42eece76d2de8473ad2084) |

**Rule ID:** `0x5472bf35a4581726776bc000e93b5ab6782d2c89191dbd935770e6965a2374f9`  
**Proof ID:** `0x89df1cbedf842bee76b8222ce4364239ae5bbe34a44645dc6c5a0f798d3f9fd8`  
**Source payment:** 0.00005 Base Sepolia test ETH  
**Destination payout:** 25 fUSD **demo tokens** (not real USD)  
**Beneficiary:** `0x24E895cBE3c427E08A7A013553813933cffeB68A`

## Verified acceptance checklist

- [x] Source payment contract deployed with a real event on Base Sepolia.
- [x] Reactive contract deployed and subscribed on Lasna.
- [x] Destination vault configured for the current official Unichain Sepolia callback proxy.
- [x] Destination vault authorizes the deployed V2 OmniRelay.
- [x] Callback execution reserves funded on both chains.
- [x] `PaymentMade` observed in an actual Base transaction receipt.
- [x] `RelayRequested` and a callback request observed on Lasna.
- [x] Real Unichain proxy transaction emitted `PayoutExecuted`.
- [x] Verified escrow rule state `PAID (2)` and correct beneficiary.
- [x] Public open-source repository and a 72-second evidence video published.

## Reproduction and evidence links

- **Machine-readable verification:** [CLOUD_EVIDENCE.json](CLOUD_EVIDENCE.json)
- **Successful no-new-payment read-only verification:** https://github.com/samertall/flowpilot-omni/actions/runs/45133361653
- **72-second demonstration:** [flowpilot-verified-demo.mp4](flowpilot-verified-demo.mp4)
- **Submission draft:** [SUBMISSION.md](SUBMISSION.md)
- **Deployment manifest:** [../deployments/lasna.json](../deployments/lasna.json)
- **Legacy deployment and failed-attempt history:** [../deployments/lasna-legacy.json](../deployments/lasna-legacy.json), [CLOUD_EVIDENCE_ATTEMPT1.json](CLOUD_EVIDENCE_ATTEMPT1.json), [CLOUD_EVIDENCE_LEGACY_ATTEMPT2.json](CLOUD_EVIDENCE_LEGACY_ATTEMPT2.json)

**Timing caveat:** The verifier recorded an end-to-end success within its own polling run, but no validated block-timestamp latency measurement is claimed. This is an unaudited testnet prototype. The original ETH does not bridge; the destination fUSD was escrowed independently.
