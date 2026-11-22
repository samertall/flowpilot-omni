import { ethers } from 'https://esm.sh/ethers@6.15.0';

// Each signed transaction is explicit and wallet-confirmed; never input a private key.
const $ = id => document.getElementById(id);
const CHAINS = {
  base: { id: 84532, hex: '0x14a34', name: 'Base Sepolia', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org', symbol: 'ETH' },
  lasna: { id: 5318007, hex: '0x512577', name: 'Reactive Lasna', rpc: 'https://lasna-rpc.rnk.dev/', explorer: 'https://lasna-omni.reactscan.net', symbol: 'lREACT' },
  uni: { id: 1301, hex: '0x515', name: 'Unichain Sepolia', rpc: 'https://sepolia.unichain.org', explorer: 'https://sepolia.uniscan.xyz', symbol: 'ETH' },
};
const PROXY = '0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4';
const SYSTEM = '0x8888888888888888888888888888888888888888';
const STORAGE = 'flowpilot:wallet-deploy-v1';
const STEPS = [
  { key: 'gate', chain: 'base', title: 'Deploy PaymentGate', description: 'Source ETH payment receipt and PaymentMade event on Base Sepolia.', artifact: 'PaymentGate' },
  { key: 'token', chain: 'uni', title: 'Deploy demo fUSD', description: 'Test-only token with a free one-time wallet faucet on Unichain Sepolia.', artifact: 'MockUSD' },
  { key: 'relay', chain: 'lasna', title: 'Deploy OmniRelay', description: 'Subscribe to Base events and request authenticated callbacks on Reactive Lasna.', artifact: 'OmniRelay' },
  { key: 'vault', chain: 'uni', title: 'Deploy PayoutVault', description: 'Hold prefunded fUSD and release it only after verified callback.', artifact: 'PayoutVault' },
  { key: 'route', chain: 'lasna', title: 'Set callback destination', description: 'Configure the OmniRelay once with the deployed vault address. This cannot be changed.', artifact: null },
  { key: 'fundRelay', chain: 'lasna', title: 'Fund Reactive execution', description: 'Deposit testnet lREACT reserves in the official Lasna system contract.', artifact: null },
  { key: 'fundVault', chain: 'uni', title: 'Fund destination callback', description: 'Deposit Unichain Sepolia testnet ETH into the official callback proxy.', artifact: null },
];
const ARTIFACTS = {};
let state = load();
let account = null;
let pending = false;
function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function save() { localStorage.setItem(STORAGE, JSON.stringify(state)); render(); }
function shortened(v) { return v ? `${v.slice(0, 9)}…${v.slice(-7)}` : '—'; }
function message(value, error = false) { $('status').textContent = value; $('status').className = `status ${error ? 'error' : 'success'}`; }
function fail(error) { console.error(error); message(error?.shortMessage || error?.info?.error?.message || error?.message || String(error), true); }
function checkedAddress(value) { if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw Error('Invalid contract address.'); return ethers.getAddress(value); }
function wallet() { if (!window.ethereum) throw Error('Install a browser wallet such as MetaMask, then connect it.'); return new ethers.BrowserProvider(window.ethereum); }
async function connect() {
  const provider = wallet(); await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner(); account = await signer.getAddress();
  if (state.account && state.account.toLowerCase() !== account.toLowerCase()) {
    throw Error(`This browser has an unfinished deployment belonging to ${state.account}. Switch back to that wallet to continue.`);
  }
  if (!state.account) { state.account = account; save(); }
  $('wallet').textContent = `Connected ${shortened(account)}`;
  render();
}
async function switchChain(key) {
  const chain = CHAINS[key];
  const provider = wallet();
  const actual = await provider.send('eth_chainId', []);
  if (BigInt(actual) !== BigInt(chain.id)) {
    try { await provider.send('wallet_switchEthereumChain', [{ chainId: chain.hex }]); }
    catch (error) {
      const code = error?.code ?? error?.info?.error?.code;
      if (Number(code) !== 4902) throw error;
      await provider.send('wallet_addEthereumChain', [{
        chainId: chain.hex, chainName: chain.name, rpcUrls: [chain.rpc],
        nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
        blockExplorerUrls: [chain.explorer],
      }]);
      await provider.send('wallet_switchEthereumChain', [{ chainId: chain.hex }]);
    }
  }
  const fresh = wallet();
  const net = await fresh.getNetwork();
  if (net.chainId !== BigInt(chain.id)) throw Error(`Wrong network: expected ${chain.name} (${chain.id}), got ${net.chainId}`);
  const signer = await fresh.getSigner();
  if (!account || (await signer.getAddress()).toLowerCase() !== account.toLowerCase()) throw Error('Connected account changed. Reconnect with the original deployment wallet.');
  return { provider: fresh, signer };
}
async function getArtifact(name) {
  if (ARTIFACTS[name]) return ARTIFACTS[name];
  let response = await fetch(`./artifacts/${name}.json`, { cache: 'no-store' });
  // On limited hosting plans the web app can update before its generated artifact files.
  // Fallback to the same GitHub-Actions-built public compiler artifact in the repository.
  if (!response.ok) response = await fetch(`https://raw.githubusercontent.com/samertall/flowpilot-omni/main/app/artifacts/${name}.json`, { cache: 'no-store' });
  if (!response.ok) throw Error(`Compiler artifact ${name} unavailable (HTTP ${response.status}); check GitHub Actions and app/artifacts.`);
  const item = await response.json();
  if (!Array.isArray(item.abi) || !/^0x(?:[0-9a-f]{2})+$/i.test(item.bytecode) || item.contractName !== name) throw Error(`Artifact ${name} is invalid or contains unlinked bytecode.`);
  ARTIFACTS[name] = item;
  return item;
}
function argsFor(step) {
  if (step.key === 'relay') return [84532, checkedAddress(state.gate.address), 1301];
  if (step.key === 'vault') return [checkedAddress(state.token.address), PROXY, checkedAddress(state.relay.address)];
  return [];
}
function validated(step, i) {
  const entry = state[step.key];
  if (!entry) return false;
  if (i < 4) return ethers.isAddress(entry.address) && ethers.isHexString(entry.tx, 32);
  return ethers.isHexString(entry.tx, 32);
}
function canRun(i) { return !!account && !pending && (!state[STEPS[i].key]) && (i === 0 || STEPS.slice(0, i).every((step, n) => validated(step, n))); }
function linkFor(step, tx) { return `${CHAINS[step.chain].explorer}/tx/${encodeURIComponent(tx)}`; }
async function handle(i) {
  if (!canRun(i)) throw Error('Complete the previous steps first and connect the deployment wallet.');
  const fundingValue = STEPS[i].key.startsWith('fund') ? $(STEPS[i].key + '-value')?.value : null;
  pending = true; render();
  try {
    const step = STEPS[i];
    const { signer, provider } = await switchChain(step.chain);
    const balance = await provider.getBalance(account);
    if (balance === 0n) throw Error(`Your connected wallet has 0 ${CHAINS[step.chain].symbol} on ${CHAINS[step.chain].name}. Fund it from a testnet faucet first.`);
    message(`Step ${i + 1}/7: confirm the ${CHAINS[step.chain].name} transaction in your wallet…`);
    let contractAddress = null;
    let tx;
    if (step.artifact) {
      const artifact = await getArtifact(step.artifact);
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
      const deployed = await factory.deploy(...argsFor(step));
      tx = deployed.deploymentTransaction();
      if (!tx) throw Error('Deployment transaction was not returned.');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw Error('Deployment transaction reverted.');
      contractAddress = await deployed.getAddress();
      if (!ethers.isAddress(contractAddress) || await provider.getCode(contractAddress) === '0x') throw Error('No deployed code found at the returned address.');
    } else if (step.key === 'route') {
      const relay = new ethers.Contract(checkedAddress(state.relay.address), ['function setDestination(address)'], signer);
      tx = await relay.setDestination(checkedAddress(state.vault.address));
    } else {
      const address = step.key === 'fundRelay' ? SYSTEM : PROXY;
      const target = checkedAddress(step.key === 'fundRelay' ? state.relay.address : state.vault.address);
      const amount = ethers.parseEther(fundingValue || '0');
      if (amount <= 0n || amount > ethers.parseEther('0.1')) throw Error('Funding amount must be greater than 0 and at most 0.1 native testnet token.');
      if (amount >= balance) throw Error('Not enough testnet balance to deposit and cover transaction gas.');
      const service = new ethers.Contract(address, ['function depositTo(address) payable'], signer);
      tx = await service.depositTo(target, { value: amount });
    }
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw Error('Transaction reverted. Nothing is recorded as successful.');
    state[step.key] = { chainId: CHAINS[step.chain].id, tx: receipt.hash, blockNumber: receipt.blockNumber, ...contractAddress ? { address: contractAddress } : {} };
    save(); message(`${step.title} confirmed on ${CHAINS[step.chain].name}: ${shortened(receipt.hash)}`);
  } catch (error) { fail(error); }
  finally { pending = false; render(); }
}
function record() {
  return {
    description: 'FlowPilot wallet-deployed TESTNET contracts, pending end-to-end callback verification',
    createdAt: new Date().toISOString(), deployer: state.account,
    baseSepolia: { chainId: 84532, paymentGate: state.gate?.address || '', deploymentTx: state.gate?.tx || '' },
    lasna: { chainId: 5318007, omniRelay: state.relay?.address || '', deploymentTx: state.relay?.tx || '', setDestinationTx: state.route?.tx || '', feeDepositTx: state.fundRelay?.tx || '' },
    unichainSepolia: { chainId: 1301, mockUSD: state.token?.address || '', mockUSDDeploymentTx: state.token?.tx || '', payoutVault: state.vault?.address || '', vaultDeploymentTx: state.vault?.tx || '', callbackProxy: PROXY, feeDepositTx: state.fundVault?.tx || '' },
  };
}
function render() {
  const container = $('steps'); container.replaceChildren();
  STEPS.forEach((step, i) => {
    const done = validated(step, i);
    const card = document.createElement('section'); card.className = `step ${done ? 'done' : ''}`;
    const count = document.createElement('span'); count.className = 'count'; count.textContent = done ? '✓' : `${i + 1}`;
    const content = document.createElement('div');
    const h2 = document.createElement('h2'); h2.textContent = `${step.title} · ${CHAINS[step.chain].name}`;
    const p = document.createElement('p'); p.textContent = step.description;
    content.append(h2, p);
    if (done) {
      const a = document.createElement('a'); a.href = linkFor(step, state[step.key].tx); a.target = '_blank'; a.rel = 'noopener';
      a.textContent = `✓ ${shortened(state[step.key].tx)} · View explorer`; content.append(a);
      if (state[step.key].address) { const q = document.createElement('p'); q.textContent = `Contract: ${state[step.key].address}`; content.append(q); }
    }
    if (step.key.startsWith('fund') && !done) {
      const field = document.createElement('div'); field.className = 'field';
      const label = document.createElement('label'); label.htmlFor = step.key + '-value'; label.textContent = `Testnet ${CHAINS[step.chain].symbol} to deposit:`;
      const input = document.createElement('input'); input.id = step.key + '-value'; input.type = 'number'; input.min = '0.000001'; input.max = '0.1'; input.step = '0.001'; input.value = step.key === 'fundRelay' ? '0.02' : '0.002';
      field.append(label, input); content.append(field);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'deploy-btn';
    button.textContent = done ? 'Confirmed ✓' : (step.artifact ? 'Deploy contract →' : step.key === 'route' ? 'Set destination →' : 'Confirm deposit →');
    button.disabled = done || !canRun(i);
    button.addEventListener('click', () => handle(i));
    card.append(count, content, button); container.append(card);
  });
  const complete = STEPS.every((s, i) => validated(s, i));
  const hasContracts = STEPS.slice(0, 5).every((s, i) => validated(s, i));
  $('export').disabled = !hasContracts;
  $('copy').disabled = !hasContracts;
  $('launch').style.display = complete ? 'inline-block' : 'none';
  $('summary').textContent = JSON.stringify(record(), null, 2);
  if (complete) {
    localStorage.setItem('flowpilot:contracts', JSON.stringify({ gate: state.gate.address, token: state.token.address, relay: state.relay.address, vault: state.vault.address }));
  }
}
$('connect').addEventListener('click', async () => { try { await connect(); message('Connected. Deploy each contract in order.'); } catch (e) { fail(e); } });
$('export').addEventListener('click', () => {
  const contents = new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(contents); const a = document.createElement('a');
  a.href = url; a.download = 'flowpilot-deployments.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(record(), null, 2)); message('Deployment addresses and transaction hashes copied. No private keys included.'); } catch (e) { fail(e); }
});
window.ethereum?.on?.('accountsChanged', () => { account = null; $('wallet').textContent = 'Wallet account changed. Reconnect.'; render(); });
window.ethereum?.on?.('chainChanged', () => { /* Network is checked before each signed operation. */ });
Promise.all(['PaymentGate', 'MockUSD', 'OmniRelay', 'PayoutVault'].map(getArtifact))
  .then(() => { $('artifact-note').textContent = '✓ Compiler artifacts available. Source contracts compile with Solidity 0.8.29; verify the GitHub Actions build before signing.'; })
  .catch(error => { $('artifact-note').textContent = `Compiler artifacts not ready: ${error.message} Visit the GitHub Actions build or use the CLI deployment path.`; });
render();
