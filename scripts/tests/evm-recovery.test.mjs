import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registryFixture } from '../../packages/security/test/lib/release-registry-fixture.mjs';
import { sha } from '../../packages/security/test/lib/release-fixture.mjs';
import { verifyRelease } from '../../packages/security/src/release-manifest.ts';
const api = await import('../recovery/evm-recovery.mjs').catch(() => ({}));
const builder = await import('../recovery/build-evm.mjs').catch(() => ({}));
const temporary = await mkdtemp(resolve(tmpdir(), 'evm-recovery-unit-'));
test.after(() => rm(temporary, { recursive: true, force: true }));
const abiPath = 'contracts/evm/abi/BasicEscrow.json', abiBytes = new Uint8Array(await readFile(new URL('../../contracts/evm/abi/BasicEscrow.json', import.meta.url)));
const word = value => BigInt(value).toString(16).padStart(64, '0');
const H = '0x'+'12'.repeat(32), L = '0x'+'13'.repeat(32), SELLER = '0x'+'31'.repeat(20), BUYER = '0x'+'32'.repeat(20), ZERO = '0x'+'0'.repeat(40);
let built;
async function fixture() {
  assert.equal(typeof builder.buildEvmRecoveryPackage, 'function');
  if (built) return built;
  const f = registryFixture({ editManifest: m => { m.assets.push({ path: abiPath, bytes: abiBytes.length, sha256: sha(abiBytes) }); m.assets.sort((a,b)=>a.path < b.path ? -1 : 1); } });
  f.assets.push({ path: abiPath, bytes: abiBytes });
  const checked = await verifyRelease(f.bytes, f.envelope, [f.key], 0, f.options);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  const options = { verifiedRelease: checked.value, registryPath: f.registryPath, registryBytes: f.registryBytes, abiPath, abiBytes,
    networkId: 'local-evm', deploymentId: 'escrow-fixture', outDir: resolve(temporary, 'package') };
  built = { ...(await builder.buildEvmRecoveryPackage(options)), options }; return built;
}
function rpc(profile, patch = {}) {
  const registry = JSON.parse(Buffer.from(profile.registry.bytes, 'base64url')), network = registry.networks[0];
  const calls = [], state = { phase: 1, timestamp: 1500, code: '0x6000', anchor: L, ...patch };
  const request = async ({ method, params = [] }) => {
    calls.push({ method, params });
    if (state.intercept) { const answer = state.intercept(method, params, state); if (answer !== undefined) return answer; }
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_getBlockByNumber') return params[0] === '0x0' ? { number: '0x0', hash: network.genesisHash, timestamp: '0x0' } :
      params[0] === 'latest' || params[0] === '0x11' ? { number: '0x11', hash: state.anchor, timestamp: `0x${state.timestamp.toString(16)}` } : { number: '0x10', hash: H, timestamp: '0x500' };
    if (method === 'eth_getCode') return state.code;
    if (method === 'eth_call') return params[0].data.startsWith('0x'+state.pendingSelector) ? '0x'+word(state.credit ?? 0) :
      '0x'+[SELLER, 2000, state.phase, BUYER, ZERO, 1000].map(word).join('');
    throw Error('PRIVATE provider error');
  };
  return { request, calls, state };
}
test('builder requires original live proof and exact authenticated canonical ABI before emitting a package', async () => {
  const f = await fixture();
  assert.ok(f.files.some(file => file.path === 'recover.mjs'));
  for (const change of [{ verifiedRelease: { ...f.options.verifiedRelease } }, { registryBytes: new Uint8Array([1]) }, { abiBytes: new Uint8Array([1]) }, { abiPath: 'other.json' }])
    await assert.rejects(builder.buildEvmRecoveryPackage({ ...f.options, ...change, outDir: resolve(temporary, 'bad') }));
});
test('recovery uses stored latest immutable fields and creates only bound unsigned exits', async () => {
  assert.equal(typeof api.prepareEvmRecovery, 'function');
  const f = await fixture(), { keccak256 } = await import('../../packages/wallet/src/evm-terms.ts');
  // The signed synthetic profile pins the small controlled runtime used below.
  const profile = structuredClone(f.profile), raw = JSON.parse(Buffer.from(profile.registry.bytes, 'base64url'));
  raw.networks[0].deployments[0].runtime.keccak256 = Buffer.from(keccak256(Buffer.from('6000','hex'))).toString('hex');
  const bytes = Buffer.from(JSON.stringify(raw)); profile.registry.bytes = bytes.toString('base64url'); profile.registry.sha256 = sha(bytes);
  const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-fixture', tradeId: 'ab'.repeat(32) };
  const options = { profile, binding, endpointId: 'loopback-fixture' };
  const p = rpc(profile), release = await api.prepareEvmRecovery({ ...options, request: p.request, action: 'release', from: SELLER });
  assert.equal(release.trade.buyer, BUYER); assert.equal(release.trade.amount, '1000'); assert.equal(release.transaction.from, SELLER);
  assert.equal(release.transaction.to, raw.networks[0].deployments[0].address); assert.equal(release.transaction.value, '0x0');
  assert.equal(release.transaction.data, '0x67d42a8b'+'ab'.repeat(32));
  assert.equal(release.historicalOnly, true); assert.equal(release.releaseEnabled, false);
  await assert.rejects(api.prepareEvmRecovery({ ...options, request: p.request, action: 'release', from: BUYER }));
  p.state.timestamp = 2000;
  await assert.rejects(api.prepareEvmRecovery({ ...options, request: p.request, action: 'release', from: SELLER }));
  const refund = await api.prepareEvmRecovery({ ...options, request: p.request, action: 'refund', from: BUYER });
  assert.equal(refund.transaction.data, '0x7249fbb6'+'ab'.repeat(32));
  assert.ok(p.calls.every(call => ['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(call.method)));
  await assert.rejects(api.inspectEvmRecovery({ ...options, request: p.request, endpointId: 'unregistered' }));
  await assert.rejects(api.inspectEvmRecovery({ ...options, request: p.request, binding: { ...binding, deploymentId: 'other' } }));
  p.state.intercept = (method, params, state) => { if (method === 'eth_call') state.anchor = H; };
  await assert.rejects(api.inspectEvmRecovery({ ...options, request: p.request }));
});
test('asynchronous caller mutation cannot replace the deployment, binding or release sender after native inspection', async () => {
  const f = await fixture(), { keccak256 } = await import('../../packages/wallet/src/evm-terms.ts');
  const profile = structuredClone(f.profile), raw = JSON.parse(Buffer.from(profile.registry.bytes, 'base64url'));
  raw.networks[0].deployments[0].runtime.keccak256 = Buffer.from(keccak256(Buffer.from('6000','hex'))).toString('hex');
  const setRegistry = () => { const bytes=Buffer.from(JSON.stringify(raw)); profile.registry.bytes=bytes.toString('base64url'); profile.registry.sha256=sha(bytes); };
  setRegistry();
  const binding = { chain:'evm',networkId:'local-evm',deploymentId:'escrow-fixture',tradeId:'ab'.repeat(32) }, original=raw.networks[0].deployments[0].address;
  const p=rpc(profile), options={profile,binding,endpointId:'loopback-fixture',request:p.request,action:'release',from:SELLER};
  let mutated=false;
  p.state.intercept = method => {
    if (method === 'eth_call' && !mutated) {
      mutated=true; raw.networks[0].deployments[0].address='0x'+'42'.repeat(20); setRegistry();
      binding.tradeId='cd'.repeat(32); options.from=BUYER; options.action='refund';
    }
  };
  const value = await api.prepareEvmRecovery(options);
  assert.equal(mutated,true); assert.equal(value.transaction.to,original); assert.equal(value.transaction.from,SELLER);
  assert.equal(value.transaction.data,'0x67d42a8b'+'ab'.repeat(32)); assert.equal(value.binding.tradeId,'ab'.repeat(32));
});
test('cancellation during the latest native read rejects promptly and never continues late reads', async () => {
  const f=await fixture(), {keccak256}=await import('../../packages/wallet/src/evm-terms.ts');
  const profile=structuredClone(f.profile), raw=JSON.parse(Buffer.from(profile.registry.bytes,'base64url'));
  raw.networks[0].deployments[0].runtime.keccak256=Buffer.from(keccak256(Buffer.from('6000','hex'))).toString('hex');
  const bytes=Buffer.from(JSON.stringify(raw));profile.registry.bytes=bytes.toString('base64url');profile.registry.sha256=sha(bytes);
  const p=rpc(profile), controller=new AbortController(); let entered, release;
  const held=new Promise(done=>release=done), started=new Promise(done=>entered=done);
  p.state.intercept=(method,params)=>{if(method==='eth_getBlockByNumber'&&params[0]==='latest'){entered();return held;}};
  const pending=api.inspectEvmRecovery({profile,binding:{chain:'evm',networkId:'local-evm',deploymentId:'escrow-fixture',tradeId:'ab'.repeat(32)},endpointId:'loopback-fixture',request:p.request,signal:controller.signal});
  await started; const before=p.calls.length; controller.abort();
  let timer;
  try {
    await assert.rejects(Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cancellation did not stop the owned read')),100);})]),error=>error.code==='CANCELLED');
  } finally { clearTimeout(timer); release({number:'0x11',hash:L,timestamp:'0x5dc'}); }
  await pending.catch(()=>undefined); await new Promise(done=>setImmediate(done)); assert.equal(p.calls.length,before);
});
test('portable CLI refuses a FIFO reference without waiting for a writer', async () => {
  const f=await fixture(), fifo=resolve(temporary,'reference.fifo'), run=promisify(execFile);
  await run('mkfifo',[fifo]);
  let result;
  try { result=await run(process.execPath,[f.executable,'inspect','--endpoint','loopback-fixture','--reference',fifo,'--item','0'],{timeout:1000,env:{PATH:process.env.PATH??'',TZ:'UTC'}}); }
  catch(error){result=error;}
  assert.notEqual(result.killed,true,'bounded input must reject non-regular files before waiting on them');
  assert.equal(result.code,1); assert.equal(JSON.parse(result.stdout).ok,false);
  assert.doesNotMatch(result.stdout,/reference\.fifo|PRIVATE/);
});
