#!/usr/bin/env node
/**
 * FlowPilot real-chain proof checker.
 * Never uses a private key; requires three actual on-chain transaction hashes.
 * Usage: node scripts/verify-evidence.mjs --origin 0x... --reactive 0x... --callback 0x...
 * npm install (ethers 6.15.0) before running.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AbiCoder, Contract, Interface, JsonRpcProvider, getAddress, isHexString,
  keccak256, formatEther, formatUnits
} from 'ethers';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, 'deployments', 'lasna.json');
const fail = message => { throw Error(`PROOF NOT VERIFIED: ${message}`); };
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, arr) => {
  if (arg.startsWith('--') && !arg.includes('=')) out.push([arg.slice(2), arr[i + 1] ?? '']);
  return out;
}, []));

function readDotEnv() {
  const dest = resolve(root, '.env');
  const vars = {};
  if (!existsSync(dest)) return vars;
  for (const line of readFileSync(dest, 'utf8').split(/\r?\n/)) {
    const found = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.+)?\s*$/);
    if (found) vars[found[1]] = (found[2] || '').replace(/^['"]|['"]$/g, '').trim();
  }
  return vars;
}

async function check() {
  if (!existsSync(configPath)) fail('Missing deployments/lasna.json. Deploy and record addresses first.');
  const deployments = JSON.parse(readFileSync(configPath, 'utf8'));
  const env = { ...readDotEnv(), ...process.env };
  const hashes = { origin: args.origin || env.ORIGIN_TX, reactive: args.reactive || env.REACTIVE_TX, callback: args.callback || env.CALLBACK_TX };
  for (const [key, hash] of Object.entries(hashes)) if (!isHexString(hash, 32)) fail(`Missing/invalid --${key} transaction hash (must be real 32-byte hash)`);
  const { baseSepolia, unichainSepolia, lasna } = deployments;
  const addresses = {
    gate: getAddress(baseSepolia.paymentGate),
    relay: getAddress(lasna.omniRelay),
    vault: getAddress(unichainSepolia.payoutVault),
    token: getAddress(unichainSepolia.mockUSD),
    proxy: getAddress(unichainSepolia.callbackProxy)
  };
  if ([addresses.gate,addresses.relay,addresses.vault,addresses.token,addresses.proxy].some(a => a === '0x0000000000000000000000000000000000000000')) fail('One or more deployment addresses are zero');
  const base = new JsonRpcProvider(env.BASE_RPC_URL || 'https://sepolia.base.org', 84532, { staticNetwork: true });
  const lasnaProvider = new JsonRpcProvider(env.LASNA_RPC_URL || 'https://lasna-rpc.rnk.dev/', 5318007, { staticNetwork: true });
  const uni = new JsonRpcProvider(env.UNI_RPC_URL || 'https://sepolia.unichain.org', 1301, { staticNetwork: true });
  const [a,b,c] = await Promise.all([base.send('eth_chainId',[]),lasnaProvider.send('eth_chainId',[]),uni.send('eth_chainId',[])]);
  if (BigInt(a) !== 84532n || BigInt(b) !== 5318007n || BigInt(c) !== 1301n) fail('RPC endpoint reports the wrong network');
  const [origin, reactive, callback] = await Promise.all([
    base.getTransactionReceipt(hashes.origin),
    lasnaProvider.getTransactionReceipt(hashes.reactive),
    uni.getTransactionReceipt(hashes.callback)
  ]);
  for (const [label, receipt] of Object.entries({origin,reactive,callback})) {
    if (!receipt) fail(`${label} transaction receipt does not exist on expected network`);
    if (receipt.status !== 1) fail(`${label} transaction reverted`);
  }
  const gate = new Interface(['event PaymentMade(bytes32 indexed ruleId,address indexed payer,address indexed merchant,uint256 amount)']);
  const relay = new Interface(['event RelayRequested(bytes32 indexed ruleId,bytes32 indexed proofId,address payer,address merchant,uint256 amount)']);
  const sys = new Interface(['event CallbackRequest(uint256 indexed chainId,address indexed sender,address indexed recipient,uint8 version,bytes configuration)']);
  const vault = new Interface(['event PayoutExecuted(bytes32 indexed ruleId,bytes32 indexed proofId,address indexed beneficiary,address payer,uint256 amount)',
    'function rules(bytes32) view returns(address sponsor,address merchant,address beneficiary,uint256 payoutAmount,uint256 minSourcePayment,uint64 expiry,uint8 state)',
    'function _CALLBACK_SENDER() view returns (address)']);
  function decode(receipt, address, iface, name) {
    return receipt.logs.filter(l => l.address.toLowerCase() === address.toLowerCase()).flatMap(l => {
      try { const p = iface.parseLog(l); return p?.name === name ? [{ log:l, args:p.args }] : []; }
      catch { return []; }
    });
  }
  const payments = decode(origin,addresses.gate,gate,'PaymentMade');
  if (payments.length !== 1) fail(`Expected exactly one PaymentMade log, got ${payments.length}`);
  const payment = payments[0];
  if (payment.args.ruleId === '0x' + '00'.repeat(32) || payment.args.amount <= 0n) fail('Source event has invalid ruleId or amount');
  const proofId = keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address','uint256','uint256'], [84532n, addresses.gate, BigInt(origin.hash), BigInt(payment.log.index)]));
  const relays = decode(reactive,addresses.relay,relay,'RelayRequested');
  const matching = relays.filter(x => x.args.ruleId.toLowerCase() === payment.args.ruleId.toLowerCase() &&
    x.args.proofId.toLowerCase() === proofId.toLowerCase() &&
    x.args.payer.toLowerCase() === payment.args.payer.toLowerCase() &&
    x.args.merchant.toLowerCase() === payment.args.merchant.toLowerCase() &&
    x.args.amount === payment.args.amount);
  if (matching.length !== 1) fail('No matching Lasna RelayRequested event for this payment and computed proofId');
  const systemRequests = decode(reactive,'0x8888888888888888888888888888888888888888',sys,'CallbackRequest');
  const suitableRequests = systemRequests.filter(x => x.args.chainId === 1301n &&
    x.args.sender.toLowerCase() === addresses.relay.toLowerCase() &&
    x.args.recipient.toLowerCase() === addresses.vault.toLowerCase());
  if (suitableRequests.length < 1) fail('No matching Lasna system CallbackRequest event');
  const callbackInterface = new Interface(['function executePayout(address reactiveSender,bytes32 ruleId,address payer,address merchant,uint256 amount,bytes32 proofId)']);
  const matchedRequest = suitableRequests.find(x => {
    try {
      const decoded = AbiCoder.defaultAbiCoder().decode(['tuple(uint256 chainId,address recipient,uint64 gasLimit,bytes payload)'],x.args.configuration)[0];
      const payload = callbackInterface.parseTransaction({ data: decoded.payload });
      return decoded.chainId === 1301n &&
        decoded.recipient.toLowerCase() === addresses.vault.toLowerCase() &&
        payload.name === 'executePayout' &&
        payload.args.reactiveSender === '0x0000000000000000000000000000000000000000' &&
        payload.args.ruleId.toLowerCase() === payment.args.ruleId.toLowerCase() &&
        payload.args.payer.toLowerCase() === payment.args.payer.toLowerCase() &&
        payload.args.merchant.toLowerCase() === payment.args.merchant.toLowerCase() &&
        payload.args.amount === payment.args.amount &&
        payload.args.proofId.toLowerCase() === proofId.toLowerCase();
    } catch { return false; }
  });
  if (!matchedRequest) fail('Lasna CallbackRequest payload does not match expected authenticated payout call');
  const payouts = decode(callback,addresses.vault,vault,'PayoutExecuted');
  const matched = payouts.filter(x => x.args.ruleId.toLowerCase() === payment.args.ruleId.toLowerCase() &&
    x.args.proofId.toLowerCase() === proofId.toLowerCase() &&
    x.args.payer.toLowerCase() === payment.args.payer.toLowerCase());
  if (matched.length !== 1) fail('No matching Unichain PayoutExecuted event for this source payment/proof');
  const contract = new Contract(addresses.vault,vault,uni);
  const [rule, sender] = await Promise.all([contract.rules(payment.args.ruleId),contract._CALLBACK_SENDER()]);
  if (sender.toLowerCase() !== addresses.relay.toLowerCase()) fail('Vault callback sender mismatch');
  if (Number(rule.state) !== 2) fail('Vault on-chain state is not PAID');
  if (rule.merchant.toLowerCase() !== payment.args.merchant.toLowerCase()) fail('Merchant mismatch with escrowed rule');
  if (payment.args.amount < rule.minSourcePayment) fail('Payment below rule threshold');
  if (matched[0].args.beneficiary.toLowerCase() !== rule.beneficiary.toLowerCase() || matched[0].args.amount !== rule.payoutAmount) fail('Beneficiary or escrow payout amount mismatch');
  const [originBlock, destBlock] = await Promise.all([base.getBlock(origin.blockNumber),uni.getBlock(callback.blockNumber)]);
  const delta = originBlock && destBlock ? destBlock.timestamp - originBlock.timestamp : null;
  const result = {
    status:'VERIFIED_BY_READ_ONLY_RPC', verifiedAt:new Date().toISOString(),
    warning:'Proof of observed chain logs and state, not a security audit. Independently verify explorer receipts.',
    track:'Set It and Forget It', title:'FlowPilot — Autonomous Cross-Chain Automations',
    contracts:addresses, chainIds:{origin:84532,reactive:5318007,destination:1301},
    ruleId:payment.args.ruleId, proofId,
    payer:payment.args.payer,merchant:payment.args.merchant,beneficiary:rule.beneficiary,
    sourcePaymentETH:formatEther(payment.args.amount), escrowPayoutFUSD:formatUnits(rule.payoutAmount,6),
    transactions:{
      origin:{hash:origin.hash,block:origin.blockNumber,logIndex:payment.log.index,explorer:`https://sepolia.basescan.org/tx/${origin.hash}`},
      reactive:{hash:reactive.hash,block:reactive.blockNumber,explorer:`https://lasna-omni.reactscan.net/tx/${reactive.hash}`},
      callback:{hash:callback.hash,block:callback.blockNumber,explorer:`https://sepolia.uniscan.xyz/tx/${callback.hash}`}
    },
    originToCallbackBlockTimestampSeconds:delta !== null && delta>=0 ? delta : null
  };
  const dir = resolve(root,'docs'); mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'VERIFIED_EVIDENCE.json'),JSON.stringify(result,null,2)+'\n');
  writeFileSync(resolve(dir,'VERIFIED_EVIDENCE.md'),`# FlowPilot — Verified Transaction Chain\n\n`+
    `Read-only RPC verification completed ${result.verifiedAt}.\n\n`+
    `- **Origin transaction (Base Sepolia):** ${result.transactions.origin.explorer}\n`+
    `- **Reactive transaction (Lasna):** ${result.transactions.reactive.explorer}\n`+
    `- **Destination callback (Unichain Sepolia):** ${result.transactions.callback.explorer}\n`+
    `- **Rule ID:** \`${result.ruleId}\`\n`+
    `- **Computed event proof:** \`${result.proofId}\`\n`+
    `- **Origin payment:** ${result.sourcePaymentETH} testnet ETH\n`+
    `- **Released escrow:** ${result.escrowPayoutFUSD} faucet-only fUSD\n`+
    (result.originToCallbackBlockTimestampSeconds===null ? '' : `- **Cross-chain receipt timestamp difference:** ${result.originToCallbackBlockTimestampSeconds}s (does not isolate Reactive block processing latency)\n`)+
    `\nThis is a testnet proof, not a security audit or a token bridge.\n`);
  console.log('VERIFIED: All three transactions, event IDs, payout fields, system CallbackRequest and on-chain rule state match.');
  console.log(JSON.stringify(result,null,2));
}
check().catch(e => { console.error(e.message); process.exitCode=1; });
