import {ChunkedOHTTPClient,KeyConfig,MediaType} from 'ohttp-ts';
import {CipherSuite,KEM_DHKEM_X25519_HKDF_SHA256,KDF_HKDF_SHA256,AEAD_AES_128_GCM} from 'hpke';
export const origin='http://wallet-rpc.invalid';
export const rpcPrefix='/cash.z.wallet.sdk.rpc.CompactTxStreamer/';
const relay='http://127.0.0.1:3111/ohttp';
const cap=64*1024*1024;
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const event=(stage,method)=>console.info(JSON.stringify({proof:'ohttp',stage,method,realm:typeof document==='undefined'?'worker':'page',at:Date.now()}));
const suite=()=>new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256,KDF_HKDF_SHA256,AEAD_AES_128_GCM);
export function grpcFrame(flag,data){const out=new Uint8Array(5+data.length);out[0]=flag;new DataView(out.buffer).setUint32(1,data.length);out.set(data,5);return out;}
const validStatus=v=>/^(?:[0-9]|1[0-6])$/.test(v??'');

// Only the 5-byte data header and the bounded terminal frame are staged.
// A clean source EOF here includes the BHTTP decoder's drain and the OHTTP
// decrypt transform's authenticated final-chunk check, not merely BHTTP end.
export function gateGrpc(response,method){
 if(response.status!==200||!/^application\/grpc-web(?:\+proto)?(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('Invalid inner gRPC-web response');
 const headerStatus=response.headers.get('grpc-status');let trailer;
 if(headerStatus!==null){
  if(!validStatus(headerStatus))throw Error('Invalid gRPC header status');
  const fields=['grpc-status','grpc-message','grpc-status-details-bin'].flatMap(k=>response.headers.has(k)?[`${k}: ${response.headers.get(k)}\r\n`]:[]);
  trailer=grpcFrame(128,new TextEncoder().encode(fields.join('')));
 }
 const header=new Uint8Array(5);let used=0,left=0,terminal=false,tailAt=0;
 const stream=(response.body??new ReadableStream({start(c){c.close();}})).pipeThrough(new TransformStream({
  transform(bytes,c){
   let i=0;while(i<bytes.length){
    if(headerStatus!==null||(terminal&&left===0))throw Error('Bytes after gRPC terminal status');
    if(left===0){
     const n=Math.min(5-used,bytes.length-i);header.set(bytes.subarray(i,i+n),used);used+=n;i+=n;
     if(used!==5)continue;used=0;left=new DataView(header.buffer).getUint32(1);
     if(header[0]===128){if(left>65536||left===0)throw Error('Invalid gRPC trailer size');terminal=true;trailer=new Uint8Array(5+left);trailer.set(header);tailAt=5;}
     else{if(header[0]!==0||left>16*1024*1024)throw Error('Unsupported gRPC data frame');c.enqueue(header.slice());}
    }
    if(left){
     const n=Math.min(left,bytes.length-i),part=bytes.subarray(i,i+n);i+=n;left-=n;
     if(terminal){trailer.set(part,tailAt);tailAt+=n;if(left===0)event('trailer-held',method);}else if(n)c.enqueue(part);
    }
   }
  },
  flush(c){
   if(used||left||!trailer)throw Error('Missing or truncated gRPC terminal status');
   const values=new TextDecoder().decode(trailer.subarray(5)).split('\r\n').filter(l=>/^grpc-status:/i.test(l)).map(l=>l.slice(l.indexOf(':')+1).trim());
   if(values.length!==1||!validStatus(values[0]))throw Error('Invalid gRPC trailer status');
   event('authenticated-end',method);c.enqueue(trailer);
  },
 }));
 return new Response(stream,{status:200,headers:{'content-type':'application/grpc-web+proto'}});
}
async function client(config){
 const bytes=Uint8Array.from(atob(config.publicConfig),c=>c.charCodeAt(0));
 if(hex(await crypto.subtle.digest('SHA-256',bytes))!==config.sha256)throw Error('Gateway public configuration pin mismatch');
 const s=suite();return new ChunkedOHTTPClient(s,KeyConfig.select(s,KeyConfig.parseMultiple(bytes)),{maxMessageSize:cap});
}
let pinned;
function bootstrap(){return pinned??=fetch('/proof-config.json',{credentials:'omit',redirect:'error',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Trusted bootstrap missing');return client(await r.json());});}
export async function proofFetch(request,init={},testConfig){
 const url=new URL(request.url),method=url.pathname.slice(rpcPrefix.length);
 if(url.origin!==origin||url.search||url.hash||!url.pathname.startsWith(rpcPrefix)||!/^\w+$/.test(method)||request.method!=='POST')throw Error('Unapproved logical wallet RPC');
 const signal=AbortSignal.any([init.signal??request.signal,AbortSignal.timeout(90000)]);
 const ohttp=testConfig?await client(testConfig):await bootstrap();signal.throwIfAborted();
 const body=await request.arrayBuffer();if(body.byteLength>768*1024)throw Error('RPC upload too large');
 const headers={'content-type':'application/grpc-web+proto','accept':'application/grpc-web+proto','x-grpc-web':'1'};
 const timeout=request.headers.get('grpc-timeout');if(timeout)headers['grpc-timeout']=timeout;
 const inner=new Request(url,{method:'POST',headers,body,signal});
 const sealed=await ohttp.encapsulateRequest(inner,{signal});
 // Wallet RPC uploads are unary and already buffered by tonic-web-wasm-client.
 // Only the bounded upload is collected; Chromium can POST it over HTTP/1.
 const upload=await new Response(sealed.init.body).arrayBuffer();if(upload.byteLength>1024*1024)throw Error('Sealed upload too large');
 event('relay-post',method);
 const outer=await fetch(relay,{method:'POST',headers:{'content-type':MediaType.CHUNKED_REQUEST},body:upload,signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
 if(outer.status!==200)throw Error(`Relay/gateway HTTP ${outer.status}`);
 return gateGrpc(await sealed.context.decapsulateResponse(outer,{signal}),method);
}
export function installProofTransport(){
 if(!Object.hasOwn(globalThis,'__zcashProofOhttpFetch'))Object.defineProperty(globalThis,'__zcashProofOhttpFetch',{value:(request,init)=>proofFetch(request,init)});
}
