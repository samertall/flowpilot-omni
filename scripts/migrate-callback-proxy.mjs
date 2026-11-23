#!/usr/bin/env node
/**
 * FlowPilot Omni proxy migration (testnets only; GitHub Actions only).
 * Reuses Base PaymentGate and Unichain MockUSD. Builds a new Lasna relay and
 * new Unichain vault using the officially documented post-Omni callback proxy.
 * Archives older deployment/evidence files; never fabricates hashes.
 */
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {Wallet,JsonRpcProvider,ContractFactory,Contract,parseEther,formatEther,getAddress,ZeroAddress} from 'ethers';

const ROOT=resolve(import.meta.dirname,'..');
const LASNA_RPC=process.env.LASNA_RPC_URL||'https://lasna-rpc.rnk.dev/';
const UNI_RPC=process.env.UNI_RPC_URL||'https://sepolia.unichain.org';
const CHAIN={lasna:{id:5318007,url:LASNA_RPC},uni:{id:1301,url:UNI_RPC}};
const NEW_PROXY='0x775c9B990ADe401060B78D0e98684eEf8d2466C1';
const OLD_PROXY='0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4';
const SYSTEM='0x8888888888888888888888888888888888888888';
const paths={
  active:resolve(ROOT,'deployments','lasna.json'),
  old:resolve(ROOT,'deployments','lasna-legacy.json'),
  app:resolve(ROOT,'app','deployments.json'),
  progress:resolve(ROOT,'deployments','CLOUD_PROXY_MIGRATION_PROGRESS.json'),
  evidence:resolve(ROOT,'docs','CLOUD_EVIDENCE.json'),
  archivedEvidence:resolve(ROOT,'docs','CLOUD_EVIDENCE_LEGACY_ATTEMPT2.json')
};
const writeJSON=(filename,value)=>{
  mkdirSync(resolve(filename,'..'),{recursive:true});
  writeFileSync(filename,JSON.stringify(value,null,2)+'\n');
};
const toHex=n=>'0x'+BigInt(n).toString(16);
const assertAddress=a=>getAddress(a);
if(process.env.GITHUB_ACTIONS!=='true')throw Error('This migration only runs in GitHub Actions');
if(process.env.CONFIRM_TESTNET_BROADCAST!=='yes')throw Error('Explicit TESTNET-only approval missing');
const secret=process.env.FLOWPILOT_TESTNET_PRIVATE_KEY||'';
if(!/^(0x)?[a-fA-F0-9]{64}$/.test(secret))throw Error('GitHub testnet wallet secret missing');
const key=secret.startsWith('0x')?secret:'0x'+secret;
const providers=Object.fromEntries(Object.entries(CHAIN).map(([n,c])=>[n,new JsonRpcProvider(c.url)]));
const signers=Object.fromEntries(Object.entries(providers).map(([n,p])=>[n,new Wallet(key,p)]));
const wallet=signers.lasna.address;
const old=JSON.parse(readFileSync(paths.active,'utf8'));
if(assertAddress(old.deployer)!==assertAddress(wallet))throw Error('Different wallet from original deployment');
if(old.baseSepolia.chainId!==84532||old.unichainSepolia.chainId!==1301||old.lasna.chainId!==5318007)
  throw Error('Deployment chain ID mismatch');
if(assertAddress(old.unichainSepolia.callbackProxy)===assertAddress(NEW_PROXY)){
  console.log('Current deployment already uses the corrected callback proxy. Nothing to do.');
  process.exit(0);
}
if(assertAddress(old.unichainSepolia.callbackProxy)!==assertAddress(OLD_PROXY))
  throw Error('Unexpected previous callback proxy; no migration attempted');
if(!old.baseSepolia.paymentGate||!old.unichainSepolia.mockUSD)throw Error('Original origin/token deployment missing');
const progress=existsSync(paths.progress)
  ?JSON.parse(readFileSync(paths.progress,'utf8'))
  :{status:'IN_PROGRESS_NOT_VERIFIED',wallet,previousProxy:OLD_PROXY,newProxy:NEW_PROXY,startedAt:new Date().toISOString(),steps:{}};
