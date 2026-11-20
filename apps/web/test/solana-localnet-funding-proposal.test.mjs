import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeSolanaTerms, sha256Hex } from '../../../packages/domain/index.ts';
import { encodeBase64url, decodeBase64url } from '../../../packages/schemas/index.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { openEnvelope, disposeMaterial } from '../../../packages/storage/src/vault-crypto.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { SolanaRecoveryController } from '../src/solana-localnet/controller.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { configOption } from './solana-localnet-support.mjs';
import { setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { makeTerms, key } from '../../../packages/chain-solana/test/support.mjs';
import { createRecoveryDocument } from '../../../packages/chain-solana/src/recovery.ts';

const api = await import('../src/solana-localnet/funding-proposal.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
});
const FORMAT = 'p2p-offramp/solana-local-funding-proposal/v1';
const RECORD = 'p2p-offramp/solana-local-funding-proposal-record/v1';
const PROFILE = '12'.repeat(16), PASS = 'synthetic proposal profile passphrase';
const enc = new TextEncoder(), json = value => enc.encode(JSON.stringify(value));
const proposal = (changes = {}) => ({ format: FORMAT, terms: makeTerms('native', changes) });
const required = name => { assert.equal(typeof api[name], 'function', `missing ${name}`); return api[name]; };
const parse = bytes => required('parseSolanaFundingProposal')(bytes);
const create = (...args) => required('createSolanaFundingProposalRecord')(...args);
const decode = record => required('decodeSolanaFundingProposalRecord')(record);
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const invalid = operation => assert.rejects(operation, error => ['INVALID_INPUT', 'UNSUPPORTED_VERSION',
  'LIMIT_EXCEEDED', 'WRONG_CHAIN', 'INTEGRITY_FAILURE'].includes(error.code));
const configFor = async (terms = makeTerms()) => parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption(network => {
  network.genesisHash = network.chainIdentity = terms.genesisHash;
  network.deployments[0].address = terms.programId;
})));
const config = await configFor();
const body = record => JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 8192)));
const edited = (record, change) => { const value = body(record); change(value); return { ...record, payload: encodeBase64url(json(value)) }; };

