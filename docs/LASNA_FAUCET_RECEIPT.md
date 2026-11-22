# Reactive Lasna testnet funding — verified receipt

**Status:** Faucet transaction confirmed on Base Sepolia and the resulting lREACT balance independently observed by the GitHub Actions read-only balance check.

- Public wallet: `0x24E895cBE3c427E08A7A013553813933cffeB68A`
- Network: Base Sepolia (chain 84532) → Reactive Lasna (chain 5318007)
- Official Base Sepolia Reactive faucet: `0x2afaFD298b23b62760711756088F75B7409f5967`
- Base Sepolia test ETH sent: **0.0018 ETH**
- Source transaction hash: `0xc9f33c2ec2d2370154f84ad905338593c8baa5f16104b4912dc22ecb186cf5f9`
- Base transaction: https://sepolia.basescan.org/tx/0xc9f33c2ec2d2370154f84ad905338593c8baa5f16104b4912dc22ecb186cf5f9
- Faucet Action run: https://github.com/samertall/flowpilot-omni/actions/runs/45015441296
- Post-faucet read-only balance-check Action: https://github.com/samertall/flowpilot-omni/actions/runs/45015578877

## Verified balances (2026-11-22 at ~11:05 UTC)

| Network | Amount | RPC-derived observation |
| --- | ---: | --- |
| Base Sepolia | 0.003199846417999908 test ETH | Read-only balance-check Action |
| Reactive Lasna | 0.18 lREACT | Read-only balance-check Action |
| Unichain Sepolia | 0 test ETH | Read-only balance-check Action |

The successful faucet Action printed `[base] sent 0xc9f33c2ec2d2370154f84ad905338593c8baa5f16104b4912dc22ecb186cf5f9` and `Lasna lREACT received: 0.18`. The subsequent independent preflight confirmed all three balances via JSON-RPC.

**No FlowPilot contracts have been deployed. No origin payment-to-destination callback has been verified.** This receipt only proves testnet gas funding; it is not hackathon delivery evidence. Do not repeat the lREACT faucet transaction. Unichain Sepolia test ETH remains the blocking dependency for the deployment workflow.
