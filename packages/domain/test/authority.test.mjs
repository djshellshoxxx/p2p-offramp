import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/authority.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const id = 'ab'.repeat(16);
const binding = {chain:'evm',networkId:'eip155:11155111',deploymentId:'escrow-v1',tradeId:'0x'+'12'.repeat(32)};
const observation=(over={})=>({binding:{...binding},generation:0,requestSequence:1,anchor:{height:'100',hash:'0x'+'34'.repeat(32)},state:'funded',finality:'finalized',observedAt:1000,...over});
const envelope=(source,kind,data,over={})=>({version:1,eventId:Buffer.alloc(32,1).toString('base64url'),binding:{...binding},source,kind,generation:0,sequence:1,observedAt:1000,data,...over});
function create(readValidated, extra={}) { assert.equal(typeof api.createTradeAuthority,'function','missing createTradeAuthority'); return api.createTradeAuthority({binding,generation:0,walletGeneration:0,readValidated,...extra}); }
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
test('restored/local/relay/fiat data cannot promote chain truth or authorize economic actions',()=>{
  const authority=create(async()=>({ok:true,value:observation()}));
  assert.equal(authority.readView(1000).chain,null); assert.equal(authority.readView(1000).chainHealth,'loading');
  for(const source of ['relay','journal','wallet','chain']) assert.equal(authority.dispatchLocal(envelope(source,'chain-snapshot',observation())),'invalid');
  authority.setFiatClaim('buyer-claims-paid'); assert.equal(authority.readView(1000).fiatClaim,'buyer-claims-paid');
  assert.equal(authority.readView(1000).chain,null); assert.equal(authority.economicPreparationAllowed(),false); assert.equal(api.RELEASE_ENABLED,0);
  authority.setFiatClaim('seller-attests-received'); assert.equal(authority.readView(1000).chain,null); authority.dispose();
});
test('only latest issued reconciliation can mutate chain, without treating sequence as fork choice',async()=>{
  const a=deferred(),b=deferred(); let issued=0;
  const authority=create(async(_binding,request)=>{issued++;return (issued===1?a:b).promise;});
  const first=authority.refresh(binding), second=authority.refresh(binding);
  b.resolve({ok:true,value:observation({requestSequence:2})}); assert.equal((await second).ok,true);
  a.resolve({ok:true,value:observation({state:'released'})}); assert.equal((await first).error.code,'CANCELLED');
  assert.equal(authority.readView(1000).chain.state,'funded'); authority.dispose();
});
test('reconciliation rejects mismatched binding, generation and request sequence',async()=>{
  for(const over of [{binding:{...binding,networkId:'other'}},{generation:1},{requestSequence:2}]) {
    const authority=create(async()=>({ok:true,value:observation(over)}));
    const result=await authority.refresh(binding); assert.equal(result.ok,false); assert.equal(authority.readView(1000).chain,null); authority.dispose();
  }
});
test('display freshness is stale exactly at30seconds and never authorizes preparation',async()=>{
  const authority=create(async()=>({ok:true,value:observation()})); await authority.refresh(binding);
  assert.equal(authority.readView(30999).chainHealth,'fresh'); assert.equal(authority.readView(31000).chainHealth,'stale');
  assert.equal(authority.readView(999).chainHealth,'stale'); assert.equal(authority.economicPreparationAllowed(),false); authority.dispose();
});
test('contradictory state/anchor/finality latches reorged until another canonical read agrees',async()=>{
  const cases=[observation({state:'refunded',anchor:{height:'101',hash:'new'}}),observation({anchor:{height:'100',hash:'different'}}),observation({anchor:{height:'99',hash:'lower'}}),observation({finality:'pending'})];
  for(const conflict of cases){let call=0;const original=observation({state:'released'});
    const authority=create(async(_binding,request)=>({ok:true,value:{...(++call===1?original:conflict),requestSequence:request.requestSequence}}));
    await authority.refresh(binding); await authority.refresh(binding);
    assert.equal(authority.readView(1000).chainHealth,'reorged'); assert.equal(authority.readView(1000).chain.state,'released');
    assert.ok(authority.readConflict()); assert.equal(authority.economicPreparationAllowed(),false);
    await authority.refresh(binding); assert.equal(authority.readView(1000).chainHealth,'fresh'); assert.equal(authority.readConflict(),null); authority.dispose();
  }
});
test('wallet invalidation cancels stale async observations but retains journal references and bumps generation',async()=>{
  const gate=deferred(); let signal;
  const authority=create(async(_binding,request)=>{signal=request.signal;return gate.promise;});
  const task=authority.refresh(binding);
  assert.equal(authority.dispatchLocal(envelope('wallet','wallet-invalidated',{walletGeneration:1})),'accepted');
  assert.equal(signal.aborted,true); assert.equal(authority.readView(1000).walletGeneration,1); assert.equal(authority.currentGeneration,1);
  gate.resolve({ok:true,value:observation()}); assert.equal((await task).error.code,'CANCELLED'); assert.equal(authority.readView(1000).chain,null); authority.dispose();
});
test('cancel/dispose return immediately and discard late adapter results',async()=>{
  const gate=deferred(),abort=new AbortController(); const authority=create(()=>gate.promise);
  const task=authority.refresh(binding,abort.signal); abort.abort(); assert.equal((await task).error.code,'CANCELLED');
  gate.resolve({ok:true,value:observation()}); await Promise.resolve(); assert.equal(authority.readView(1000).chain,null);
  authority.dispose(); assert.equal((await authority.refresh(binding)).error.code,'CANCELLED');
});
test('returned snapshots and bindings are defensive copies and internal data is immutable',async()=>{
  const authority=create(async()=>({ok:true,value:observation()})); await authority.refresh(binding);
  const view=authority.readView(1000); assert.throws(()=>{view.chain.state='released';}); assert.throws(()=>{view.binding.networkId='other';});
  assert.equal(authority.readView(1000).chain.state,'funded'); authority.dispose();
});
test('Solana observations retain decimal heights without number casts or fabricated parity claims',async()=>{
  const solana={chain:'solana',networkId:'solana:devnet',deploymentId:'escrow-v1',tradeId:'test-trade'};
  const authority=create(async(_binding,request)=>({ok:true,value:observation({binding:solana,requestSequence:request.requestSequence,anchor:{height:'18446744073709551615',hash:'solana-block'}})}),{binding:solana});
  assert.equal((await authority.refresh(solana)).ok,true); assert.equal(authority.readView(1000).chain.anchor.height,'18446744073709551615'); authority.dispose();
});

