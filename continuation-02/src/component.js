import {proofFetch,origin,rpcPrefix,grpcFrame} from './proof-adapter.js';
const concat=(...parts)=>{const a=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let i=0;for(const b of parts){a.set(b,i);i+=b.length;}return a;};
function vint(n){let b=[];while(n>=128){b.push((n&127)|128);n=Math.floor(n/128);}return Uint8Array.from([...b,n]);}
function nested(tag,data){return concat(Uint8Array.of(tag),vint(data.length),data);}
export async function component({start,end,config,cancel=false,txid,block}={}){
 const method=start?'GetBlockRange':txid?'GetTransaction':block?'GetBlock':'GetLatestBlock';
 const msg=start?concat(nested(10,concat(Uint8Array.of(8),vint(start))),nested(18,concat(Uint8Array.of(8),vint(end))))
  :txid?nested(26,Uint8Array.from(txid.match(/../g).reverse().map(x=>parseInt(x,16))))
  :block?concat(Uint8Array.of(8),vint(block)):new Uint8Array();
 const controller=new AbortController();const started=Date.now();let first=null,received=0,terminal=null,records=0,recordHex=null;let buffer=new Uint8Array();
 try{
  const result=await proofFetch(new Request(origin+rpcPrefix+method,{method:'POST',body:grpcFrame(0,msg)}),{signal:controller.signal},config);
  const reader=result.body.getReader();
  try{for(;;){const {value,done}=await reader.read();if(done)break;
   if(first===null){first=Date.now();if(cancel)controller.abort(Error('Proof caller cancelled'));}
   received+=value.length;if(received>16*1024*1024)throw Error('Diagnostic receive limit');
   buffer=concat(buffer,value);
   while(buffer.length>=5){const n=new DataView(buffer.buffer).getUint32(1);if(buffer.length<5+n)break;
    if(buffer[0]===128)terminal=new TextDecoder().decode(buffer.subarray(5,5+n));
    else{records++;if(txid||block)recordHex=Array.from(buffer.subarray(5,5+n),b=>b.toString(16).padStart(2,'0')).join('');}
    buffer=buffer.slice(5+n);
   }
  }}finally{reader.releaseLock();}
  return {method,started,first,finished:Date.now(),received,records,terminal,error:null,recordHex};
 }catch(e){return {method,started,first,finished:Date.now(),received,records,terminal,error:String(e)};}
}
globalThis.component=component;
