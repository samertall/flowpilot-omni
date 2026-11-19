# FlowPilot — cloud-only testnet deployment (no laptop tooling)

The code runs on **GitHub Actions**, not on your computer. No terminal, local Foundry installation or wallet extension is required to deploy. GitHub Actions sends transactions using a **brand-new, testnet-only account** that you create and explicitly authorize.

**Do not paste any private key or seed phrase into ChatGPT, a GitHub issue, pull request, workflow input, or repository file.** A repository **Actions secret** is encrypted and is only exposed to a workflow at runtime. Even so, repository administrators and workflows with secret access must be trusted, so this must be a disposable wallet with **no mainnet funds, NFTs, approvals, or personal holdings**. Never reuse your main wallet.

## Funding without laptop software (verified wallet)

Public, disposable testnet address from GitHub Actions: `0x24E895cBE3c427E08A7A013553813933cffeB68A`. Never share its private key.

If a normal public faucet requires Ethereum **mainnet** funds, do **not** purchase or transfer real ETH to this disposable deployment wallet. Instead, sign in to an established testnet-only faucet service using its normal account verification, and request **testnet** tokens for the address above:

- Base Sepolia: https://ethglobal.com/faucet/base-sepolia-84532 (listed 0.05 test ETH/day; sign-in required)
- Unichain Sepolia: https://ethglobal.com/faucet/unichain-sepolia-1301 (listed 0.05 test ETH/day; sign-in required)

Faucet availability and eligibility may vary. Avoid bypassing CAPTCHA, account checks or rate limits. The cloud workflow can request Lasna lREACT after Base Sepolia test ETH arrives, using the explicitly approved `faucet` phase. The public balance and transaction hashes must be checked before running `deploy`.

## Four steps in your browser (phone is fine)

1. Create a fresh wallet dedicated **exclusively** to this testnet demo. Keep its seed phrase/private key outside ChatGPT and public code.
2. In [Repository settings → Actions secrets](https://github.com/samertall/flowpilot-omni/settings/secrets/actions), select **New repository secret**. Name it exactly `FLOWPILOT_TESTNET_PRIVATE_KEY` and put the throwaway wallet private key in the **secret's Value field**. This is the only place the key is entered; don't send it to the assistant.
3. In [Actions → FlowPilot — Cloud Testnet Deployment & Evidence](https://github.com/samertall/flowpilot-omni/actions/workflows/cloud-testnet.yml), choose **Run workflow**, then select `preflight` with `confirm_testnet_broadcast=no`. Read the log for the public wallet address and three chain balances. This phase does **not** send transactions.
4. Fund this **public testnet address** with Base Sepolia and Unichain Sepolia test ETH. If you lack Lasna lREACT, run the optional `faucet` phase with `yes` to request it from the official Reactive Base Sepolia faucet using `0.01` Base Sepolia TESTNET ETH; the workflow records the faucet transaction. Then run `deploy` with `confirm_testnet_broadcast=yes`. After a successful run, choose `demo` with `yes` to automatically execute the on-chain demo. If callback delivery takes longer than the runner timeout, choose `verify` with `no` to resume **read-only verification** without paying again.

## Have ChatGPT trigger the GitHub jobs for you

After adding the disposable wallet key in the Actions secret settings, tell ChatGPT only **"The secret is configured"** (and optionally the PUBLIC wallet address). Because this repository has granted the connected GitHub app write access, ChatGPT can trigger `preflight` by committing an approval marker at `.flowpilot/trigger.json` without you opening the Actions page. After you fund the testnet wallet, ChatGPT can trigger the `faucet`, `deploy`, `demo` and `verify` phases through the same mechanism. All write phases check for the exact `confirm_testnet_broadcast=yes` authorization. The wallet key stays in GitHub Secrets, not in chat, GitHub commits or logs. Every action generates a GitHub Actions run with public outcome evidence.

If you prefer, you can still launch the manual `workflow_dispatch` using GitHub's Run workflow button.

## Which coins and how much?

Everything is **testnet only**; no real-money tokens are required.

| Network | Chain ID | Native testnet gas | Suggested starting balance for this one demo |
| --- | --- | --- | --- |
| Base Sepolia | 84532 | Testnet ETH | 0.03 ETH if using the optional Lasna faucet, otherwise 0.01 ETH |
| Reactive Lasna Omni | 5318007 | Testnet lREACT | 0.2 lREACT or more |
| Unichain Sepolia | 1301 | Testnet ETH | 0.01 ETH |

**Testnet funding varies with faucet availability and actual fees.** The optional `faucet` phase spends exactly `0.01` Base Sepolia TESTNET ETH and requires at least `0.02` Base Sepolia test ETH beforehand. Minimum checks in the script are 0.003 Base ETH, 0.15 lREACT and 0.006 Unichain ETH. If the wallet is insufficiently funded, the deploy phase aborts *before deploying anything*.

For Lasna lREACT, the official Reactive docs describe the Base Sepolia faucet at `0x2afaFD298b23b62760711756088F75B7409f5967` and the `request(address)` function; the listed exchange rate is 1 testnet ETH → 100 testnet lREACT. See https://dev.reactive.network/reactive-mainnet. **Verify the faucet address on the official page before sending testnet funds**. Do not send mainnet ETH to a testnet faucet.

**Approved testnet deposits:** the deploy phase transfers `0.06 lREACT` to Reactive's Lasna system contract using `depositTo(relay)`, and `0.003 Unichain Sepolia ETH` to the Unichain callback proxy using `depositTo(vault)`. Fees and deposits are testnet-only. No mainnet chains are configured. The script blocks mismatched chain IDs.

## Evidence created automatically

- `deploy` uploads `deployments/lasna.json` with deployment contract addresses, transaction hashes and the official callback proxy; it publishes a copy to `app/deployments.json`.
- `demo` calls the fUSD test faucet, approves escrow, creates an automation rule, sends the payment to the same testnet wallet on Base Sepolia, then waits for `RelayRequested` on Lasna and `PayoutExecuted` from the authorized Unichain callback proxy. It stores source, relay and callback hashes in `docs/CLOUD_EVIDENCE.json`.
- A successful, **verified** workflow records `VERIFIED_THREE_CHAIN_PAYMENT_CALLBACK`; otherwise the file explicitly says `PENDING_UNVERIFIED_CALLBACK` and the workflow fails. It never invents hashes or success claims.
- After a three-chain callback is verified, GitHub Actions also renders a **72-second evidence-backed demo video** with actual transaction hashes at `docs/flowpilot-verified-demo.mp4`. It refuses to generate a success video when proof is incomplete. Every run publishes a public JSON artifact under the GitHub Actions run page. If an automation fails midway, the partial addresses and receipts are still available, avoiding blind redeployments.

## Submission follow-through

After `docs/CLOUD_EVIDENCE.json` shows verified on-chain delivery, use real explorer links, contract addresses and a recorded video under three minutes for the [Reactive Omni Buildathon](https://dorahacks.io/hackathon/reactive-omni-buildathon/detail). DoraHacks account sign-in must be completed in an authenticated browser session; GitHub Actions does not submit to DoraHacks on its own.

Official sources: [Reactive network testnet RPC/faucet](https://dev.reactive.network/reactive-mainnet), [Reactive economy and deposits](https://dev.reactive.network/economy), [supported destinations/proxies](https://dev.reactive.network/origins-and-destinations), [GitHub Actions repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).