if(assertAddress(progress.wallet)!==assertAddress(wallet))throw Error('Saved migration belongs to another wallet');
if(progress.newProxy.toLowerCase()!==NEW_PROXY.toLowerCase())throw Error('Migration target changed unexpectedly');
const persist=()=>writeJSON(paths.progress,progress);
const contractArtifact=name=>{
  const file=resolve(ROOT,'out',name+'.sol',name+'.json');
  const c=JSON.parse(readFileSync(file,'utf8'));
  if(!c.bytecode?.object?.startsWith('0x'))throw Error('Missing compiled bytecode for '+name);
  return {abi:c.abi,bytecode:c.bytecode.object};
};
const receipt=async(tx,chain)=>{
  console.log('['+chain+'] sent '+tx.hash);
  const r=await tx.wait(1,180000);
  if(!r||r.status!==1)throw Error('Unconfirmed or reverted '+chain+' tx '+tx.hash);
  return r;
};
const waitForCode=async(chain,address)=>{
  for(let attempt=0;attempt<9;attempt++){
    const code=await providers[chain].getCode(address);
    if(code!=='0x')return code;
    console.log('Waiting for '+chain+' RPC to index confirmed deployed code at '+address);
    await new Promise(r=>setTimeout(r,1250));
  }
  throw Error('Confirmed '+chain+' contract code still unavailable after RPC retries: '+address);
};
const validateStep=async(name,chain,addressRequired=false)=>{
  const step=progress.steps[name];if(!step)return null;
  if(step.chain!==chain)throw Error('Saved chain mismatch: '+name);
  const r=await providers[chain].getTransactionReceipt(step.hash);
  if(!r||r.status!==1)throw Error('Saved tx not confirmed: '+name+' '+step.hash);
  if(addressRequired){
    if(!step.address||assertAddress(r.contractAddress||ZeroAddress)!==assertAddress(step.address))
      throw Error('Saved creation address mismatch: '+name);
    await waitForCode(chain,step.address);
  }
  console.log('Reusing verified '+name+' '+step.hash);
  return step;
};
const saveStep=(name,chain,address,r)=>{
  progress.steps[name]={chain,address,hash:r.hash,block:r.blockNumber};
  persist();
  console.log('Confirmed '+name+' '+address+' '+r.hash);
};
const legacyOverride=async({to,data,value=0n},reserve=0n)=>{
  const net=await providers.lasna.getNetwork();
  if(net.chainId!==5318007n)throw Error('Lasna RPC wrong chain');
  const call={from:wallet,data,value:toHex(value)};
  if(to)call.to=to;
  const estimate=BigInt(await providers.lasna.send('eth_estimateGas',[call]));
  const gasLimit=estimate*115n/100n+10000n;
  if(gasLimit>1100000n)throw Error('Gas estimate exceeds safety ceiling: '+gasLimit);
  const gasPrice=BigInt(await providers.lasna.send('eth_gasPrice',[]));
  const need=gasLimit*gasPrice+value+reserve;
  const balance=await providers.lasna.getBalance(wallet);
  if(balance<need)throw Error('Insufficient lREACT: need '+formatEther(need)+', have '+formatEther(balance));
  return {type:0,gasPrice,gasLimit};
};
async function deployContract(stepName,contractName,chain,args){
  const artifact=contractArtifact(contractName);
  const prior=await validateStep(stepName,chain,true);
  if(prior)return new Contract(prior.address,artifact.abi,signers[chain]);
  const factory=new ContractFactory(artifact.abi,artifact.bytecode,signers[chain]);
  let opts={};
  if(chain==='lasna'){
    const tx=await factory.getDeployTransaction(...args);
    opts=await legacyOverride({data:tx.data},parseEther('0.085'));
    if(opts.gasLimit>1000000n)throw Error('Lasna constructor gas exceeds 1m cap');
  }
  const obj=await factory.deploy(...args,opts);
  const dep=obj.deploymentTransaction();
  if(!dep)throw Error('No '+contractName+' creation transaction');
  const rec=await receipt(dep,chain);
  const addr=await obj.getAddress();
  await waitForCode(chain,addr);
  saveStep(stepName,chain,addr,rec);
  return obj;
}
async function main(){
  for(const [name,cfg] of Object.entries(CHAIN)){
    const chainId=BigInt(await providers[name].send('eth_chainId',[]));
    if(chainId!==BigInt(cfg.id))throw Error('Unsafe '+name+' RPC '+chainId);
  }
  if((await providers.uni.getCode(NEW_PROXY))==='0x')
    throw Error('Official post-Omni Unichain proxy has no code');
  const legacyRelay=old.lasna.omniRelay,legacyVault=old.unichainSepolia.payoutVault;
  console.log('Migrating from outdated proxy '+OLD_PROXY+' to '+NEW_PROXY);
  console.log('Preserving Base PaymentGate '+old.baseSepolia.paymentGate+' and demo fUSD '+old.unichainSepolia.mockUSD);
  console.log('Old relay/vault '+legacyRelay+' / '+legacyVault);
  const relay=await deployContract('OmniRelayV2','OmniRelay','lasna',[84532,old.baseSepolia.paymentGate,1301]);
  const relayAddr=await relay.getAddress();
  const vault=await deployContract('PayoutVaultV2','PayoutVault','uni',[old.unichainSepolia.mockUSD,NEW_PROXY,relayAddr]);
  const vaultAddr=await vault.getAddress();
  if(!(await validateStep('SetDestinationV2','lasna'))){
    const current=await relay.destination();
    if(assertAddress(current)!==ZeroAddress)throw Error('Relay destination already assigned without recorded tx; manual inspection needed');
    const tx=await relay.setDestination.populateTransaction(vaultAddr);
    const opts=await legacyOverride({to:relayAddr,data:tx.data},parseEther('0.06'));
    const r=await receipt(await relay.setDestination(vaultAddr,opts),'lasna');
    saveStep('SetDestinationV2','lasna',relayAddr,r);
  }
  if(assertAddress(await relay.destination())!==assertAddress(vaultAddr))
    throw Error('New Lasna relay destination mismatch');
  const sys=new Contract(SYSTEM,['function reserves(address) view returns(uint256)','function debts(address) view returns(uint256)','function depositTo(address) payable'],signers.lasna);
  if((await sys.debts(relayAddr))!==0n)throw Error('New Lasna relay has outstanding debt');
  if(!(await validateStep('FundRelayV2','lasna'))){
    const reserve=await sys.reserves(relayAddr),desired=parseEther('0.06');
    if(reserve<desired){
      const value=desired-reserve;
      const tx=await sys.depositTo.populateTransaction(relayAddr,{value});
      const opts=await legacyOverride({to:SYSTEM,data:tx.data,value});
      const r=await receipt(await sys.depositTo(relayAddr,{...opts,value}),'lasna');
      saveStep('FundRelayV2','lasna',SYSTEM,r);
    }else console.log('New relay reserve already sufficient; no duplicate deposit');
  }
  const proxy=new Contract(NEW_PROXY,['function reserves(address) view returns(uint256)','function debts(address) view returns(uint256)','function depositTo(address) payable'],signers.uni);
  if((await proxy.debts(vaultAddr))!==0n)throw Error('New vault has outstanding callback proxy debt');
  if(!(await validateStep('FundProxyV2','uni'))){
    const desired=parseEther('0.003'),reserve=await proxy.reserves(vaultAddr);
    if(reserve<desired){
      const value=desired-reserve;
      const balance=await providers.uni.getBalance(wallet);
      if(balance<value+parseEther('0.0002'))throw Error('Unichain balance insufficient for proxy deposit plus gas reserve');
      const r=await receipt(await proxy.depositTo(vaultAddr,{value}),'uni');
      saveStep('FundProxyV2','uni',NEW_PROXY,r);
    }else console.log('New proxy reserve already sufficient; no duplicate deposit');
  }
  if((await sys.reserves(relayAddr))<parseEther('0.06'))throw Error('New Lasna reserve not funded');
  if((await proxy.reserves(vaultAddr))<parseEther('0.003'))throw Error('New Unichain callback reserve not funded');

  // Archive older deployment and unverified callback evidence before making new current manifest.
  if(!existsSync(paths.old))writeJSON(paths.old,old);
  if(existsSync(paths.evidence)){
    if(!existsSync(paths.archivedEvidence))
      writeJSON(paths.archivedEvidence,JSON.parse(readFileSync(paths.evidence,'utf8')));
    unlinkSync(paths.evidence);
  }
  const result={
    ...old,
    unichainSepolia:{...old.unichainSepolia,payoutVault:vaultAddr,vaultDeploymentTx:progress.steps.PayoutVaultV2.hash,callbackProxy:NEW_PROXY},
    lasna:{...old.lasna,omniRelay:relayAddr,deploymentTx:progress.steps.OmniRelayV2.hash,
      setDestinationTx:progress.steps.SetDestinationV2?.hash||null,
      systemDepositTx:progress.steps.FundRelayV2?.hash||null},
    callbackProxyDepositTx:progress.steps.FundProxyV2?.hash||null,
    migration:{reason:'Official post-Omni Unichain callback proxy upgraded',
      officialProxySource:'https://dev.reactive.network/origins-and-destinations',
      supersedes:'deployments/lasna-legacy.json',completedAt:new Date().toISOString()}
  };
  writeJSON(paths.active,result);writeJSON(paths.app,result);
  progress.status='MIGRATED_CORRECT_PROXY_FUNDED_DEMO_NOT_VERIFIED';
  progress.completedAt=new Date().toISOString();
  persist();
  console.log('MIGRATION SUCCESS: callback proxy '+NEW_PROXY);
  console.log('New relay '+relayAddr+' and new vault '+vaultAddr+' confirmed and funded.');
  console.log('A new Base payment and verified Unichain callback are still REQUIRED before submission.');
}
try{await main()}catch(e){
  console.error('PROXY MIGRATION INCOMPLETE:',e?.shortMessage||e?.message||String(e));
  if(e?.info?.error)console.error('RPC ERROR DETAILS:',JSON.stringify(e.info.error).slice(0,1300));
  process.exitCode=1;
}