test('proposal fixture is a complete maintained G16 native term set', async () => {
  const terms = proposal().terms;
  assert.equal(Object.keys(terms).length, 15);
  assert.equal(await sha256Hex(encodeSolanaTerms(terms)), createHash('sha256').update(encodeSolanaTerms(terms)).digest('hex'));
});
test('proposal exports fixed format and decoded byte bounds', () => {
  assert.equal(api.SOLANA_FUNDING_PROPOSAL_FORMAT, FORMAT);
  assert.equal(api.SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT, RECORD);
  assert.equal(api.MAX_SOLANA_FUNDING_PROPOSAL_BYTES, 4096);
  assert.equal(api.MAX_SOLANA_FUNDING_PROPOSAL_RECORD_BYTES, 8192);
});
test('proposal preserves every G16 field and uses canonical binary terms identity', async () => {
  const input = proposal(), parsed = await parse(json(input));
  assert.deepEqual(parsed.document, input);
  assert.equal(parsed.termsHash, await sha256Hex(encodeSolanaTerms(input.terms)));
  assert.notEqual(parsed.termsHash, await sha256Hex(json(input)));
  assert.deepEqual(Object.keys(parsed.document), ['format', 'terms']);
  assert.deepEqual(Object.keys(parsed.document.terms), Object.keys(input.terms).sort());
  assert.deepEqual(Object.keys(parsed), ['document', 'termsHash']);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.document) && Object.isFrozen(parsed.document.terms));
});
test('ordinary JSON layouts normalize to the same compact frozen document and hash', async () => {
  const input = proposal(), reversed = { terms: Object.fromEntries(Object.entries(input.terms).reverse()), format: FORMAT };
  const first = await parse(json(input)), second = await parse(enc.encode(' \n' + JSON.stringify(reversed, null, 2) + '\t'));
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(first.document), JSON.stringify(second.document));
  assert.ok(!JSON.stringify(first.document).endsWith('\n'));
});
test('parse snapshots caller bytes before the first asynchronous hash', async () => {
  const bytes = json(proposal()), expected = json(proposal()), pending = parse(bytes);
  bytes.fill(0);
  assert.deepEqual((await pending).document, JSON.parse(new TextDecoder().decode(expected)));
});
test('public byte bound includes whitespace and ignores a caller byteLength accessor', async () => {
  const text = JSON.stringify(proposal()), bytes = enc.encode(text.padEnd(4096, ' '));
  let reads = 0; Object.defineProperty(bytes, 'byteLength', { get() { reads++; throw Error('getter'); } });
  assert.deepEqual((await parse(bytes)).document.terms, proposal().terms);
  await invalid(() => parse(enc.encode(text.padEnd(4097, ' ')))); assert.equal(reads, 0);
});
test('parsing makes no time, native policy, funding outcome or acceptance claim', async () => {
  const parsed = await parse(json(proposal({ capabilitiesHash: '00'.repeat(32), acceptBeforeSeconds: '0', escrowExpirySeconds: '0' })));
  assert.equal(parsed.document.terms.capabilitiesHash, '00'.repeat(32));
  assert.deepEqual(Object.keys(parsed), ['document', 'termsHash']);
  assert.ok(!/accepted|funded|canFund|confirmationAuthority/.test(JSON.stringify(parsed)));
});
for (const [name, bytes] of [
  ['empty', new Uint8Array()], ['oversize', new Uint8Array(4097)], ['bad UTF-8', new Uint8Array([0xc0, 0xaf])],
  ['BOM', Uint8Array.from([0xef, 0xbb, 0xbf, ...json(proposal())])],
  ['duplicate key', enc.encode(JSON.stringify(proposal()).replace('"format":', '"format":"ignored","format":'))],
  ['prototype key', enc.encode(JSON.stringify(proposal()).replace('"format":', '"__proto__":{},"format":'))],
  ['array', json([])], ['null', json(null)], ['plain object bytes', {}],
]) test(`proposal rejects ${name}`, async () => { await invalid(() => parse(bytes)); });
for (const [name, change] of [
  ['missing terms', d => { delete d.terms; }], ['unknown version', d => { d.format = FORMAT.replace('/v1', '/v2'); }],
  ...['termsHash', 'binding', 'escrow', 'deployment', 'role', 'accepted', 'signature', 'capabilities', 'funded', 'rpcUrl'].map(name =>
    [`public ${name}`, d => { d[name] = 'caller supplied'; }]),
  ['missing term', d => { delete d.terms.sellerNonce; }], ['extra term', d => { d.terms.extra = 'caller supplied'; }],
  ['SPL', d => { d.terms = makeTerms('spl'); }], ['native mint', d => { d.terms.mint = key('mint'); }],
  ['native program', d => { d.terms.tokenProgram = key('token'); }], ['same parties', d => { d.terms.buyer = d.terms.seller; }],
  ['bad key', d => { d.terms.buyer = '0'.repeat(44); }], ['uppercase hash', d => { d.terms.orderId = 'AB'.repeat(32); }],
  ['leading zero', d => { d.terms.amountBaseUnits = '01'; }], ['zero principal', d => { d.terms.amountBaseUnits = '0'; }],
  ['number principal', d => { d.terms.amountBaseUnits = 1; }], ['u64 overflow', d => { d.terms.amountBaseUnits = (1n << 64n).toString(); }],
  ['zero revision', d => { d.terms.revision = '0'; }], ['negative deadline', d => { d.terms.escrowExpirySeconds = '-1'; }],
]) test(`proposal rejects ${name}`, async () => { const d = proposal(); change(d); await invalid(() => parse(json(d))); });
test('record round-trip is detached, frozen and domain-separated over the entire binding', async () => {
  const made = await create(json(proposal()), config, PROFILE), value = made.value;
  assert.equal(value.format, RECORD); assert.deepEqual(value.proposal, (await parse(json(proposal()))).document);
  assert.equal(value.role, 'seller'); assert.equal(value.originProfileId, PROFILE);
  assert.deepEqual(value.binding, { chain: 'solana', networkId: config.network.id,
    deploymentId: config.network.deployments[0].id, tradeId: await sha256Hex(encodeSolanaTerms(proposal().terms)) });
  assert.deepEqual(value.configuration, { registrySha256: config.registrySha256,
    programDataSha256: config.network.deployments[0].runtime.programDataSha256,
    artifactSha256: config.network.deployments[0].artifactSha256, assetId: config.network.assets[0].id,
    rpcUrl: config.rpcUrl, margins: config.margins });
  const expected = createHash('sha256').update(JSON.stringify([RECORD, 'solana', value.binding.networkId,
    value.binding.deploymentId, value.binding.tradeId])).digest('hex').slice(0, 32);
  assert.deepEqual(made.record, { id: expected, kind: 'trade', schemaVersion: 1, payload: encodeBase64url(json(value)) });
  assert.ok(decodeBase64url(made.record.payload, 1, 8192).length <= 8192);
  assert.deepEqual(await decode(made.record), value);
  for (const item of [made, made.record, value, value.proposal, value.proposal.terms, value.binding, value.configuration, value.configuration.margins]) {
    assert.ok(Object.isFrozen(item));
  }
});
test('create captures input bytes and installed provenance before hashing can yield', async () => {
  const mutable = { ...config, network: structuredClone(config.network), margins: { ...config.margins } };
  const bytes = json(proposal()), pending = create(bytes, mutable, PROFILE);
  bytes.fill(0); mutable.registrySha256 = 'ef'.repeat(32); mutable.rpcUrl = 'http://127.0.0.1:19998/';
  mutable.network.deployments[0].runtime.programDataSha256 = 'ef'.repeat(32); mutable.margins.submitMarginSeconds = '0';
  const value = (await pending).value;
  assert.equal(value.configuration.registrySha256, config.registrySha256);
  assert.equal(value.configuration.programDataSha256, config.network.deployments[0].runtime.programDataSha256);
  assert.deepEqual(value.configuration.margins, config.margins); assert.equal(value.configuration.rpcUrl, config.rpcUrl);
});
test('equal term hashes in different installed bindings produce distinct private record IDs', async () => {
  const alternate = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption(network => {
    network.genesisHash = network.chainIdentity = proposal().terms.genesisHash;
    network.id = 'solana-localnet-second'; network.deployments[0].id = 'escrow-v1-second';
  })));
  const first = await create(json(proposal()), config, PROFILE), second = await create(json(proposal()), alternate, PROFILE);
  assert.equal(second.value.binding.tradeId, first.value.binding.tradeId); assert.notEqual(second.record.id, first.record.id);
  assert.deepEqual(await decode(second.record), second.value);
});
test('historical configuration remains readable data without an installed configuration or relabeling', async () => {
  const original = (await create(json(proposal()), config, PROFILE)).record;
  const changed = edited(original, v => { v.configuration.registrySha256 = 'ef'.repeat(32);
    v.configuration.programDataSha256 = 'de'.repeat(32); v.configuration.rpcUrl = 'http://127.0.0.1:19997/';
    v.configuration.margins.submitMarginSeconds = '0'; });
  const value = await decode(changed);
  assert.deepEqual(value.configuration, body(changed).configuration); assert.equal(value.originProfileId, PROFILE);
  assert.equal(value.configuration.rpcUrl, 'http://127.0.0.1:19997/');
});
test('private decoded byte bound includes whitespace and allows exactly eight KiB', async () => {
  const record = (await create(json(proposal()), config, PROFILE)).record, text = JSON.stringify(body(record));
  const exact = { ...record, payload: encodeBase64url(enc.encode(text.padEnd(8192, ' '))) };
  assert.deepEqual(await decode(exact), await decode(record));
  await invalid(() => decode({ ...record, payload: encodeBase64url(enc.encode(text.padEnd(8193, ' '))) }));
});
for (const [name, change] of [['genesis', d => { d.terms.genesisHash = key('different-genesis'); }],
  ['program', d => { d.terms.programId = key('different-program'); }]]) test(`create refuses a different installed ${name}`, async () => {
  const d = proposal(); change(d); await assert.rejects(() => create(json(d), config, PROFILE), error => error.code === 'WRONG_CHAIN');
});
for (const profile of ['00'.repeat(16), 'AB'.repeat(16), '1'.repeat(31), '', null]) test(`record refuses invalid origin ${String(profile)}`, async () => {
  await invalid(() => create(json(proposal()), config, profile));
});
for (const [name, change] of [
  ['ID', r => { r.id = '34'.repeat(16); }], ['kind', r => { r.kind = 'journal'; }], ['schema', r => { r.schemaVersion = 2; }],
  ['extra wrapper', r => { r.accepted = true; }], ['oversize payload', r => { r.payload = encodeBase64url(new Uint8Array(8193)); }],
  ['invalid base64', r => { r.payload += '='; }],
]) test(`record rejects ${name}`, async () => {
  const r = { ...(await create(json(proposal()), config, PROFILE)).record }; change(r); await invalid(() => decode(r));
});
for (const [name, change] of [
  ['body version', v => { v.format = RECORD.replace('/v1', '/v2'); }], ['extra body', v => { v.funded = true; }],
  ['buyer role', v => { v.role = 'buyer'; }], ['missing provenance', v => { delete v.originProfileId; }],
  ['zero origin', v => { v.originProfileId = '00'.repeat(16); }], ['binding chain', v => { v.binding.chain = 'evm'; }],
  ['binding hash', v => { v.binding.tradeId = 'ef'.repeat(32); }], ['binding network', v => { v.binding.networkId = 'different'; }],
  ['binding deployment', v => { v.binding.deploymentId = 'different'; }], ['altered terms', v => { v.proposal.terms.amountBaseUnits = '2'; }],
  ['digest case', v => { v.configuration.registrySha256 = 'AB'.repeat(32); }],
  ['runtime digest', v => { v.configuration.programDataSha256 = 'bad'; }],
  ['artifact digest', v => { v.configuration.artifactSha256 = 'bad'; }],
  ['asset ID', v => { v.configuration.assetId = '../asset'; }], ['endpoint', v => { v.configuration.rpcUrl = 'https://remote.invalid/'; }],
  ['margin encoding', v => { v.configuration.margins.submitMarginSeconds = '01'; }],
  ['margin bound', v => { v.configuration.margins.releaseMarginSeconds = '604801'; }],
  ['extra provenance', v => { v.configuration.approved = true; }],
]) test(`record rejects ${name}`, async () => {
  const r = (await create(json(proposal()), config, PROFILE)).record; await invalid(() => decode(edited(r, change)));
});
test('decode captures its wrapper before hashing yields and does not call wrapper getters', async () => {
  const made = await create(json(proposal()), config, PROFILE), mutable = { ...made.record }, pending = decode(mutable);
  mutable.id = '00'.repeat(16); mutable.payload = 'bad'; assert.deepEqual(await pending, made.value);
  let invoked = 0; const hostile = { ...made.record };
  Object.defineProperty(hostile, 'payload', { enumerable: true, get() { invoked++; throw Error('getter'); } });
  await invalid(() => decode(hostile)); assert.equal(invoked, 0);
});
test('installed configuration accessors are refused before any getter invocation', async () => {
  let invoked = 0;
  for (const path of ['network', 'registrySha256', 'margins', 'runtime']) {
    const mutable = { ...config, network: structuredClone(config.network) };
    const target = path === 'runtime' ? mutable.network.deployments[0] : mutable;
    Object.defineProperty(target, path, { enumerable: true, get() { invoked++; throw Error('getter'); } });
    await invalid(() => create(json(proposal()), mutable, PROFILE));
  }
  assert.equal(invoked, 0);
});
test('codec performs deterministic hashing with zero clock, random, network, wallet or storage calls', async () => {
  let forbidden = 0; const reject = () => { forbidden++; throw Error('unexpected side effect'); };
  const saved = [];
  const replace = (object, key, value) => { const descriptor = Object.getOwnPropertyDescriptor(object, key);
    saved.push(() => descriptor ? Object.defineProperty(object, key, descriptor) : Reflect.deleteProperty(object, key));
    Object.defineProperty(object, key, { configurable: true, writable: true, value }); };
  replace(Date, 'now', reject); replace(crypto, 'getRandomValues', reject); replace(globalThis, 'fetch', reject);
  replace(globalThis, 'indexedDB', new Proxy({}, { get: reject })); replace(globalThis, 'solana', new Proxy({}, { get: reject }));
  replace(globalThis, 'navigator', new Proxy({}, { get: reject }));
  try { const made = await create(json(proposal()), config, PROFILE); assert.deepEqual(await decode(made.record), made.value); }
  finally { for (const restore of saved.reverse()) restore(); }
  assert.equal(forbidden, 0);
});
function store() {
  const rows = new Map();
  return { rows, async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); assert.equal(rows.has(row.profileId), false); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) { options?.assertCurrent?.();
      if (JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
      rows.set(after.profileId, structuredClone(after)); },
    async addWithSource(before, after, options) { assert.deepEqual(rows.get(before.profileId), before); await this.add(after, options); },
    async listProfileIds() { return { profileIds: [...rows.keys()].sort(), truncated: false }; },
    subscribeInvalidation() { return () => {}; } };
}
test('fresh-key restore retains proposal bytes and origin; existing controller still reads funded recovery only', async t => {
  required('createSolanaFundingProposalRecord');
  const env = setupClient(), data = store(), vault = new EncryptedVaultService(data, crypto, { lifecycle: false });
  const backup = new EncryptedBackupService(data), option = configOption(network => {
    network.genesisHash = network.chainIdentity = env.terms.genesisHash;
    network.deployments[0].artifactSha256 = env.trade.deployment.artifactSha256;
    network.deployments[0].runtime.programDataSha256 = env.trade.deployment.runtime.programDataSha256;
  });
  const installed = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(option));
  const controller = new SolanaRecoveryController(installed, env.walletFake.wallet, env.cluster.rpc, { store: data });
  t.after(() => { controller.dispose(); backup.dispose(); vault.dispose(); env.client.dispose(); });
  const session = ok(await vault.create(PASS)), made = await create(json({ format: FORMAT, terms: env.terms }), installed, session.profileId);
  ok(await vault.commit(session.sessionId, session.revision, [{ op: 'put', record: made.record }])); vault.lockAll();
  const unlocked = await controller.dispatch({ type: 'profile.unlock', profileId: session.profileId, passphrase: PASS });
  assert.equal(unlocked.ok, true, JSON.stringify(unlocked)); assert.deepEqual(unlocked.snapshot.trades, []);
  assert.equal(env.cluster.calls.length, 0, 'ignored proposal does not trigger native reads');
  const recovery = createRecoveryDocument(env.trade); assert.equal(recovery.ok, true);
  const imported = await controller.dispatch({ type: 'recovery.import', text: JSON.stringify(recovery.value), role: 'seller' });
  assert.equal(imported.ok, true, JSON.stringify(imported)); assert.equal(imported.snapshot.trades.length, 1);
  await controller.dispatch({ type: 'profile.lock' });
  const exported = await backup.export(session.profileId), destinationPass = 'fresh proposal restore passphrase';
  const restored = await backup.restore(exported, PASS, destinationPass);
  assert.notEqual(restored.newProfileId, session.profileId);
  const opened = await openEnvelope(data.rows.get(restored.newProfileId), destinationPass, crypto);
  try { const record = opened.snapshot.records.find(r => r.id === made.record.id);
    assert.deepEqual(record, made.record); assert.deepEqual(await decode(record), made.value);
    assert.equal((await decode(record)).originProfileId, session.profileId);
  } finally { disposeMaterial(opened.material); }
  const reopened = await controller.dispatch({ type: 'profile.unlock', profileId: restored.newProfileId, passphrase: destinationPass });
  assert.equal(reopened.ok, true, JSON.stringify(reopened)); assert.equal(reopened.snapshot.trades.length, 1);
  assert.equal(reopened.snapshot.trades[0].id, recovery.value.termsHash); assert.equal(reopened.snapshot.trades[0].restored, true);
  assert.equal(env.walletFake.calls.connect, 0); assert.equal(env.walletFake.calls.sign.length, 0); assert.equal(env.cluster.sent.length, 0);
});
