# Demo video script · target 2:35 (must be recorded after a real, successful live run)

**Video title:** FlowPilot | Autonomous Cross-Chain Payments on Reactive Omni | Buildathon 2026

**YouTube description:** FlowPilot lets anyone create conditional cross-chain payouts without writing a smart contract. Watch a payment on Base Sepolia trigger a Reactive Omni Lasna contract and a verified callback on Unichain Sepolia. Open source: [INSERT REAL GITHUB URL]. Live transaction hashes: [INSERT THREE VERIFIED EXPLORER URLS]. Built by Samer Tallauze for the Reactive Omni Buildathon 2026. Demo tokens only; not a bridge.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:13 | FlowPilot branded opening, rule wizard | “Meet FlowPilot. Set your rules once and let Reactive Omni execute them across chains.” |
| 0:13–0:32 | Diagram Base → Lasna → Unichain | “When a Base Sepolia payment matches your condition, Reactive Lasna requests a verified callback to Unichain. No central bot or scheduled worker.” |
| 0:32–1:05 | Wallet connect, claim demo fUSD, merchant/recipient/threshold | “Here I set a conditional payout: when this merchant receives at least this much testnet ETH, release ten demo fUSD to this beneficiary.” |
| 1:05–1:22 | Approve, create funded rule, show RuleCreated transaction | “The destination escrow is prefunded. These are demo tokens, not assets being bridged.” |
| 1:22–1:38 | Payment on Base Sepolia, show PaymentMade in explorer | “A qualifying source payment emits the canonical PaymentMade event.” |
| 1:38–1:55 | Lasna explorer react() tx and CallbackRequest | “Omni receives the source log, validates its origin and sends a callback request.” |
| 1:55–2:13 | Unichain explorer PayoutExecuted tx, beneficiary fUSD change | “The destination vault authenticates the proxy and Reactive sender, then releases the payout exactly once.” |
| 2:13–2:30 | Refresh FlowPilot and show Verified Paid status | “This confirmation comes directly from the destination contract. No fabricated dashboard status.” |
| 2:30–2:35 | Repo / architecture card | “FlowPilot. Open source. Built for Reactive Omni.” |

**Recording requirements:** Keep visible wallet/explorer chain names and verified transaction hashes. Show source log, Lasna transaction and destination proxy callback clearly. Do not claim ~1s full loop unless timed. Capture real screen recording; do not substitute animation for live proof. Upload as public or unlisted YouTube, then paste URL in DoraHacks.
