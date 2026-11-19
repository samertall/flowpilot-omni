import { ethers } from 'https://esm.sh/ethers@6.15.0';

// All displayed on-chain states come from contract reads; localStorage is only the user's rule list.
const $ = (id) => document.getElementById(id);
const CHAINS = {
  base: { id: 84532, hex: '0x14a34', name: 'Base Sepolia', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  lasna: { id: 5318007, hex: '0x512577', name: 'Reactive Lasna', rpc: 'https://lasna-rpc.rnk.dev/', explorer: 'https://lasna.reactscan.net' },
  uni: { id: 1301, hex: '0x515', name: 'Unichain Sepolia', rpc: 'https://sepolia.unichain.org', explorer: 'https://sepolia.uniscan.xyz' },
};
const ABI = {
  gate: ['function pay(bytes32 ruleId, address merchant) external payable', 'event PaymentMade(bytes32 indexed ruleId, address indexed payer, address indexed merchant, uint256 amount)'],
  token: ['function faucet() external', 'function claimed(address) view returns(bool)', 'function balanceOf(address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'],
  vault: ['function createRule(bytes32,address,address,uint256,uint256,uint64) external', 'function rules(bytes32) view returns(address sponsor,address merchant,address beneficiary,uint256 payoutAmount,uint256 minSourcePayment,uint64 expiry,uint8 state)', 'event PayoutExecuted(bytes32 indexed ruleId,bytes32 indexed proofId,address indexed beneficiary,address payer,uint256 amount)'],
};
let config = null;
let connectedAccount = null;
let busy = false;
const initialRule = ethers.hexlify(ethers.randomBytes(32));
$('rule-id').value = initialRule;
const SHORT = (address) => address ? `${address.slice(0, 7)}…${address.slice(-5)}` : '—';

function notify(message, isError = false) {
  const box = $('toast'); box.hidden = false; box.textContent = message;
  box.classList.toggle('error', isError);
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { box.hidden = true; }, isError ? 10000 : 6500);
}
function errorMessage(error) {
  return error?.shortMessage || error?.reason || error?.info?.error?.message || error?.message || String(error);
}
function setBusy(value) {
  busy = value;
  ['connect','faucet','create-rule','send-payment','refresh'].forEach(id => { $(id).disabled = value; });
}
function rules() {
  try { const data = JSON.parse(localStorage.getItem('flowpilot:rules') || '[]'); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
function saveRules(list) { localStorage.setItem('flowpilot:rules', JSON.stringify(list)); renderRules(); }
function safeAddress(value, description) {
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw Error(`Enter a valid ${description} address.`);
  return ethers.getAddress(value);
}
function positiveUnits(value, decimals, description) {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw Error(`${description} must be a positive decimal number.`);
  const result = ethers.parseUnits(value.trim(), decimals);
  if (result <= 0n) throw Error(`${description} must be greater than zero.`);
  return result;
}
function loadConfig(loaded) {
  const saved = JSON.parse(localStorage.getItem('flowpilot:contracts') || 'null');
  const values = saved || {
    gate: loaded?.baseSepolia?.paymentGate || '',
    relay: loaded?.lasna?.omniRelay || '',
    vault: loaded?.unichainSepolia?.payoutVault || '',
    token: loaded?.unichainSepolia?.mockUSD || '',
  };
  config = values;
  const ready = ['gate','relay','vault','token'].every(k => ethers.isAddress(values[k]) && values[k] !== ethers.ZeroAddress);
  $('network-status').textContent = ready ? '● Deployment configured' : '● Contracts not configured';
  const notice = $('config-alert');
  notice.classList.toggle('good', ready);
  notice.innerHTML = ready
    ? '<strong>Contracts configured.</strong> Connect a testnet wallet to start. The live callback requires both the Lasna relay and the Unichain vault to be funded for gas.'
    : '<strong>Deployment required.</strong> This interface cannot execute live transactions until contracts are deployed. Open <button class="inline-button" id="open-config" type="button">Settings</button> to enter addresses.';
  $('open-config')?.addEventListener('click', openSettings);
  renderRules();
}
function requireConfig() {
  if (!config || !['gate','relay','vault','token'].every(k => ethers.isAddress(config[k]) && config[k] !== ethers.ZeroAddress)) {
    throw Error('Deploy the contracts, then configure all four addresses in Contract settings.');
  }
}
function requireWallet() {
  if (!window.ethereum) throw Error('Install a browser wallet such as MetaMask to sign testnet transactions.');
  return new ethers.BrowserProvider(window.ethereum);
}
async function connect() {
  const provider = requireWallet();
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  connectedAccount = await signer.getAddress();
  $('connect').textContent = `● ${SHORT(connectedAccount)}`;
  $('beneficiary').value ||= connectedAccount;
  $('merchant').value ||= connectedAccount;
  $('pay-merchant').value ||= $('merchant').value;
  notify(`Connected: ${SHORT(connectedAccount)}. Only use a testnet wallet.`);
  return provider;
}
async function changeChain(key) {
  const provider = requireWallet();
  const chain = CHAINS[key];
  if ((await provider.getNetwork()).chainId === BigInt(chain.id)) return provider;
  try { await provider.send('wallet_switchEthereumChain', [{ chainId: chain.hex }]); }
  catch (error) {
    if (error?.code !== 4902 && error?.info?.error?.code !== 4902) throw error;
    await provider.send('wallet_addEthereumChain', [{ chainId: chain.hex, chainName: chain.name, rpcUrls: [chain.rpc], nativeCurrency: { name: key === 'lasna' ? 'REACT' : 'Ether', symbol: key === 'lasna' ? 'REACT' : 'ETH', decimals: 18 }, blockExplorerUrls: [chain.explorer] }]);
    await provider.send('wallet_switchEthereumChain', [{ chainId: chain.hex }]);
  }
  return new ethers.BrowserProvider(window.ethereum);
}
async function signedContract(key, abi, addr) {
  const provider = await changeChain(key);
  const signer = await provider.getSigner();
  connectedAccount = await signer.getAddress();
  return new ethers.Contract(addr, abi, signer);
}
async function run(operation) {
  if (busy) return;
  setBusy(true);
  try { await operation(); }
  catch (err) { console.error(err); notify(errorMessage(err), true); }
  finally { setBusy(false); }
}
async function getFaucet() {
  requireConfig();
  const token = await signedContract('uni', ABI.token, config.token);
  if (await token.claimed(connectedAccount)) throw Error('This address has already claimed its demo fUSD. You can use the existing tokens.');
  notify('Confirm the fUSD faucet transaction in your wallet.');
  const tx = await token.faucet(); await tx.wait();
  notify(`Demo fUSD received. Check transaction ${SHORT(tx.hash)} on Unichain Sepolia.`);
}
async function createRule() {
  requireConfig();
  const merchant = safeAddress($('merchant').value.trim(), 'merchant');
  const beneficiary = safeAddress($('beneficiary').value.trim(), 'beneficiary');
  const minimum = positiveUnits($('min-eth').value, 18, 'Minimum source payment');
  const payout = positiveUnits($('payout').value, 6, 'Payout');
  const expiry = Math.floor(Date.now() / 1000) + Number($('expiry').value) * 86400;
  const ruleId = $('rule-id').value;
  const token = await signedContract('uni', ABI.token, config.token);
  const balance = await token.balanceOf(connectedAccount);
  if (balance < payout) throw Error(`Insufficient demo fUSD. Claim the faucet first (balance: ${ethers.formatUnits(balance, 6)}).`);
  notify('Step 1/2: Approve your demo fUSD escrow deposit in the wallet.');
  const approval = await token.approve(config.vault, payout); await approval.wait();
  notify('Step 2/2: Confirm your conditional rule and escrow deposit.');
  const vault = await signedContract('uni', ABI.vault, config.vault);
  const tx = await vault.createRule(ruleId, merchant, beneficiary, payout, minimum, expiry);
  await tx.wait();
  const newRecord = { ruleId, merchant, beneficiary, payout: $('payout').value, minimum: $('min-eth').value, expiry, createdTx: tx.hash, createdAt: new Date().toISOString(), sourceTx: null };
  saveRules([newRecord, ...rules().filter(r => r.ruleId !== ruleId)]);
  $('pay-rule').value = ruleId;
  $('pay-merchant').value = merchant;
  $('pay-eth').value = $('min-eth').value;
  $('rule-id').value = ethers.hexlify(ethers.randomBytes(32));
  notify(`Rule created on Unichain! ${SHORT(tx.hash)}. Next send a qualifying payment on Base.`);
}
async function pay() {
  requireConfig();
  const ruleId = $('pay-rule').value.trim();
  if (!ethers.isHexString(ruleId, 32) || ruleId === ethers.ZeroHash) throw Error('Enter a valid 32-byte rule ID.');
  const merchant = safeAddress($('pay-merchant').value.trim(), 'merchant');
  const amount = positiveUnits($('pay-eth').value, 18, 'Source payment');
  const matched = rules().find(r => r.ruleId.toLowerCase() === ruleId.toLowerCase());
  if (matched && (matched.merchant.toLowerCase() !== merchant.toLowerCase() || amount < ethers.parseEther(matched.minimum))) {
    throw Error('Payment details do not match the tracked rule. Use the correct merchant and minimum ETH amount.');
  }
  const gate = await signedContract('base', ABI.gate, config.gate);
  notify('Confirm the REAL Base Sepolia testnet ETH payment in your wallet. This payment goes directly to the merchant.');
  const tx = await gate.pay(ruleId, merchant, { value: amount });
  await tx.wait();
  if (matched) {
    const list = rules().map(r => r.ruleId.toLowerCase() === ruleId.toLowerCase() ? { ...r, sourceTx: tx.hash } : r);
    saveRules(list);
  }
  notify(`Base event confirmed: ${SHORT(tx.hash)}. Omni delivery is asynchronous. Refresh chain status to verify the destination payout.`);
}
async function verifyRules() {
  requireConfig();
  if (!rules().length) { notify('Create a rule first.'); return; }
  // A public read-only RPC is used; it never receives private keys or wallet permissions.
  const provider = new ethers.JsonRpcProvider(CHAINS.uni.rpc, CHAINS.uni.id, { staticNetwork: true });
  const vault = new ethers.Contract(config.vault, ABI.vault, provider);
  const list = await Promise.all(rules().map(async (r) => {
    try { const data = await vault.rules(r.ruleId); return { ...r, onchainState: Number(data.state), lastVerified: new Date().toISOString() }; }
    catch { return { ...r, onchainState: null, lastVerified: null }; }
  }));
  saveRules(list);
  const verified = list.filter(r => r.onchainState !== null).length;
  notify(verified ? `Verified ${verified} of ${list.length} rules on Unichain Sepolia.` : 'Read-only Unichain RPC unavailable; no on-chain status could be verified.', verified === 0);
}
function renderRules() {
  const list = rules();
  $('stat-rules').textContent = String(list.length);
  $('stat-executed').textContent = String(list.filter(r => r.onchainState === 2).length);
  const body = $('rules-body');
  body.replaceChildren();
  if (!list.length) {
    const row = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 5; td.className = 'empty'; td.textContent = 'No rules yet. Create your first automation above.';
    row.append(td); body.append(row); return;
  }
  const states = { 0: ['Not found', 'unknown'], 1: ['Funded · active', 'wait'], 2: ['Paid · verified', ''], 3: ['Refunded', 'unknown'] };
  list.forEach((r) => {
    const state = r.onchainState === null || r.onchainState === undefined ? ['Not verified', 'unknown'] : (states[r.onchainState] || ['Unknown', 'unknown']);
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td'); const strong = document.createElement('div'); strong.className = 'rule-name'; strong.textContent = 'Conditional payout';
    const subtitle = document.createElement('span'); subtitle.className = 'rule-sub'; subtitle.textContent = `To ${SHORT(r.beneficiary)}`; nameTd.append(strong, subtitle);
    const ruleTd = document.createElement('td');
    const ruleButton = document.createElement('button'); ruleButton.className = 'inline-button'; ruleButton.textContent = SHORT(r.ruleId); ruleButton.title = 'Copy full rule ID';
    ruleButton.addEventListener('click', async () => { await navigator.clipboard.writeText(r.ruleId); notify('Rule ID copied.'); }); ruleTd.append(ruleButton);
    const payoutTd = document.createElement('td'); payoutTd.textContent = `${r.payout} fUSD`;
    const statusTd = document.createElement('td'); const status = document.createElement('span'); status.className = `chip ${state[1]}`; status.textContent = state[0]; statusTd.append(status);
    const txTd = document.createElement('td');
    if (r.sourceTx && ethers.isHexString(r.sourceTx, 32)) { const link = document.createElement('a'); link.href = `${CHAINS.base.explorer}/tx/${r.sourceTx}`; link.target = '_blank'; link.rel = 'noopener'; link.className = 'hash-link'; link.textContent = `${SHORT(r.sourceTx)} ↗`; txTd.append(link); }
    else { txTd.textContent = 'Not sent'; }
    tr.append(nameTd, ruleTd, payoutTd, statusTd, txTd); body.append(tr);
  });
}
function openSettings() {
  ['gate','relay','vault','token'].forEach(key => { $(`cfg-${key}`).value = config?.[key] || ''; });
  $('settings').showModal();
}
$('settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const updated = {};
  for (const key of ['gate','relay','vault','token']) {
    const value = $(`cfg-${key}`).value.trim();
    if (value && !ethers.isAddress(value)) { notify(`Invalid ${key} contract address.`, true); return; }
    updated[key] = value;
  }
  localStorage.setItem('flowpilot:contracts', JSON.stringify(updated));
  loadConfig(null); $('settings').close(); notify('Addresses saved locally. Confirm deployment transactions before transferring testnet funds.');
});
$('connect').addEventListener('click', () => run(connect));
$('faucet').addEventListener('click', () => run(getFaucet));
$('create-rule').addEventListener('click', () => run(createRule));
$('send-payment').addEventListener('click', () => run(pay));
$('refresh').addEventListener('click', () => run(verifyRules));
$('open-config-footer').addEventListener('click', openSettings);
window.ethereum?.on?.('accountsChanged', () => { connectedAccount = null; $('connect').textContent = '↗ Connect wallet'; notify('Wallet account changed. Reconnect to continue.'); });
window.ethereum?.on?.('chainChanged', () => { /* Network selection is handled before every signed operation. */ });
fetch('./deployments.json').then(r => r.ok ? r.json() : {}).then(loadConfig).catch(() => loadConfig({}));
