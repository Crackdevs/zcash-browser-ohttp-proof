import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ChunkedOHTTPServer,KeyConfig,MediaType} from 'ohttp-ts';
import {CipherSuite,KEM_DHKEM_X25519_HKDF_SHA256,KDF_HKDF_SHA256,AEAD_AES_128_GCM} from 'hpke';
import {createRelayServer} from './relay/server.ts';
export const prefix='/cash.z.wallet.sdk.rpc.CompactTxStreamer/';
export const direct='http://127.0.0.1:3100';
const logical='http://wallet-rpc.invalid';
const cap=64*1024*1024;
export const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const listen=async(server,port)=>{server.listen(port,'127.0.0.1');await once(server,'listening');return server;};
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
export function frame(flag,b){const out=Buffer.alloc(5+b.length);out[0]=flag;out.writeUInt32BE(b.length,1);out.set(b,5);return out;}
export function frames(body){const out=[];for(let i=0;i<body.length;){if(i+5>body.length)throw Error('partial header');const n=body.readUInt32BE(i+1);if(i+5+n>body.length)throw Error('partial frame');out.push({flag:body[i],bytes:body.subarray(i+5,i+5+n)});i+=5+n;}return out;}
async function bytes(req,max){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>max)throw Error('request limit');chunks.push(c);}return Buffer.concat(chunks);}
export async function services(dist,emit){
 const state={mode:'normal'};let gateway,relay,app,proxy;let closed=false;
 const release=async()=>{if(closed)return;closed=true;await Promise.all([app,gateway,relay].filter(Boolean).map(close));if(proxy&&!proxy.killed)proxy.kill();};
 try{
  const proxyExe='C:/Users/NewOwner/Documents/Codex/work/o1/bin/grpcwebproxy.exe';
  const proxyArgs=['--backend_addr=testnet.zec.rocks:443','--backend_tls','--run_tls_server=false','--server_bind_address=127.0.0.1','--server_http_debug_port=3100','--allow_all_origins','--backend_max_call_recv_msg_size=10485760'];
  proxy=spawn(proxyExe,proxyArgs,{windowsHide:true,stdio:['ignore','ignore','pipe']});await once(proxy,'spawn');emit('proxy-start',{executable:proxyExe,args:proxyArgs});
  proxy.stderr.on('data',b=>emit('proxy-stderr',{text:String(b).trim().slice(0,500)}));
  proxy.on('exit',(code,signal)=>emit('proxy-exit',{code,signal}));
  for(let i=0;i<12;i++){
   let detail;
   try{
    const r=await fetch(direct+prefix+'GetLatestBlock',{method:'POST',headers:{'content-type':'application/grpc-web+proto','x-grpc-web':'1'},body:Buffer.alloc(5),signal:AbortSignal.timeout(4500)});
    const f=frames(Buffer.from(await r.arrayBuffer()));
    const terminal=f.find(x=>x.flag===128)?.bytes.toString()??null;
    detail={http:r.status,terminal};
    if(r.ok&&f.some(x=>x.flag===0)&&/^grpc-status:\s*0\s*$/im.test(terminal??'')){emit('proxy-readiness',detail);break;}
   }catch(e){detail={error:e.cause?.code??e.name};}
   emit('proxy-readiness-retry',detail);
   if(i===11||proxy.exitCode!==null)throw Error('Recovered proxy did not return a successful framed RPC');
   await sleep(350);
  }
  const suite=new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256,KDF_HKDF_SHA256,AEAD_AES_128_GCM);
  const privateConfig=await KeyConfig.generate(suite,7), wrong=await KeyConfig.generate(suite,8);
  const pinFor=k=>{const b=KeyConfig.serializeMultiple([k]);return {publicConfig:Buffer.from(b).toString('base64'),sha256:sha(b)};};
  const pin=pinFor(privateConfig);const wrongPin=pinFor(wrong);
  // Key objects and public bootstrap bytes stay in memory. Only the digest is logged.
  emit('bootstrap-pin',{sha256:pin.sha256,keyId:7,source:'controlled application origin; not relay discovery'});
  const normal=new ChunkedOHTTPServer([privateConfig],{maxMessageSize:cap});
  const padded=new ChunkedOHTTPServer([privateConfig],{maxMessageSize:cap,padding:n=>n+49152});
  let count=0;
  gateway=await listen(createServer(async(req,res)=>{
   const id=++count,mode=state.mode;const abort=new AbortController();let upstreamComplete=false,method;
   const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(85000)]);
   res.on('close',()=>{if(!res.writableFinished){emit('gateway-client-close',{id,mode,method,upstreamComplete});abort.abort(Error('Relay downstream closed'));}});
   emit('gateway-ingress',{id,mode,headers:Object.keys(req.headers).sort(),marker:Object.values(req.headers).some(v=>String(v).includes('PROOF-ID-MARKER'))});
   try{
    if(req.method!=='POST'||req.url!=='/ohttp'||req.headers['content-type']!==MediaType.CHUNKED_REQUEST)throw Error('Invalid gateway envelope');
    const sealed=await bytes(req,1024*1024);emit('gateway-sealed-request',{id,bytes:sealed.length,sha256:sha(sealed)});
    const server=mode==='normal'?normal:padded;
    const {request,context}=await server.decapsulateRequest(new Request('http://127.0.0.1:3112/ohttp',{method:'POST',headers:{'content-type':MediaType.CHUNKED_REQUEST},body:sealed,signal}),{signal});
    const u=new URL(request.url);method=u.pathname.slice(prefix.length);
    if(u.origin!==logical||u.search||!u.pathname.startsWith(prefix)||!/^\w+$/.test(method)||request.method!=='POST')throw Error('Disallowed inner RPC');
    if(mode!=='normal'&&method==='SendTransaction')throw Error('Faults forbidden on writes');
    const inner=await request.arrayBuffer(); // authenticate entire bounded unary upload before dispatch
    const headers={'content-type':'application/grpc-web+proto','accept':'application/grpc-web+proto','x-grpc-web':'1'};
    emit('backend-start',{id,mode,method,innerHeaders:[...request.headers.keys()].sort(),requestBytes:inner.byteLength});
    const target=await fetch(direct+u.pathname,{method:'POST',headers,body:inner,signal,redirect:'error'});
    const kept=new Headers();for(const k of ['content-type','grpc-status','grpc-message','grpc-status-details-bin'])if(target.headers.has(k))kept.set(k,target.headers.get(k));
    emit('backend-http',{id,mode,method,status:target.status,headerStatus:kept.get('grpc-status')});
    let body=target.body;
    if(mode==='rpc-error'||method==='SendTransaction'||method==='GetLatestBlock'){
     let b=Buffer.from(await target.arrayBuffer());upstreamComplete=true;
     const f=frames(b);const trailer=f.find(x=>x.flag===128)?.bytes.toString()??null;
     const data=f.find(x=>x.flag===0)?.bytes;
     emit('backend-unary-result',{id,mode,method,trailer,protobuf:method==='GetLatestBlock'?data?.toString('hex'):undefined,sendResponseCode:method==='SendTransaction'?(data?(data[0]===8?(data[1]===0?0:'nonzero'):0):null):undefined});
     if(mode==='rpc-error'){
      if(method!=='GetLatestBlock')throw Error('RPC error fixture only for a unary read');
      kept.delete('grpc-status');kept.delete('grpc-message');
      b=Buffer.concat([...f.filter(x=>x.flag===0).map(x=>frame(x.flag,x.bytes)),frame(128,Buffer.from('grpc-status: 13\r\ngrpc-message: proof-final-error\r\n'))]);
     }
     body=b;
    }else if(body){
     let read=0;
     body=body.pipeThrough(new TransformStream({async transform(b,c){read+=b.length;c.enqueue(b);if(mode==='cancel')await sleep(250);},flush(){upstreamComplete=true;emit('backend-stream-end',{id,mode,method,bytes:read});}}));
    }
    const out=await context.encapsulateResponse(new Response(body,{status:target.status,headers:kept}),{signal});
    let wire=out.body;
    if(['delay-ending','truncate-ending','tamper-ending','relay-cut','cancel'].includes(mode)){
     let last,cut=false;
     wire=wire.pipeThrough(new TransformStream({
      transform(b,c){if(last){c.enqueue(last);if(mode==='relay-cut'&&!cut){cut=true;setTimeout(()=>{emit('relay-interrupt',{id});relay.closeAllConnections();},120);}}last=b;},
      async flush(c){
       if(!last)throw Error('No wire tail');
       if(['delay-ending','relay-cut','cancel'].includes(mode))await sleep(mode==='cancel'?3500:1100);
       emit('gateway-wire-ending',{id,mode,method,bytes:last.length});
       if(mode==='truncate-ending')return;
       if(mode==='tamper-ending'){last=last.slice();last[last.length-1]^=1;}
       c.enqueue(last);
      },
     }));
    }
    res.writeHead(200,{'content-type':MediaType.CHUNKED_RESPONSE});await pipeline(Readable.fromWeb(wire),res,{signal});emit('gateway-response-end',{id,mode,method});
   }catch(e){emit('gateway-error',{id,mode,method,error:e.name,message:String(e.message).slice(0,240),aborted:signal.aborted});if(!res.headersSent){res.writeHead(422);res.end('OHTTP exchange rejected');}else if(!res.destroyed)res.destroy();}
  }),3112);
  relay=await listen(createRelayServer({gatewayUrl:'http://127.0.0.1:3112/ohttp',corsOrigin:'*',maxRequestSize:1024*1024}),3111);
  relay.prependListener('request',(req,res)=>{emit('relay-ingress',{method:req.method,headers:Object.keys(req.headers).sort(),marker:Object.values(req.headers).some(v=>String(v).includes('PROOF-ID-MARKER'))});res.on('close',()=>emit('relay-close',{finished:res.writableFinished}));});
  const dir=path.resolve(dist);
  app=await listen(createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');
   res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
   if(u.pathname==='/proof-config.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(pin));}
   try{const f=path.resolve(dir,decodeURIComponent(u.pathname).slice(1)||'index.html');if(!f.startsWith(dir+path.sep))throw Error();
    const b=await readFile(f);res.setHeader('Content-Type',f.endsWith('.wasm')?'application/wasm':f.endsWith('.html')?'text/html':'application/javascript');res.end(b);
   }catch{res.writeHead(404);res.end();}
  }),3110);
  return {state,wrongPin,badPin:{...pin,sha256:'0'.repeat(64)},release,origin:'http://127.0.0.1:3110'};
 }catch(error){await release();throw error;}
}
