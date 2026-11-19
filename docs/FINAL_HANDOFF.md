# FlowPilot: shipping checklist for Windows / Git Bash

## 1. Install and test

Install Foundry from https://getfoundry.sh/ using Windows WSL or a supported environment. For users on Windows 11, **WSL Ubuntu** is the recommended option. Use WSL or Git Bash for the shell scripts. You need a new testnet-only EVM wallet funded for the three respective networks.

```bash
unzip flowpilot-omni.zip
cd flowpilot-omni
git init
forge install foundry-rs/forge-std --no-commit
forge install Reactive-Network/reactive-lib-omni --no-commit
forge build
forge test -vvv
```

> Local source validation performed during preparation: `node --check app/app.js`, `bash -n scripts/*.sh`, JSON parse, contract syntax delimiters. Foundry was **not available** during preparation; compilation and contract tests are **not yet verified**.

## 2. Fund testnet-only wallet

You need Base Sepolia ETH, Unichain Sepolia ETH, and Lasna testnet REACT. Reactive's official faucet instructions: https://dev.reactive.network/debugging. The callback vault itself requires Unichain Sepolia ETH for network callback fees; the Lasna relay requires REACT. You must fund those contract addresses **after** deployment.

## 3. Deploy all contracts

Copy `.env.example` to `.env`, fill in a newly created **testnet-only** private key (do not paste it into ChatGPT, GitHub, screenshots, or demo), and run:

```bash
bash scripts/deploy.sh
```

The script checks the expected chain IDs, runs `forge test`, deploys four contracts, configures the callback route, and writes `app/deployments.json` and `deployments/lasna.json` with addresses **and deployment transaction hashes**. Verify the output against chain explorers. Do not rely on the script alone as proof that a full origin-to-callback loop has executed.

## 4. Run and record real demo

```bash
python3 -m http.server --directory app 8080
```

Open `http://localhost:8080`. Follow README's live sequence. Use the on-chain debug tool at https://dev.reactive.network/reactive-mcp and the Lasna explorer for any stuck callback. Enter real event / reactive / callback transaction hashes into `docs/EVIDENCE.md`.

## 5. Publish public repository

Create a **new public GitHub repository** named `flowpilot-omni` under your own account (do not use an existing unrelated repository). From the root of this project:

```bash
git add .
git commit -m "feat: FlowPilot Reactive Omni buildathon submission"
git branch -M main
git remote add origin https://github.com/samertall/flowpilot-omni.git
git push -u origin main
```

The configured GitHub connection identifies the account as `samertall`. Never include `.env` or wallet secrets. Check the GitHub Actions Solidity test workflow reaches success.

## 6. Publish demo and submit

Record the actual working on-chain loop following `docs/VIDEO_SCRIPT.md`, keeping the video below 3 minutes. Upload it and copy its public link. Fill `docs/SUBMISSION.md` and submit on:

https://dorahacks.io/hackathon/reactive-omni-buildathon/detail

**Do not submit as fully operational before the verified chain loop exists.** The execution criterion is a prerequisite for judging, not just a weighted extra.

## 7. Validate three-chain evidence automatically

After live execution, install the Node dependency and run:

```bash
npm install --no-audit --no-fund
node scripts/verify-evidence.mjs --origin 0xBASE_TX --reactive 0xLASNA_TX --callback 0xUNICHAIN_TX
```

Only if **all real receipts** match will the verifier write `docs/VERIFIED_EVIDENCE.md` and `docs/VERIFIED_EVIDENCE.json`. The included `flowpilot-intro-preview.mp4` is a **35-second silent UI/architecture introduction**, not a verified live demo; splice it into your real recording if useful, and keep the final submission video under three minutes. See `docs/LIVE_EXECUTION_CHECKLIST.md`.
