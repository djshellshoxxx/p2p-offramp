import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/transport.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const fn=name=>{assert.equal(typeof api[name],'function',`missing ${name}`);return api[name];};
const request=()=>({channel:'rpc',endpointId:'rpc-main',method:'read'});
const endpoint=()=>({id:'rpc-main',channel:'rpc',url:'https://rpc.example/api',adapterId:'direct-v1',methods:['read','publish']});
const evidence=()=>({channel:'rpc',coverage:'direct',adapterId:'direct-v1',expiresAt:1000});
const grant=()=>({version:1,request:request(),endpoint:endpoint(),evidence:evidence(),directConsent:true});
const invalid=work=>assert.throws(work,error=>error.code==='INVALID_ENDPOINT'&&!error.message.includes('SECRET'));
test('G05 request schema is exact, bounded and excludes the external-wallet channel',()=>{
 const parse=fn('parseTransportRequest');assert.deepEqual(parse(request()),request());
 for(const value of [{...request(),channel:'wallet'},{...request(),channel:'static'},{...request(),method:'send'},{...request(),endpointId:'x'.repeat(65)},{...request(),url:'https://SECRET.invalid'},{...request(),version:2}])invalid(()=>parse(value));
 assert.equal(Object.isFrozen(parse(request())),true);
});
test('G05 trusted grant projection validates registered origins, exact bindings and independent direct consent',()=>{
 const parse=fn('parseTransportGrant');const source=grant(),parsed=parse(source);assert.deepEqual(parsed,source);assert.notEqual(parsed.endpoint.methods,source.endpoint.methods);
 for(const mutate of [g=>g.version=2,g=>g.endpoint.extra='SECRET',g=>g.endpoint.url='http://rpc.example',g=>g.endpoint.url='https://user:SECRET@rpc.example/',g=>g.endpoint.url='https://rpc.example/#fragment',g=>g.endpoint.url='https://rpc.example/'+'x'.repeat(2048),g=>g.endpoint.methods=['read','read'],g=>g.evidence.expiresAt=-1,g=>g.evidence.expiresAt=NaN,g=>g.directConsent='yes',g=>g.evidence.adapterId='other',g=>g.evidence.channel='relay',g=>g.request.endpointId='other',g=>{g.request.method='publish';g.endpoint.methods=['read'];}]){const changed=grant();mutate(changed);invalid(()=>parse(changed));}
 const socket=grant();socket.endpoint.url='wss://relay.example/socket';assert.equal(parse(socket).endpoint.url,socket.endpoint.url);
});
test('G05 evidence remains channel-scoped, immutable and requires finite expiry for positive coverage',()=>{
 const parse=fn('parseTransportEvidence');for(const coverage of ['direct','verified-private'])assert.equal(parse({...evidence(),coverage}).coverage,coverage);
 for(const coverage of ['unknown','unsupported'])assert.equal(parse({...evidence(),coverage,expiresAt:null}).coverage,coverage);
 for(const value of [{...evidence(),coverage:'protected'},{...evidence(),expiresAt:null},{...evidence(),generation:0},{...evidence(),adapterId:'x'.repeat(65)}])invalid(()=>parse(value));
});
test('G05 schemas reject hostile reflection without executing accessors or disclosing supplied diagnostics',()=>{
 const parse=fn('parseTransportGrant');let calls=0;const value=grant();Object.defineProperty(value,'directConsent',{get(){calls++;throw Error('SECRET');}});invalid(()=>parse(value));assert.equal(calls,0);
 const revoked=Proxy.revocable({},{});revoked.revoke();invalid(()=>parse(revoked.proxy));
 const changed=grant();Object.defineProperty(changed.endpoint.methods,0,{get(){calls++;return'read';}});invalid(()=>parse(changed));assert.equal(calls,0);
});
