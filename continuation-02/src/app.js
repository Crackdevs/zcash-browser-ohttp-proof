import './component.js';
import {installProofTransport,origin} from './proof-adapter.js';
import initWallet,{WebWallet,initThreadPool} from '@zcashcommunitygrants/webzjs-wallet';
import initKeys,{generate_seed_phrase} from '@zcashcommunitygrants/webzjs-keys';
installProofTransport();
const direct='http://127.0.0.1:3100';const clean=x=>JSON.parse(JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v));
const endpoint=mode=>{if(mode==='ohttp')return origin;if(mode==='direct')return direct;throw Error('Explicit wallet mode required');};
let seed,recipientSeed,birthday,active,recipient,authorized,submitted=false;
const ready=(async()=>{await initWallet();await initThreadPool(2);await initKeys();return {crossOriginIsolated,network:'test'};})();
async function create(mode,phrase,height){const wallet=new WebWallet('test',endpoint(mode),1,1,null);const account=await wallet.create_account('disposable-proof',phrase,0,height);return {wallet,account};}
async function scan({wallet,account}){
 await wallet.sync();const s=await wallet.get_wallet_summary(),h=await wallet.get_transaction_history(account,50,0);
 return {tip:s.chain_tip_height,scanned:s.fully_scanned_height,balances:clean(s.account_balances),history:clean(h.transactions)};
}
globalThis.walletProof={ready,
 async statusRead(){await ready;return Number(await new WebWallet('test',origin,1,1,null).get_latest_block());},
 async fresh(){await ready;if(seed)throw Error('Primary disposable account already created');seed=generate_seed_phrase();birthday=Number(await new WebWallet('test',origin,1,1,null).get_latest_block());active=await create('ohttp',seed,birthday);return {birthday,address:await active.wallet.get_current_address(active.account)};},
 async scanCurrent(){return scan(active);},
 async freshScan(mode){const instance=await create(mode,seed,birthday);const result=await scan(instance);if(mode==='ohttp')active=instance;return result;},
 async authorize(){
  if(authorized||submitted)throw Error('One authorization only');recipientSeed=generate_seed_phrase();const height=Number(await active.wallet.get_latest_block());recipient=await create('ohttp',recipientSeed,height);
  const address=await recipient.wallet.get_current_address(recipient.account);if(!address.startsWith('utest1'))throw Error('Not a testnet recipient');
  const proposal=await active.wallet.propose_transfer(active.account,address,1000000n);
  authorized=await active.wallet.create_proposed_transactions(proposal,seed,0);
  if(authorized.length!==32)throw Error('Expected exactly one transaction ID');
  return {txid:Array.from(authorized).reverse().map(b=>b.toString(16).padStart(2,'0')).join(''),address,amount_zatoshi:1000000,recipient_birthday:height};
 },
 async submit(){if(!authorized||submitted)throw Error('No fresh authorization');submitted=true;await active.wallet.send_authorized_transactions(authorized);return {wallet_send_returned:true};},
 async scanRecipient(){return scan(recipient);},
};
