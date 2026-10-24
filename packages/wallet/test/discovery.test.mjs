import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/discovery.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const err=(result,code)=>{assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET|https:\/\//);};
const provider=()=>({request(){throw Error('discovery must never request');}});
const info=(n=1)=>({uuid:`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`,name:`Wallet ${n}`,rdns:'org.example.wallet',icon:'https://SECRET.invalid/icon.svg'});
class Target extends EventTarget{
 added=0;removed=0;requests=0;
 addEventListener(type,...args){if(type==='eip6963:announceProvider')this.added++;return super.addEventListener(type,...args);}
 removeEventListener(type,...args){if(type==='eip6963:announceProvider')this.removed++;return super.removeEventListener(type,...args);}
 dispatchEvent(event){if(event.type==='eip6963:requestProvider')this.requests++;return super.dispatchEvent(event);}
 announce(port,metadata=info()){this.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:metadata,provider:port}}));}
}
function setup(t,options={}){assert.equal(typeof api.createWalletDiscovery,'function','missing explicit wallet discovery');t.mock.timers.enable({apis:['setTimeout']});const target=new Target();let clock=0;const discovery=api.createWalletDiscovery({target,now:()=>clock,...options});return{target,discovery,advance(ms){clock+=ms;t.mock.timers.tick(ms);}};}
test('construction performs zero discovery; explicit call listens before one broadcast and completes at exactly 3 seconds',async t=>{
 const s=setup(t);assert.equal(s.target.added,0);assert.equal(s.target.requests,0);const port=provider();s.target.addEventListener('eip6963:requestProvider',()=>s.target.announce(port));
 const pending=s.discovery.discover();assert.equal(s.target.requests,1);s.advance(2999);let done=false;void pending.then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);s.advance(1);
 const [choice]=val(await pending);assert.equal(choice.brandTrust,'unverified');assert.deepEqual(choice.info,{uuid:info().uuid,name:'Wallet 1',rdns:'org.example.wallet'});assert.equal(choice.handle.purpose,'wallet-discovery');assert.equal(s.discovery.isCurrent(choice.handle),true);assert.equal(s.discovery.isCurrent({...choice.handle}),false);assert.equal(s.target.added,s.target.removed);assert.deepEqual(Reflect.ownKeys(s.discovery),[]);s.discovery.dispose();
});
test('only exact provider identity deduplicates; claimed UUID does not merge distinct providers',async t=>{
 const s=setup(t),a=provider(),b=provider(),pending=s.discovery.discover();s.target.announce(a);s.target.announce(a,info(2));s.target.announce(b);s.advance(3000);const choices=val(await pending);assert.equal(choices.length,2);assert.notEqual(choices[0].handle.id,choices[1].handle.id);assert.equal(choices[0].info.uuid,choices[1].info.uuid);s.discovery.dispose();
});
test('repeat discovery is explicit, revokes old handles and retains weak document identity across owners',async t=>{
 const s=setup(t),port=provider();let pending=s.discovery.discover();s.target.announce(port);s.advance(3000);const first=val(await pending)[0];pending=s.discovery.discover();assert.equal(s.discovery.isCurrent(first.handle),false);s.target.announce(port);s.advance(3000);const second=val(await pending)[0];assert.equal(second.handle.id,first.handle.id);assert.ok(second.handle.generation>first.handle.generation);
 let otherClock=6000;const other=api.createWalletDiscovery({target:s.target,now:()=>otherClock}),third=other.discover();s.target.announce(port);otherClock=9000;t.mock.timers.tick(3000);assert.equal(val(await third)[0].handle.id,first.handle.id);assert.equal(other.isCurrent(second.handle),false);other.dispose();s.discovery.dispose();
});
test('max 16 providers per window with bounded processing; later explicit rounds can discover new identities',async t=>{
 const s=setup(t);let pending=s.discovery.discover();for(let n=1;n<=20;n++)s.target.announce(provider(),info(n));s.advance(3000);assert.equal(val(await pending).length,16);
 pending=s.discovery.discover();s.target.announce(provider(),info(30));s.advance(3000);assert.equal(val(await pending).length,1);s.discovery.dispose();
});
test('announcement storms stop bounded work and clean up with a fixed limit failure',async t=>{
 const s=setup(t),pending=s.discovery.discover(),port=provider();for(let n=0;n<65;n++)s.target.announce(port);err(await pending,'LIMIT_EXCEEDED');assert.equal(s.target.added,s.target.removed);s.discovery.dispose();
});
test('icons and extensible metadata are never read, copied, parsed or exposed',async t=>{
 const s=setup(t),metadata=info();let touched=0;Object.defineProperty(metadata,'icon',{get(){touched++;throw Error('SECRET icon');}});Object.defineProperty(metadata,'extension',{get(){touched++;throw Error('SECRET extension');}});
 const pending=s.discovery.discover();s.target.announce(provider(),metadata);s.advance(3000);const choices=val(await pending);assert.equal(choices.length,1);assert.equal(touched,0);assert.doesNotMatch(JSON.stringify(choices),/SECRET|icon|provider|request|https:\/\//);s.discovery.dispose();
});
test('malformed public metadata never invokes getters or becomes a wallet choice',async t=>{
 const s=setup(t),pending=s.discovery.discover();let touched=0;
 for(const metadata of [{...info(),uuid:'invalid'},{...info(),name:'<svg onload=SECRET>'},{...info(),name:'x'.repeat(129)},{...info(),rdns:'https://SECRET.invalid'},Object.defineProperty(info(),'name',{get(){touched++;throw Error('SECRET');}})])s.target.announce(provider(),metadata);
 s.advance(3000);assert.deepEqual(val(await pending),[]);assert.equal(touched,0);s.discovery.dispose();
});
test('unsafe request inspection fails closed without invoking accessors, methods or foreign exceptions',async t=>{
 const s=setup(t);let touched=0;const revoked=Proxy.revocable({},{});revoked.revoke();
 for(const port of [Object.defineProperty({},'request',{get(){touched++;throw Error('SECRET');}}),Object.create({request(){touched++;}}),revoked.proxy,new Proxy({},{getOwnPropertyDescriptor(){throw revoked.proxy;}})]){
  const pending=s.discovery.discover();s.target.announce(port);err(await pending,'UNSUPPORTED_PROVIDER');assert.equal(touched,0);
 }
 assert.equal(s.target.added,s.target.removed);s.discovery.dispose();
});
test('already-cancelled, active cancellation and disposal suppress results and clean up terminally',async t=>{
 const s=setup(t),controller=new AbortController();controller.abort();err(await s.discovery.discover(controller.signal),'CANCELLED');assert.equal(s.target.requests,0);
 const live=new AbortController(),pending=s.discovery.discover(live.signal);s.target.announce(provider());live.abort();err(await pending,'CANCELLED');assert.equal(s.target.added,s.target.removed);
 const disposing=s.discovery.discover();s.discovery.dispose();s.discovery.dispose();err(await disposing,'CANCELLED');s.target.announce(provider());s.advance(3000);err(await s.discovery.discover(),'CANCELLED');assert.equal(s.target.added,s.target.removed);
});
test('late announcements, clock failure and concurrent calls cannot publish stale results',async t=>{
 const s=setup(t);const pending=s.discovery.discover();err(await s.discovery.discover(),'CONFLICT');s.advance(3000);s.target.announce(provider());assert.deepEqual(val(await pending),[]);s.discovery.dispose();
 const target=new Target();let clock=1;const discovery=api.createWalletDiscovery({target,now:()=>clock}),invalid=discovery.discover();clock=0;target.announce(provider());err(await invalid,'UNAVAILABLE');assert.equal(target.added,target.removed);discovery.dispose();
});
test('completion publication rechecks clock and generation after the timer resolves',async t=>{
 const s=setup(t),pending=s.discovery.discover();s.advance(3000);const replacement=s.discovery.discover();err(await pending,'CANCELLED');s.advance(3000);assert.deepEqual(val(await replacement),[]);s.discovery.dispose();
 const target=new Target();let clock=0;const discovery=api.createWalletDiscovery({target,now:()=>clock}),backward=discovery.discover();target.announce(provider());clock=3000;t.mock.timers.tick(3000);clock=2999;err(await backward,'UNAVAILABLE');discovery.dispose();
});
test('throwing event port and random source failures stay fixed and clean up without wallet calls',async t=>{
 const s=setup(t),revoked=Proxy.revocable({},{});revoked.revoke();
 const original=s.target.dispatchEvent;s.target.dispatchEvent=()=>{throw revoked.proxy;};err(await s.discovery.discover(),'UNAVAILABLE');assert.equal(s.target.added,s.target.removed);s.target.dispatchEvent=original;
 const random=crypto.getRandomValues;
 try{const pending=s.discovery.discover();crypto.getRandomValues=function(bytes){if(bytes.length===32)throw revoked.proxy;return random.call(crypto,bytes);};s.target.announce(provider());err(await pending,'UNAVAILABLE');assert.equal(s.target.added,s.target.removed);}
 finally{crypto.getRandomValues=random;s.discovery.dispose();}
});
test('diagnostic RNG fallback cannot mint a weak provider capability when all entropy fails',async t=>{
 const s=setup(t),random=crypto.getRandomValues,revoked=Proxy.revocable({},{});revoked.revoke();
 try{
  crypto.getRandomValues=()=>{throw revoked.proxy;};
  const pending=s.discovery.discover();s.target.announce(provider());
  err(await pending,'UNAVAILABLE');assert.equal(s.target.added,s.target.removed);
  assert.equal(s.discovery.isCurrent({id:'0'.repeat(32),generation:1,purpose:'wallet-discovery'}),false);
 }finally{crypto.getRandomValues=random;s.discovery.dispose();}
});
