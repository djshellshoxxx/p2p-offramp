import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
const source = stripTypeScriptTypes(readFileSync(new URL('../../../packages/exchange/src/exchange.ts', import.meta.url), 'utf8')).replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/export /g, '');
const self='a'.repeat(64), seller='b'.repeat(64), order='c'.repeat(64);
const bindings = {
 reviewTermsBytes: async()=>{throw Error('not used')},
 createGiftWrap: async()=>({id:'wrap'}), createSeal:async()=>({}), createUnsignedEvent:()=>({id:'rumor'}), unwrapGiftWrap:async()=>({rumor:{kind:14,pubkey:self,id:'own'}}),
 KIND_PRIVATE_DIRECT_MESSAGE:14, MAX_RUMOR_JSON_BYTES:65536,
 transition:()=>null, isTerminal:()=>false,
 adAddress:(a,o)=>`${a}:${o}`, adBookKey:()=>'', encodeEnvelope:JSON.stringify,envelopeTags:()=>[],
 isEvmAddress:x=>/^0x[0-9a-f]{40}$/.test(x),isHex64:x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x),
 MAX_ENVELOPE_BYTES:24576,MAX_FUTURE_SKEW_SECONDS:120,MAX_MESSAGE_LIFETIME_SECONDS:3600,MAX_OFFER_TERMS_BYTES:16384,parseAdAddress:()=>null,parseEnvelope:()=>null
};
const create = new Function(...Object.keys(bindings), source+'\nreturn createTermsExchange;')(...Object.values(bindings));
for (const operation of ['take','receive']) {
 let release, entered;
 const reached=new Promise(r=>entered=r), gate=new Promise(r=>release=r);
 const provider={publicKey:async()=>{entered();await gate;return self;}};
 const ex=create({provider,selfPublicKey:self,registry:{},hashTerms:()=>'',now:()=>100,ads:{revalidate:()=>({ok:true,ad:{author:seller,ad:{maker:seller,orderId:order,expiresAtSeconds:'1000',amountMin:'1',amountMax:'2'}}})}});
 const pending=operation==='take'?ex.take('ad','0x'+'1'.repeat(40),new Uint8Array(32)):ex.receive({},new Uint8Array(32));
 await reached; ex.close();release();const result=await pending;
 console.log(JSON.stringify({operation,result,sessionCount:ex.sessionCount}));
 assert.deepEqual(result,{ok:false,code:'CLOSED'});assert.equal(ex.sessionCount,0);
}
