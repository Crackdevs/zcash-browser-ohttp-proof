// Direct-control harness only. Secret material stays in this fresh browser's memory.
import initWallet, { initThreadPool, WebWallet } from '@zcashcommunitygrants/webzjs-wallet';
import initKeys, { generate_seed_phrase } from '@zcashcommunitygrants/webzjs-keys';
const endpoint = 'http://127.0.0.1:3100';
const safe = value => JSON.parse(JSON.stringify(value, (_k,v)=>typeof v==='bigint'?v.toString():v));
let wallet,account;
window.recovery = { phase:'loading',network:'test',endpoint };
window.recovery.ready=(async()=>{
  await initWallet(); await initThreadPool(2); await initKeys();
  wallet=new WebWallet('test',endpoint,1,1,null);
  window.recovery.phase='packaged-wallet-loaded';
  const height=Number(await wallet.get_latest_block());
  window.recovery.birthday=height;
  let mnemonic=generate_seed_phrase();
  account=await wallet.create_account('continuation-01-disposable',mnemonic,0,height);
  mnemonic=undefined;
  const transparent=new URL(location.href).searchParams.get('recipient')==='transparent';
  window.recovery.address=transparent?await wallet.get_current_address_transparent(account):await wallet.get_current_address(account);
  window.recovery.account=account;
  window.recovery.phase='disposable-account-ready';
  return {network:'test',endpoint,birthday:height,account,address:window.recovery.address,recipient_type:transparent?'transparent':'unified'};
})().catch(error=>{window.recovery.error=String(error);throw error;});
window.recovery.scan=async()=>{
  await wallet.sync();
  const summary=await wallet.get_wallet_summary();
  const history=await wallet.get_transaction_history(account,50,0);
  return {summary:summary?{chain_tip_height:summary.chain_tip_height,fully_scanned_height:summary.fully_scanned_height,account_balances:safe(summary.account_balances)}:null,history:{transactions:safe(history.transactions),total_count:history.total_count,has_more:history.has_more}};
};
window.recovery.status=()=>({phase:window.recovery.phase,error:window.recovery.error,network:'test'});
window.recovery.ready.then(()=>document.getElementById('status').textContent='Disposable testnet account ready').catch(()=>document.getElementById('status').textContent='Explicit error; see sanitized recovery result');
