#!/usr/bin/env node
/**
 * GitHub Actions-only, testnet-only deployment and evidence orchestration.
 * Never prints/records private keys. Every write requires an explicit workflow_dispatch approval.
 * All outputs are public chain addresses/receipts, safe to publish with the repository.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Wallet, Contract, ContractFactory, JsonRpcProvider, Interface, AbiCoder,
  parseEther, formatEther, parseUnits, formatUnits, randomBytes, hexlify,
  keccak256, getAddress, isHexString, ZeroAddress
} from 'ethers';

const root = resolve(import.meta.dirname, '..');
const phase = process.argv[2];
const supported = ['preflight', 'faucet', 'deploy', 'demo', 'verify', 'diagnose'];
if (!supported.includes(phase)) throw Error(`Unknown phase: ${phase}; choose ${supported.join(', ')}`);
const ADDRS = {
  system: '0x8888888888888888888888888888888888888888',
  proxy: '0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4',
};
const NETWORKS = {
  base: { id: 84532, symbol: 'ETH', url: process.env.BASE_RPC_URL || 'https://sepolia.base.org' },
  lasna: { id: 5318007, symbol: 'lREACT', url: process.env.LASNA_RPC_URL || 'https://lasna-rpc.rnk.dev/' },
  uni: { id: 1301, symbol: 'ETH', url: process.env.UNI_RPC_URL || 'https://sepolia.unichain.org' },
};
const outPath = resolve(root, 'deployments', 'lasna.json');
const evidencePath = resolve(root, 'docs', 'CLOUD_EVIDENCE.json');
const draftPath = resolve(root, 'deployments', 'CLOUD_DEPLOY_PROGRESS.json');
const sleep = ms => new Promise(done => setTimeout(done, ms));
const json = (path, obj) => { mkdirSync(resolve(path, '..'), {recursive:true}); writeFileSync(path, JSON.stringify(obj, null, 2) + '\n'); };
const envKey = process.env.FLOWPILOT_TESTNET_PRIVATE_KEY || '';
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(envKey)) throw Error('FLOWPILOT_TESTNET_PRIVATE_KEY is not configured. Add a NEW testnet-only key as a GitHub repository Actions secret (never in chat or code).');
if (process.env.GITHUB_ACTIONS !== 'true' && process.env.ALLOW_LOCAL_TESTNET !== 'yes') throw Error('Cloud runner is restricted to GitHub Actions unless ALLOW_LOCAL_TESTNET=yes is set deliberately.');
const key = envKey.startsWith('0x') ? envKey : `0x${envKey}`;
const providers = Object.fromEntries(Object.entries(NETWORKS).map(([k,net]) => [k,new JsonRpcProvider(net.url)]));
const signers = Object.fromEntries(Object.entries(providers).map(([k,p]) => [k,new Wallet(key,p)]));
const account = signers.base.address;
const readArtifact = name => {
  const file = resolve(root, 'out', `${name}.sol`, `${name}.json`);
  if (!existsSync(file)) throw Error(`Missing ${file}. Run forge build first.`);
  const a = JSON.parse(readFileSync(file,'utf8'));
  const creationCode = a.bytecode?.object;
  if (!/^0x[0-9a-fA-F]+$/.test(creationCode || '')) throw Error(`Invalid creation bytecode for ${name}`);
  return {abi:a.abi, bytecode:creationCode};
};
const getDeployment = () => {
  if (!existsSync(outPath)) throw Error('No recorded live deployment. Run phase deploy and allow GitHub to commit deployments/lasna.json first.');
  const d = JSON.parse(readFileSync(outPath,'utf8'));
  const fields = [d.baseSepolia?.paymentGate,d.lasna?.omniRelay,d.unichainSepolia?.mockUSD,d.unichainSepolia?.payoutVault];
  for(const a of fields) if(!a || getAddress(a) === ZeroAddress) throw Error('Invalid deployment address in deployments/lasna.json');
  if (getAddress(d.unichainSepolia.callbackProxy) !== getAddress(ADDRS.proxy)) throw Error('Destination callback proxy does not match official documented testnet address');
  return d;
};
const explorer = {
  base: hash => `https://sepolia.basescan.org/tx/${hash}`,
  lasna: hash => `https://lasna-omni.reactscan.net/tx/${hash}`,
  uni: hash => `https://sepolia.uniscan.xyz/tx/${hash}`,
};
// Bound each preflight network request: a slow RPC must not stall GitHub Actions.
async function readRpc(chain, method, params = [], timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(NETWORKS[chain].url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error || payload.result == null) throw Error(JSON.stringify(payload.error || 'Empty JSON-RPC result'));
    return payload.result;
  } catch (err) {
    throw Error(`Read-only RPC check failed on ${chain} for ${method}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
async function safeNetworks() {
  for (const [name,net] of Object.entries(NETWORKS)) {
    const reported = BigInt(await readRpc(name, 'eth_chainId'));
    if (reported !== BigInt(net.id)) throw Error(`Unsafe RPC ${name}: expected chain ${net.id}, got ${reported}. No transaction sent.`);
  }
}
async function receipt(tx, chain) {
  console.log(`[${chain}] sent ${tx.hash}`);
  const rec = await tx.wait(1, 180000);
  if (!rec || rec.status !== 1) throw Error(`[${chain}] transaction failed or timed out: ${tx.hash}`);
  return rec;
}
const atom = (label, a) => { console.log(`${label} ${a}`); return a; };
async function checkFunds(verbose=true) {
  const out = {};
  for(const [chain,net] of Object.entries(NETWORKS)) {
    out[chain] = BigInt(await readRpc(chain, 'eth_getBalance', [account, 'latest']));
    if(verbose) console.log(`${net.symbol} on ${chain} (${net.id}): ${formatEther(out[chain])}`);
  }
  return out;
}
async function preflight() {
  console.log(`TESTNET PUBLIC ADDRESS (safe to share): ${account}`);
  await safeNetworks();
  const balances = await checkFunds();
  const summary = { account, utc: new Date().toISOString(), networks: Object.fromEntries(Object.entries(NETWORKS).map(([key,net]) => [key,{chainId:net.id,symbol:net.symbol,balance:formatEther(balances[key])}])) };
  json(resolve(root,'docs','CLOUD_PREFLIGHT.json'),summary);
  console.log('Funds are TESTNET ONLY. Base Sepolia ETH, Lasna lREACT and Unichain Sepolia ETH are needed for a complete run.');
}
async function faucet() {
  if (process.env.CONFIRM_TESTNET_BROADCAST !== 'yes') throw Error('Faucet requires confirm_testnet_broadcast=yes');
  await safeNetworks();
  const before=await checkFunds();
  const amount=parseEther('0.0018');
  if(before.base < parseEther('0.0049'))throw Error('Need at least 0.0049 Base Sepolia TESTNET ETH to request 0.18 lREACT and leave deployment gas.');
  console.log(`Requesting testnet lREACT from official Base Sepolia faucet for ${account}; amount ${formatEther(amount)} TESTNET ETH.`);
  const faucet=new Contract('0x2afaFD298b23b62760711756088F75B7409f5967', ['function request(address) external payable'], signers.base);
  const rec=await receipt(await faucet.request(account,{value:amount}),'base');
  const state={status:'FAUCET_REQUEST_CONFIRMED_LASNA_DELIVERY_PENDING',deployer:account,sourceTxHash:rec.hash,explorer:explorer.base(rec.hash),testnetETHSent:formatEther(amount),lasnaBalanceBefore:formatEther(before.lasna),requestedAt:new Date().toISOString()};
  const file=resolve(root,'docs','CLOUD_FAUCET.json');
  json(file,state);
  for(let i=0;i<20;i++){
    await sleep(15000);
    const balance=await providers.lasna.getBalance(account);
    if(balance>before.lasna){state.status='LASNA_FAUCET_RECEIVED';state.lasnaBalanceAfter=formatEther(balance);state.receivedAt=new Date().toISOString();json(file,state);console.log(`Lasna lREACT received: ${state.lasnaBalanceAfter}`);return;}
  }
  throw Error('Faucet tx confirmed on Base but Lasna delivery not observed within five minutes. Do NOT repeat request without checking explorer/funding first.');
}
async function diagnose() {
  // Read-only: simulate the exact Lasna constructor deployment; never broadcast or sign.
  await safeNetworks();
  const p=JSON.parse(readFileSync(draftPath,'utf8'));
  if(getAddress(p.deployer)!==getAddress(account))throw Error('Wallet does not match saved partial deployment.');
  const origin=p.steps?.PaymentGate?.address;
  if(!origin)throw Error('Saved PaymentGate address required.');
  const {abi,bytecode}=readArtifact('OmniRelay');
  const tx=await new ContractFactory(abi,bytecode,signers.lasna).getDeployTransaction(84532,origin,1301);
  const out={address:account,lasnaChainId:5318007,origin,createdAt:new Date().toISOString()};
  for(const [key,method,params] of [
    ['gasPrice','eth_gasPrice',[]],
    ['nativeBalance','eth_getBalance',[account,'latest']],
    ['nonce','eth_getTransactionCount',[account,'pending']],
    ['latestBlock','eth_blockNumber',[]]
  ]){
    try{out[key]=await readRpc('lasna',method,params);}catch(e){out[key+'Error']=e.message;}
  }
  try{
    out.estimatedGas=await readRpc('lasna','eth_estimateGas',[{from:account,data:tx.data,value:'0x0'}],25000);
    out.status='ESTIMATE_GAS_OK_NO_TX_SENT';
    console.log('LASNA DEPLOY DRY RUN gas:',out.estimatedGas);
  }catch(e){
    out.status='ESTIMATE_GAS_REJECTED_NO_TX_SENT';
    out.estimateError=e.message;
    console.error('LASNA DEPLOY DRY RUN ERROR:',e.message);
  }
  json(resolve(root,'docs','CLOUD_LASNA_DIAGNOSIS.json'),out);
  console.log('Lasna RPC diagnosis:',JSON.stringify(out));
  if(out.status!=='ESTIMATE_GAS_OK_NO_TX_SENT')throw Error('Lasna read-only deployment simulation failed; no transactions were sent');
}
async function deploy() {
  if(process.env.CONFIRM_TESTNET_BROADCAST !== 'yes') throw Error('Deployment requires workflow input confirm_testnet_broadcast=yes');
  await safeNetworks();
  if(existsSync(outPath)) throw Error('Existing deployment is already committed; refusing to deploy another set. Use demo or verify.');
  console.log(`Testnet-only deployment wallet: ${account}`);
  const balances = await checkFunds();
  if(balances.base < parseEther('0.003')) throw Error('Insufficient Base Sepolia ETH for deployment and demo. Fund testnet wallet via a faucet first.');
  if(balances.uni < parseEther('0.006')) throw Error('Insufficient Unichain Sepolia test ETH to deploy contracts, fund proxy and create rule.');
  if(balances.lasna < parseEther('0.15')) throw Error('Insufficient Lasna testnet lREACT. Fund from official Reactive test faucet first.');
  const depositRelay=parseEther('0.06');
  const depositVault=parseEther('0.003');
  const progress = existsSync(draftPath)
    ? JSON.parse(readFileSync(draftPath, 'utf8'))
    : {status:'IN_PROGRESS_NOT_VERIFIED',deployer:account,startedAt:new Date().toISOString(),steps:{}};
  if(getAddress(progress.deployer)!==getAddress(account))throw Error('Partial deployment was created by a different wallet; will not reuse.');
  if(progress.status==='DEPLOYED_AND_FUNDED_DEMO_NOT_VERIFIED')throw Error('Partial progress already marked completed; inspect deployment artifact instead.');
  for(const step of Object.values(progress.steps||{})){
    if(!['base','uni','lasna'].includes(step.chain)) throw Error('Invalid partial-deployment chain');
    const r=await providers[step.chain].getTransactionReceipt(step.txHash);
    if(!r||r.status!==1) throw Error('Stored partial deployment transaction not confirmed: '+step.txHash);
  }
  console.log('Resuming saved deployment; verified steps:',Object.keys(progress.steps||{}).join(', ')||'none');
  const saveStep=(name,chain,address,tx)=>{
    progress.steps[name]={chain,address,txHash:tx.hash,explorer:explorer[chain](tx.hash),block:tx.blockNumber};
    json(draftPath,progress);
    console.log(`[${chain}] ${name} address ${address}, tx ${tx.hash}`);
  };
  const deployContract=async(name,chain,args=[])=>{
    const {abi,bytecode}=readArtifact(name);
    const previous=progress.steps[name];
    if(previous){
      if(previous.chain!==chain)throw Error('Saved chain mismatch: '+name);
      const r=await providers[chain].getTransactionReceipt(previous.txHash);
      if(!r||r.status!==1||getAddress(r.contractAddress||ZeroAddress)!==getAddress(previous.address))
        throw Error('Saved deployment receipt mismatch: '+name);
      if((await providers[chain].getCode(previous.address))==='0x')throw Error('Saved contract is missing on chain: '+name);
      console.log('[RESUME] Reusing deployed '+name+' at '+previous.address);
      return new Contract(previous.address,abi,signers[chain]);
    }
    const instance=await new ContractFactory(abi,bytecode,signers[chain]).deploy(...args);
    const dep=instance.deploymentTransaction();
    if(!dep)throw Error('No deployment transaction for '+name);
    const record=await receipt(dep,chain);
    const address=await instance.getAddress();
    if((await providers[chain].getCode(address))==='0x')throw Error('No runtime contract code for '+name);
    saveStep(name,chain,address,record);
    return instance;
  };
  const once=async(name,chain,address,fn)=>{
    const previous=progress.steps[name];
    if(previous){
      if(previous.chain!==chain)throw Error('Saved step chain mismatch: '+name);
      const r=await providers[chain].getTransactionReceipt(previous.txHash);
      if(!r||r.status!==1)throw Error('Saved step failed verification: '+name);
      console.log('[RESUME] Reusing confirmed step '+name+' '+previous.txHash);
      return r;
    }
    const r=await receipt(await fn(),chain);
    saveStep(name,chain,address,r);
    return r;
  };
  const gate=await deployContract('PaymentGate','base');
  const token=await deployContract('MockUSD','uni');
  const relay=await deployContract('OmniRelay','lasna',[84532, await gate.getAddress(),1301]);
  const vault=await deployContract('PayoutVault','uni',[await token.getAddress(),ADDRS.proxy,await relay.getAddress()]);
  const setTx=await once('setDestination','lasna',await relay.getAddress(),async()=>relay.setDestination(await vault.getAddress()));
  // Required by official Reactive Network accounting model: system / proxy deposits.
  const depositAbi=['function depositTo(address) external payable'];
  const sys=new Contract(ADDRS.system,depositAbi,signers.lasna);
  const proxy=new Contract(ADDRS.proxy,depositAbi,signers.uni);
  const relayFund=await once('fundRelay','lasna',ADDRS.system,async()=>sys.depositTo(await relay.getAddress(),{value:depositRelay}));
  const proxyFund=await once('fundProxy','uni',ADDRS.proxy,async()=>proxy.depositTo(await vault.getAddress(),{value:depositVault}));
  const output={network:'Reactive Lasna Omni testnet',chainId:5318007,deployer:account,
    baseSepolia:{chainId:84532,paymentGate:await gate.getAddress(),deploymentTx:progress.steps.PaymentGate.txHash},
    unichainSepolia:{chainId:1301,mockUSD:await token.getAddress(),mockUSDDeploymentTx:progress.steps.MockUSD.txHash,payoutVault:await vault.getAddress(),vaultDeploymentTx:progress.steps.PayoutVault.txHash,callbackProxy:ADDRS.proxy},
    lasna:{chainId:5318007,omniRelay:await relay.getAddress(),deploymentTx:progress.steps.OmniRelay.txHash,setDestinationTx:setTx.hash,systemDepositTx:relayFund.hash},
    callbackProxyDepositTx:proxyFund.hash, cloudDeploymentConfirmedAt:new Date().toISOString()};
  json(outPath,output);json(resolve(root,'app','deployments.json'),output);
  progress.status='DEPLOYED_AND_FUNDED_DEMO_NOT_VERIFIED';progress.completedAt=new Date().toISOString();json(draftPath,progress);
  console.log('CONTRACTS DEPLOYED AND TESTNET ACCOUNTING FUNDED. This is not proof of a callback.');
}
const tokenAbi=['function faucet()','function approve(address,uint256) returns(bool)','function claimed(address) view returns(bool)','function balanceOf(address) view returns(uint256)'];
const vaultAbi=['function createRule(bytes32,address,address,uint256,uint256,uint64)','function rules(bytes32) view returns(address sponsor,address merchant,address beneficiary,uint256 payoutAmount,uint256 minSourcePayment,uint64 expiry,uint8 state)','event PayoutExecuted(bytes32 indexed ruleId,bytes32 indexed proofId,address indexed beneficiary,address payer,uint256 amount)'];
const gateAbi=['function pay(bytes32,address) payable','event PaymentMade(bytes32 indexed ruleId,address indexed payer,address indexed merchant,uint256 amount)'];
const relayAbi=['event RelayRequested(bytes32 indexed ruleId,bytes32 indexed proofId,address payer,address merchant,uint256 amount)'];
async function queryInRange(provider,address,topics,from,to) {
  const logs=[];
  for(let i=from;i<=to;i+=750){
    logs.push(...await provider.getLogs({address,topics,fromBlock:i,toBlock:Math.min(to,i+749)}));
  }
  return logs;
}
async function findProof(d,e) {
  const relayInt=new Interface(relayAbi);
  const vaultInt=new Interface(vaultAbi);
  const relayAddress=d.lasna.omniRelay, vaultAddress=d.unichainSepolia.payoutVault;
  const relayTopic=relayInt.getEvent('RelayRequested').topicHash;
  const payTopic=vaultInt.getEvent('PayoutExecuted').topicHash;
  const ruleTopic=e.ruleId;
  const proof=e.proofId.toLowerCase();
  let start=Date.now();
  while(Date.now()-start < (Number(process.env.CLOUD_PROOF_TIMEOUT_SECONDS||'480')*1000)) {
    const [lasnaEnd,uniEnd]=await Promise.all([providers.lasna.getBlockNumber(),providers.uni.getBlockNumber()]);
    const [relays,payments]=await Promise.all([
      queryInRange(providers.lasna,relayAddress,[relayTopic,ruleTopic],Math.max(0,e.lasnaStartBlock-3),lasnaEnd),
      queryInRange(providers.uni,vaultAddress,[payTopic,ruleTopic],Math.max(0,e.uniStartBlock-3),uniEnd)
    ]);
    const relay=relays.find(l=>relayInt.parseLog(l)?.args.proofId.toLowerCase()===proof);
    const payment=payments.find(l=>vaultInt.parseLog(l)?.args.proofId.toLowerCase()===proof);
    if(relay){e.transactions.reactive={hash:relay.transactionHash,explorer:explorer.lasna(relay.transactionHash)};}
    if(payment){e.transactions.callback={hash:payment.transactionHash,explorer:explorer.uni(payment.transactionHash)};}
    if(relay&&payment){
      const [rr,rc,tx]=await Promise.all([
        providers.lasna.getTransactionReceipt(relay.transactionHash),
        providers.uni.getTransactionReceipt(payment.transactionHash),
        providers.uni.getTransaction(payment.transactionHash)
      ]);
      if(rr?.status !== 1 || rc?.status !== 1)throw Error('Reactive or callback transaction reverted');
      if(getAddress(tx.to) !== getAddress(ADDRS.proxy))throw Error('Callback was NOT sent through official Unichain callback proxy');
      const readVault=new Contract(vaultAddress,vaultAbi,providers.uni);
      const rule=await readVault.rules(e.ruleId);
      if(Number(rule.state)!==2)throw Error('Callback appeared but rule is not in PAID state');
      if(getAddress(rule.beneficiary)!==getAddress(e.beneficiary))throw Error('Callback beneficiary mismatch');
      e.status='VERIFIED_THREE_CHAIN_PAYMENT_CALLBACK';
      e.verifiedAt=new Date().toISOString();
      json(evidencePath,e);
      console.log(`VERIFIED origin: ${e.transactions.origin.hash}`);
      console.log(`VERIFIED reactive: ${e.transactions.reactive.hash}`);
      console.log(`VERIFIED callback: ${e.transactions.callback.hash}`);
      return;
    }
    json(evidencePath,e);
    console.log(`Waiting for Omni delivery: Lasna ${relay?'YES':'no'}; Unichain callback ${payment?'YES':'no'}`);
    await sleep(15000);
  }
  e.status='PENDING_UNVERIFIED_CALLBACK'; e.lastCheckedAt=new Date().toISOString();json(evidencePath,e);
  throw Error('Timed out waiting for a confirmed relay + authenticated callback; hashes captured so far are saved. Rerun verify to continue without repeating the payment.');
}
async function demo() {
  if(process.env.CONFIRM_TESTNET_BROADCAST !== 'yes')throw Error('Demo requires workflow input confirm_testnet_broadcast=yes');
  await safeNetworks();
  const d=getDeployment();
  if(getAddress(d.deployer)!==getAddress(account)) throw Error('The testnet signer differs from the deployment owner.');
  if(existsSync(evidencePath))throw Error('Existing demo evidence found. Use verify instead; refusing another payment.');
  const token=new Contract(d.unichainSepolia.mockUSD,tokenAbi,signers.uni);
  const vault=new Contract(d.unichainSepolia.payoutVault,vaultAbi,signers.uni);
  const gate=new Contract(d.baseSepolia.paymentGate,gateAbi,signers.base);
  console.log(`Demo testnet wallet ${account}`);
  if(!(await token.claimed(account))){const r=await receipt(await token.faucet(),'uni'); console.log(`Faucet test tokens minted: ${r.hash}`);}
  const payout=parseUnits('25',6), payment=parseEther('0.00005');
  if((await token.balanceOf(account))<payout)throw Error('Insufficient faucet demo fUSD');
  const ruleId=hexlify(randomBytes(32));
  const expiry=BigInt(Math.floor(Date.now()/1000)+24*3600);
  const approve=await receipt(await token.approve(await vault.getAddress(),payout),'uni');
  console.log(`Demo escrow approval: ${approve.hash}`);
  const created=await receipt(await vault.createRule(ruleId,account,account,payout,payment,expiry),'uni');
  console.log(`Demo rule created: ${ruleId} in ${created.hash}`);
  const lasnaStart=await providers.lasna.getBlockNumber(),uniStart=await providers.uni.getBlockNumber();
  const origin=await receipt(await gate.pay(ruleId,account,{value:payment}),'base');
  const paymentInterface=new Interface(gateAbi);
  const event=origin.logs.filter(l=>l.address.toLowerCase()===d.baseSepolia.paymentGate.toLowerCase()).map(l=>{try{return {p:paymentInterface.parseLog(l),l}}catch{return null}}).find(x=>x?.p?.name==='PaymentMade');
  if(!event) throw Error('Origin receipt has no genuine PaymentMade event');
  const proofId=keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address','uint256','uint256'],[84532n,d.baseSepolia.paymentGate,BigInt(origin.hash),BigInt(event.l.index)]));
  const e={status:'ORIGIN_CONFIRMED_CALLBACK_PENDING',createdAt:new Date().toISOString(),track:'Set It and Forget It',
    title:'FlowPilot — Autonomous Cross-Chain Automations',deployer:account,ruleId,proofId,beneficiary:account,merchant:account,
    sourceAmountETH:formatEther(payment),payoutFUSD:formatUnits(payout,6),lasnaStartBlock:lasnaStart,uniStartBlock:uniStart,
    transactions:{createRule:{hash:created.hash,explorer:explorer.uni(created.hash)},origin:{hash:origin.hash,explorer:explorer.base(origin.hash),logIndex:event.l.index}}};
  json(evidencePath,e);
  await findProof(d,e);
}
async function verify() {
  await safeNetworks();
  const d=getDeployment();
  if(!existsSync(evidencePath))throw Error('No demo evidence yet. Run demo once.');
  const e=JSON.parse(readFileSync(evidencePath,'utf8'));
  if(!isHexString(e.transactions?.origin?.hash,32))throw Error('Missing Base origin receipt; no legitimate demo yet.');
  await findProof(d,e);
}
try {
  if(phase==='diagnose') await diagnose();
  if(phase==='preflight') await preflight();
  if(phase==='faucet') await faucet();
  if(phase==='deploy') await deploy();
  if(phase==='demo') await demo();
  if(phase==='verify') await verify();
} catch (err) {
  console.error('CLOUD PHASE FAILED (never claim submission without verified callback):',err?.shortMessage||err?.message||String(err));
  if(err?.info?.error)console.error('RPC RESPONSE (no secrets):',JSON.stringify(err.info.error).slice(0,1800));
  if(err?.error)console.error('NESTED ERROR (no secrets):',JSON.stringify(err.error).slice(0,1800));
  if(err?.code)console.error('ERROR CODE:',err.code);
  process.exitCode=1;
}