test('generation resets cannot recycle outstanding-reader slots or delete a newer request',async()=>{
  const gates=[]; const authority=create(()=>{const gate=deferred();gates.push(gate);return gate.promise;});
  const tasks=[];
  for(let i=0;i<4;i++) { tasks.push(authority.refresh(binding)); assert.equal(authority.invalidate(binding).ok,true); }
  const refused=authority.refresh(binding); assert.equal(gates.length,4,'fifth underlying reader must not start'); assert.equal((await refused).error.code,'LIMIT_EXCEEDED');
  gates[0].resolve({ok:true,value:observation()}); await Promise.resolve(); await Promise.resolve();
  const next=authority.refresh(binding); assert.equal(gates.length,5);
  assert.equal((await authority.refresh(binding)).error.code,'LIMIT_EXCEEDED');
  authority.dispose(); await Promise.all([...tasks,next]);
  for(const gate of gates)gate.resolve({ok:true,value:observation()});
});
test('an old-generation completion cannot delete the current abort controller',async()=>{
 const gates=[],signals=[];const authority=create((_binding,request)=>{const gate=deferred();gates.push(gate);signals.push(request.signal);return gate.promise;});
 const old=authority.refresh(binding);authority.invalidate(binding);const current=authority.refresh(binding);
 gates[0].resolve({ok:true,value:observation()});await Promise.resolve();await Promise.resolve();
 const latest=authority.refresh(binding);assert.equal(signals[1].aborted,true,'supersession must still reach the current controller');
 authority.dispose();await Promise.all([old,current,latest]);for(const gate of gates)gate.resolve({ok:true,value:observation()});
});
test('a contradictory reconciliation reports integrity failure rather than successful preflight evidence',async()=>{
 let count=0;const authority=create(async(_binding,request)=>({ok:true,value:observation({requestSequence:request.requestSequence,state:++count===1?'released':'refunded',anchor:{height:String(100+count),hash:'block'+count}})}));
 assert.equal((await authority.refresh(binding)).ok,true);const conflict=await authority.refresh(binding);
 assert.equal(conflict.ok,false);assert.equal(conflict.error.code,'INTEGRITY_FAILURE');assert.equal(authority.readView(1000).chainHealth,'reorged');authority.dispose();
});
