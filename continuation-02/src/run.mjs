import {createRequire} from 'node:module';
import {appendFileSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {mkdir,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {services,frame,frames,direct,prefix,sha} from './services.mjs';

const [phase,out,dist,driver,qualification,legacyEvidence]=process.argv.slice(2);
if(!['component','qualify','wallet','legacy','wallet-faults'].includes(phase)||!out||!dist||!driver)throw Error('Usage: node run.mjs component|qualify|wallet|legacy|wallet-faults EVIDENCE DIST PLAYWRIGHT_DIR [COMPONENT_RESULTS LEGACY_RESULTS]');
const logfile=path.join(out,phase+'-events.jsonl'), resultfile=path.join(out,phase+'-results.json');
if(existsSync(logfile)||existsSync(resultfile))throw Error('Use a fresh evidence folder for each run');
await mkdir(out,{recursive:true});
const events=[], result={phase,start:new Date().toISOString(),checks:{}};
function emit(event,data={}){const entry={time:new Date().toISOString(),event,...data};events.push(entry);appendFileSync(logfile,JSON.stringify(entry)+'\n');}
const save=()=>writeFileSync(resultfile,JSON.stringify(result,null,2)+'\n');
function record(name,pass,details){result.checks[name]={status:typeof pass==='string'?pass:pass?'PASS':'FAIL',details};emit('check',{name,status:result.checks[name].status});save();return pass===true;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clean=e=>String(e?.message??e).split('\n')[0].slice(0,300);
const bounded=async(p,ms=90000)=>{let timer;try{return await Promise.race([p,new Promise((_,rej)=>timer=setTimeout(()=>rej(Error('Operation exceeded '+ms+'ms')),ms))]);}finally{clearTimeout(timer);}};
const {chromium}=createRequire(path.resolve(driver,'package.json'))('playwright');
let service,browser,page,mode='ohttp';
const relay='http://127.0.0.1:3111';
const successful=t=>/^grpc-status:\s*0\s*$/im.test(t??'');
function vint(n){const a=[];while(n>=128){a.push((n&127)|128);n=Math.floor(n/128);}return Buffer.from([...a,n]);}
function protobuf(buf){
 const fields={};let i=0;
 function read(){let n=0,m=1;for(let j=0;j<10;j++){if(i>=buf.length)throw Error('Malformed protobuf');const b=buf[i++];n+=(b&127)*m;if(!(b&128))return n;m*=128;}throw Error('Oversize varint');}
 while(i<buf.length){const tag=read(),field=tag>>>3,type=tag&7;if(type===0)fields[field]=read();else if(type===2){const n=read();if(i+n>buf.length)throw Error('Truncated protobuf');fields[field]=buf.subarray(i,i+n);i+=n;}else throw Error('Unexpected protobuf wire type '+type);}
 return fields;
}
async function nativeRead(method,msg=Buffer.alloc(0)){
 const response=await fetch(direct+prefix+method,{method:'POST',headers:{'content-type':'application/grpc-web+proto','x-grpc-web':'1'},body:frame(0,msg),signal:AbortSignal.timeout(25000)});
 const f=frames(Buffer.from(await response.arrayBuffer()));const terminal=f.find(x=>x.flag===128)?.bytes.toString()??('grpc-status: '+response.headers.get('grpc-status'));
 return {http:response.status,terminal,data:f.find(x=>x.flag===0)?.bytes};
}
function blockId(data){const f=protobuf(data);return {height:f[1],hash:f[2]?.toString('hex')??null};}
async function browserStart(){
 browser=await chromium.launch({headless:true});result.browser=browser.version();
 const ctx=await browser.newContext({serviceWorkers:'block'});
 await ctx.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url());
  if(u.origin===service.origin||u.origin===relay||(mode==='direct'&&u.origin===direct))return route.continue();
  emit('blocked-attempt',{mode,url:u.origin+u.pathname,method:r.method()});return route.abort('blockedbyclient');
 });
 const url=r=>{const u=new URL(r.url());return u.origin+u.pathname;};
 ctx.on('request',r=>emit('browser-request',{mode,url:url(r),method:r.method(),resource:r.resourceType()}));
 ctx.on('requestfailed',r=>emit('browser-request-failed',{mode,url:url(r),failure:r.failure()?.errorText}));
 ctx.on('response',r=>{
  emit('browser-response',{mode,url:url(r),status:r.status()});
  if(url(r)===direct+prefix+'GetLatestBlock')r.body().then(body=>{const data=frames(body).find(x=>x.flag===0)?.bytes;if(data)emit('direct-wallet-tip',blockId(data));}).catch(()=>{});
 });
 page=await ctx.newPage();page.on('worker',w=>emit('browser-worker',{url:new URL(w.url()).pathname}));
 page.on('pageerror',e=>emit('browser-pageerror',{message:clean(e)}));
 page.on('console',m=>{const t=m.text();if(t.startsWith('{"proof":"ohttp"')){try{emit('browser-adapter',JSON.parse(t));}catch{emit('invalid-browser-telemetry');}}});
 return ctx;
}
const evaluate=(fun,arg,ms)=>bounded(page.evaluate(fun,arg),ms);
async function call(name,arg,ms){return evaluate(([n,a])=>globalThis.walletProof[n](a),[name,arg],ms);}
const app=()=>page.goto(service.origin+'/',{timeout:30000});
const logSince=n=>events.slice(n);
const field=(n,b)=>Buffer.concat([vint(n*8+2),vint(b.length),b]);
async function components(){
 await app();await page.waitForFunction(()=>typeof component==='function',{},{timeout:20000});
 const meta=await nativeRead('GetLatestBlock');
 if(!successful(meta.terminal)||!meta.data)throw Error('Recovered proxy did not return a successful testnet tip');
 const {height}=blockId(meta.data);result.referenceTip={...blockId(meta.data),terminal:meta.terminal};
 async function run(name,fault,arg,pass){
  service.state.mode=fault;const from=events.length;const value=await evaluate(args=>component(args),arg,90000);await wait(250);
  const trace=logSince(from);const browser=trace.filter(x=>x.event==='browser-adapter');
  record(name,pass(value,trace,browser),{...value,browser,backend:trace.filter(x=>['backend-stream-end','backend-http','gateway-error','gateway-client-close','relay-interrupt'].includes(x.event))});return value;
 }
 await run('live_stream','delay-ending',{start:height-99,end:height},v=>v.records===100&&successful(v.terminal)&&!v.error&&v.finished-v.first>=800);
 const held=b=>b.some(x=>x.stage==='trailer-held')&&!b.some(x=>x.stage==='authenticated-end');
 await run('truncated_after_valid_trailer','truncate-ending',{},(v,_t,b)=>!!v.error&&v.records===1&&!v.terminal&&held(b));
 await run('tampered_after_valid_trailer','tamper-ending',{},(v,_t,b)=>!!v.error&&v.records===1&&!v.terminal&&held(b));
 await run('invalid_config_pin','normal',{config:service.badPin},(v,t)=>/pin|digest/i.test(v.error??'')&&!t.some(e=>e.event==='relay-ingress'&&e.method==='POST'));
 await run('wrong_gateway_key','normal',{config:service.wrongPin},(v,t)=>!!v.error&&t.some(e=>e.event==='gateway-error')&&!t.some(e=>e.event==='backend-start'));
 await run('nonzero_rpc_status','rpc-error',{},v=>v.records===1&&/^grpc-status: 13/m.test(v.terminal??'')&&!v.error);
 await run('relay_interruption','relay-cut',{start:height-99,end:height},(v,t)=>!!v.error&&!v.terminal&&t.some(e=>e.event==='relay-interrupt'));
 await run('cancellation','cancel',{start:height-499,end:height,cancel:true},(v,t)=>!!v.error&&v.first!==null&&!v.terminal&&t.some(e=>e.event==='gateway-client-close'&&!e.upstreamComplete));
 service.state.mode='normal';
 const from=events.length;
 const headers={'content-type':'message/ohttp-chunked-req','authorization':'Bearer PROOF-ID-MARKER','cookie':'probe=PROOF-ID-MARKER','referer':'https://PROOF-ID-MARKER.invalid/','user-agent':'PROOF-ID-MARKER','x-forwarded-for':'PROOF-ID-MARKER','forwarded':'for=PROOF-ID-MARKER','origin':'https://PROOF-ID-MARKER.invalid','x-client-id':'PROOF-ID-MARKER'};
 const mark=await fetch(relay+'/ohttp',{method:'POST',headers,body:Buffer.alloc(32),signal:AbortSignal.timeout(10000)});await mark.arrayBuffer();
 const trace=logSince(from),ingress=trace.find(e=>e.event==='gateway-ingress');
 const identityNames=['authorization','cookie','referer','x-forwarded-for','forwarded','origin','x-client-id','sec-fetch-site','sec-fetch-mode','sec-fetch-dest'];
 record('identity_headers',trace.some(e=>e.event==='relay-ingress'&&e.marker)&&!!ingress&&!ingress.marker&&!identityNames.some(n=>ingress.headers.includes(n)),{http:mark.status,ingress,relay:trace.find(e=>e.event==='relay-ingress')});
}
async function legacy(){
 mode='direct';
 const tip=blockId((await nativeRead('GetLatestBlock')).data);
 let hits=0;
 await page.route(direct+prefix+'GetLatestBlock',async r=>{
  hits++;await r.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/grpc-web+proto'},body:Buffer.concat([frame(0,Buffer.concat([Buffer.of(8),vint(tip.height)])),frame(128,Buffer.from('grpc-status: 13\r\ngrpc-message: proof-final-error\r\n'))])});
 });
 await page.goto(service.origin+'/recovery.html',{timeout:30000});await page.waitForFunction(()=>window.recovery,{},{timeout:30000});
 const read=await evaluate(async()=>{try{return {observed:(await window.recovery.ready).birthday};}catch(e){return {error:String(e)};}},undefined,30000);
 record('reproduced_legacy_final_status_loss',hits>0&&read.observed===tip.height,{fixture:'data then final grpc-status 13',tip:tip.height,hits,...read});
}
async function walletFaults(){
 await app();await page.waitForFunction(()=>!!globalThis.walletProof,{},{timeout:30000});
 await evaluate(()=>walletProof.ready,undefined,90000);
 const positive=await call('statusRead',undefined,30000);
 for(const fault of ['truncate-ending','tamper-ending']){
  const from=events.length;service.state.mode=fault;
  let value;
  try{value={height:await call('statusRead',undefined,30000)};}catch(e){value={error:clean(e)};}
  const trace=logSince(from).filter(e=>e.event==='browser-adapter'&&e.method==='GetLatestBlock');
  record('wallet_'+fault,positive>0&&!!value.error&&!value.height&&trace.some(e=>e.stage==='trailer-held')&&!trace.some(e=>e.stage==='authenticated-end'),{positiveHeight:positive,...value,trace});
 }
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const matches=(history,id)=>history?.filter(t=>/^[0-9a-f]{64}$/i.test(t.txid)&&Buffer.from(t.txid,'hex').reverse().toString('hex')===id)??[];
const total=b=>b.reduce((sum,[,p])=>sum+p.ironwood_balance+p.orchard_balance+p.sapling_balance+p.unshielded_balance,0);
const confirmed=(t,value)=>t.tx_type==='Received'&&t.status==='Confirmed'&&t.value===value&&t.block_height>0;
function readJson(f){return JSON.parse(readFileSync(f,'utf8'));}
function onceFile(filename,obj){writeFileSync(path.join(path.dirname(out),filename),JSON.stringify(obj,null,2)+'\n',{flag:'wx'});}
function lookupResult(http,terminal,data,txid){
 const f=data?protobuf(data):{};
 return {http,terminal,txid,height:f[2]??null,rawBytes:f[1]?.length??0,rawSha256:f[1]?sha(f[1]):null};
}
async function lookup(txid){
 const n=await nativeRead('GetTransaction',field(3,Buffer.from(txid,'hex').reverse()));
 return lookupResult(n.http,n.terminal,n.data,txid);
}
async function wallet(){
 await app();await page.waitForFunction(()=>!!globalThis.walletProof,{},{timeout:30000});
 const ready=await evaluate(()=>walletProof.ready,undefined,90000);
 if(!record('wallet_loaded',ready.crossOriginIsolated&&ready.network==='test',ready))throw Error('Unexpected harness environment');
 service.state.mode='rpc-error';
 let statusRead;
 try{statusRead={height:await call('statusRead',undefined,30000)};}catch(e){statusRead={error:clean(e)};}
 service.state.mode='normal';
 if(!record('wallet_final_rpc_error',/proof-final-error|proof%2Dfinal%2Derror/.test(statusRead.error??'')&&!statusRead.height,statusRead))throw Error('Wallet did not propagate final gRPC status');
 const before=events.length;
 const fresh=await call('fresh');
 if(!fresh.address.startsWith('utest1'))throw Error('Refusing to use a non-testnet recipient');
 const empty=await call('scanCurrent',undefined,120000);await wait(350);
 const observed=logSince(before);
 result.account=fresh;
 if(!record('wallet_worker_route',observed.some(e=>e.event==='browser-adapter'&&e.realm==='worker'&&e.stage==='authenticated-end')&&observed.some(e=>e.event==='backend-start'&&e.method==='GetBlockRange')&&!observed.some(e=>e.event==='blocked-attempt'),{empty,workerRpc:[...new Set(observed.filter(e=>e.event==='browser-adapter'&&e.realm==='worker').map(e=>e.method))]}))throw Error('Worker routing or sync qualification did not pass');
 if(phase==='qualify')return;
 const q=readJson(qualification),l=readJson(legacyEvidence);
 const required=['live_stream','truncated_after_valid_trailer','tampered_after_valid_trailer','invalid_config_pin','wrong_gateway_key','nonzero_rpc_status','relay_interruption','cancellation','identity_headers','attempted_direct_bypass'];
 if(required.some(x=>q.checks[x]?.status!=='PASS')||l.checks.reproduced_legacy_final_status_loss?.status!=='PASS')throw Error('Transport qualification evidence did not pass; no faucet claim');
 if(process.env.PROOF_ALLOW_TESTNET_PAYMENT!=='1')throw Error('Set PROOF_ALLOW_TESTNET_PAYMENT=1 only for the one testnet funding and send run');
 if(total(empty.balances)!==0||empty.history.length)throw Error('Fresh account is not empty');

 const faucet='https://zcash-faucet.vercel.app';
 const short=path.resolve(import.meta.dirname,'..');
 const cli=await realpath(path.join(short,'js-tools','node_modules','zcash-faucet','bin','zcash-faucet.js'));
 const configDir=path.join(import.meta.dirname,'private-faucet-config');await mkdir(configDir,{recursive:true});
 onceFile('funding-intent.json',{timestamp:new Date().toISOString(),source:faucet,version:'1.2.1',address:fresh.address,attempt:1});
 emit('faucet-start',{source:faucet,version:'1.2.1',auth:'proof of work; no login',address:fresh.address});
 const fundingAt=Date.now();
 let output,exit=0;
 try{output=(await promisify(execFile)(process.execPath,[cli,fresh.address,'--faucet',faucet],{windowsHide:true,timeout:420000,maxBuffer:131072,env:{...process.env,XDG_CONFIG_HOME:configDir,NO_COLOR:'1',UV_THREADPOOL_SIZE:'4'}})).stdout;}
 catch(e){output=e.stdout??'';exit=typeof e.code==='number'?e.code:e.killed?'timeout':'error';}
 let txid=output.match(/\btxid\s+([a-f0-9]{64})\b/i)?.[1]?.toLowerCase();
 const funded={source:faucet,elapsedMs:Date.now()-fundingAt,exit,txid:txid??null,proofOfWork:/Proof-of-work done/i.test(output),possiblyDispatched:/Sending|on its way/i.test(output)};
 result.funding=funded;emit('faucet-result',funded);save();
 if(!txid){
  const checks=[];
  for(let i=0;i<8&&!txid;i++){const a=await call('scanCurrent',undefined,120000);const candidates=a.history.filter(t=>confirmed(t,10000000));checks.push({tip:a.tip,scanned:a.scanned,candidates:candidates.length});if(candidates.length===1)txid=Buffer.from(candidates[0].txid,'hex').reverse().toString('hex');else await wait(15000);}
  funded.reconciliation={txid:txid??null,checks};save();
  if(!txid){record('real_ohttp_receipt','BLOCKED',funded);throw Error('Faucet returned no txid and wallet reconciliation found no unique confirmed 0.1 TAZ receipt; no repeat claim');}
 }
 let receipt,receivedScan;const until=Date.now()+12*60000;
 while(Date.now()<until){
  receivedScan=await call('scanCurrent',undefined,120000);receipt=matches(receivedScan.history,txid).find(t=>confirmed(t,10000000));
  emit('receipt-poll',{tip:receivedScan.tip,scanned:receivedScan.scanned,matched:!!receipt});
  if(receipt)break;await wait(15000);
 }
 if(!receipt){record('real_ohttp_receipt','BLOCKED',{txid,lastScan:receivedScan});throw Error('Funded txid did not appear in wallet by receipt deadline');}
 const through=await evaluate(args=>component(args),{txid},60000);
 const txDetails=lookupResult(200,through.terminal,through.recordHex?Buffer.from(through.recordHex,'hex'):null,txid);
 const receiptNode=await lookup(txid);
 if(!record('real_ohttp_receipt',successful(receiptNode.terminal)&&receiptNode.height===receipt.block_height&&total(receivedScan.balances)===receipt.value,{txid,receipt,node:receiptNode,wallet:receivedScan}))throw Error('Real receipt did not reconcile');
 record('transaction_details_rpc',!through.error&&successful(txDetails.terminal)&&txDetails.height===receipt.block_height&&!!txDetails.rawSha256&&txDetails.rawSha256===receiptNode.rawSha256,{via:'browser component GetTransaction plus independent direct RPC; not local wallet history',...txDetails,error:through.error});

 const comparisons=[];
 let comparison;
 for(let i=0;i<5&&!comparison;i++){
  mode='direct';const a=events.length;const d=await call('freshScan','direct',120000);await wait(120);
  const directTips=logSince(a).filter(e=>e.event==='direct-wallet-tip'&&e.height===d.tip).map(({height,hash})=>({height,hash}));
  mode='ohttp';const b=events.length;const o=await call('freshScan','ohttp',120000);
  const ohttpTips=logSince(b).filter(e=>e.event==='backend-unary-result'&&e.method==='GetLatestBlock'&&e.protobuf).map(e=>blockId(Buffer.from(e.protobuf,'hex'))).filter(e=>e.height===o.tip);
  const entry={direct:d,ohttp:o,directTips,ohttpTips};
  if(d.tip===o.tip&&d.scanned===d.tip&&o.scanned===o.tip&&d.tip>=receipt.block_height){
   const raw=await nativeRead('GetBlock',Buffer.concat([Buffer.of(8),vint(d.tip)]));
   const browser=await evaluate(args=>component(args),{block:d.tip},60000);
   const db=raw.data?protobuf(raw.data):{}, ob=browser.recordHex?protobuf(Buffer.from(browser.recordHex,'hex')):{};
   entry.checkpoint={height:db[2],directHash:db[3]?.toString('hex'),ohttpHash:ob[3]?.toString('hex'),directRpc:raw.terminal,ohttpRpc:browser.terminal};
   const c=entry.checkpoint;
   if(c.height===d.tip&&ob[2]===d.tip&&c.directHash?.length===64&&c.directHash===c.ohttpHash&&successful(c.directRpc)&&successful(c.ohttpRpc)&&
    directTips.every(t=>!t.hash||t.hash===c.directHash)&&ohttpTips.every(t=>!t.hash||t.hash===c.directHash))comparison=entry;
  }
  comparisons.push(entry);
 }
 if(!comparison){record('same_checkpoint_comparison','BLOCKED',{reason:'No matching independently verified checkpoint',comparisons});throw Error('Fresh scans remained incomparable');}
 const {direct:d,ohttp:o}=comparison;
 if(!record('same_checkpoint_comparison',same(d,o)&&matches(d.history,txid).some(t=>confirmed(t,10000000)),{compared:comparison,attempts:comparisons.length}))throw Error('Fresh scan state differs at the same verified checkpoint');

 let intent;
 try{intent=await call('authorize',undefined,180000);}
 catch(e){record('outgoing_payment','BLOCKED',{stage:'existing wallet authorization',error:clean(e)});throw Error('Wallet could not authorize the single payment; no submission');}
 if(!/^[0-9a-f]{64}$/i.test(intent.txid)||!intent.address.startsWith('utest1'))throw Error('Authorization did not yield a single testnet intent');
 onceFile('send-intent.json',{timestamp:new Date().toISOString(),...intent,attempt:1});result.sendIntent=intent;emit('send-intent',intent);save();
 const sendStart=events.length;
 let submit;
 try{submit=await call('submit',undefined,90000);}catch(e){submit={error:clean(e)};}
 const backend=logSince(sendStart).filter(e=>e.event==='backend-unary-result'&&e.method==='SendTransaction');
 const accepted=backend.length===1&&backend[0].sendResponseCode===0&&successful(backend[0].trailer);
 result.submission={submit,accepted,backend};save();
 const sendUntil=Date.now()+12*60000;let included,sender,recipient;
 while(Date.now()<sendUntil){
  try{included=await lookup(intent.txid);}catch(e){included={error:clean(e)};}
  emit('send-reconciliation',{txid:intent.txid,...included});
  if(successful(included.terminal)&&included.height>0&&included.height<4294967295){
   sender=await call('scanCurrent',undefined,120000);recipient=await call('scanRecipient',undefined,120000);
   if(matches(sender.history,intent.txid).some(t=>t.block_height===included.height)&&matches(recipient.history,intent.txid).some(t=>confirmed(t,intent.amount_zatoshi)&&t.block_height===included.height))break;
  }
  await wait(15000);
 }
 const seen=matches(recipient?.history,intent.txid).some(t=>confirmed(t,intent.amount_zatoshi)&&t.block_height===included.height);
 const senderSeen=matches(sender?.history,intent.txid).some(t=>t.block_height===included.height);
 record('outgoing_payment',accepted&&submit.wallet_send_returned&&seen&&senderSeen&&total(recipient.balances)===intent.amount_zatoshi&&total(sender.balances)<total(o.balances),{txid:intent.txid,submit,accepted,backend,included,sender,recipient,submissionAttempts:1,noReplacement:true});
}
try{
 service=await services(dist,emit);await browserStart();
 if(phase==='component')await components();
 else if(phase==='legacy')await legacy();
 else if(phase==='wallet-faults')await walletFaults();
 else await wallet();
}catch(e){result.error=clean(e);process.exitCode=1;emit('run-error',{message:result.error});}
finally{
 if(browser)await browser.close();
 if(service)await service.release();
 const blocked=events.filter(e=>e.event==='blocked-attempt'&&e.mode==='ohttp');
 if(phase!=='legacy'){
  const requests=events.filter(e=>e.event==='browser-request'&&e.mode==='ohttp'&&e.url===relay+'/ohttp');
  record('attempted_direct_bypass',requests.length?blocked.length===0:blocked.length?'FAIL':'NOT_RUN',{blocked,relayRequests:requests.length});
  result.protectedRpcCoverage=[...new Set(events.filter(e=>e.event==='backend-start').map(e=>e.method))].sort();
 }
 result.end=new Date().toISOString();save();
}
