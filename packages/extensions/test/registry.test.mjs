import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionRegistry, parseExtensionManifest, EXTENSION_LIMITS } from '../index.ts';

const hash = 'a'.repeat(64), otherHash = 'b'.repeat(64);
const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'local-v1', tradeId: 'synthetic-trade' };
const declared = (changes = {}) => ({ format: 'p2p-offramp-extension', version: 1, id: 'local-evidence', protocolVersion: 1, coreApiVersion: 1,
  capabilities: ['local:display'], schemaHashes: [hash], ...changes });
const ok = value => ({ ok: true, value });
const val = value => { assert.equal(value.ok, true, JSON.stringify(value)); return value.value; };
const bad = (value, code) => { assert.equal(value.ok, false, JSON.stringify(value)); assert.equal(value.error.code, code); assert.doesNotMatch(JSON.stringify(value), /SECRET|sensitive|wallet-private/); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const signal = () => new AbortController().signal;
const view = () => ({ binding: { ...binding }, chain: null, chainHealth: 'loading', pendingIntentIds: [], fiatClaim: 'none', walletGeneration: 0 });

function fixture(overrides = {}) {
  const state = { context: undefined, signal: undefined, initialized: 0, disposed: 0, parsed: 0, proposed: 0, seen: undefined };
  const instance = { manifest: declared(), async initialize(context, scopedSignal) { state.initialized++; state.context = context; state.signal = scopedSignal; return ok(undefined); }, async dispose() { state.disposed++; }, ...overrides.instance };
  const registration = { instance, validateProposal: (_binding, input) => { state.parsed++; return ok({ schemaHash: hash, value: { approved: input.approved } }); }, ...overrides.registration };
  const registry = val(createExtensionRegistry({ entries: [registration], registeredCapabilities: ['local:display'], ...overrides.options }));
  const context = { readTrade: () => view(), proposeIntent: (_binding, input) => { state.proposed++; state.seen = input; return ok('local-proposal-reference'); }, ...overrides.context };
  const managed = registry.resolve('local-evidence', 1);
  return { state, instance, registration, registry, context, managed };
}

test('core-only empty registry has empty negotiation and no module or economic capability', async () => {
  const registry = val(createExtensionRegistry());
  assert.deepEqual(val(registry.negotiate([])), []);
  assert.equal(registry.resolve('not-installed', 1), null);
  bad(registry.negotiate([declared()]), 'UNSUPPORTED_PROVIDER');
  await registry.disposeAll();
  bad(registry.negotiate([]), 'LOCKED');
});

test('manifest validation snapshots exact immutable values, sorts sets and rejects unsupported wire versions', () => {
  const input = declared({ capabilities: ['z', 'a'], schemaHashes: [otherHash, hash] }), parsed = val(parseExtensionManifest(input));
  input.capabilities[0] = 'mutated'; input.schemaHashes[0] = 'c'.repeat(64);
  assert.deepEqual(parsed.capabilities, ['a', 'z']); assert.deepEqual(parsed.schemaHashes, [hash, otherHash]);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.capabilities) && Object.isFrozen(parsed.schemaHashes));
  for (const change of [{ version: 2 }, { coreApiVersion: 2 }]) bad(parseExtensionManifest(declared(change)), 'UNSUPPORTED_VERSION');
  for (const change of [{ id: 'http://host.invalid/code' }, { id: 'UPPER' }, { id: '' }, { protocolVersion: 0 }, { protocolVersion: 65536 }, { protocolVersion: 1.5 },
    { capabilities: ['duplicate', 'duplicate'] }, { schemaHashes: [hash, hash] }, { schemaHashes: ['A'.repeat(64)] }, { extra: 'not allowed' }]) bad(parseExtensionManifest(declared(change)), 'INVALID_INPUT');
  bad(parseExtensionManifest(declared({ capabilities: Array.from({ length: 17 }, (_, i) => `c-${i}`) })), 'LIMIT_EXCEEDED');
  bad(parseExtensionManifest(declared({ schemaHashes: Array.from({ length: 17 }, (_, i) => i.toString(16).padStart(64, '0')) })), 'LIMIT_EXCEEDED');
});

test('hostile manifest, registration and array properties are rejected without getters or raw exceptions', () => {
  let calls = 0;
  const getter = declared(); Object.defineProperty(getter, 'id', { get() { calls++; throw Error('SECRET'); } });
  bad(parseExtensionManifest(getter), 'INVALID_INPUT');
  const proxy = Proxy.revocable({}, {}); proxy.revoke(); bad(parseExtensionManifest(proxy.proxy), 'INVALID_INPUT');
  const caps = ['x']; Object.defineProperty(caps, '0', { get() { calls++; return 'x'; } });
  bad(parseExtensionManifest(declared({ capabilities: caps })), 'INVALID_INPUT');
  bad(parseExtensionManifest(declared({ capabilities: new Array(1) })), 'INVALID_INPUT');
  const entry = {}; Object.defineProperty(entry, 'instance', { get() { calls++; throw Error('SECRET'); }, enumerable: true });
  bad(createExtensionRegistry({ entries: [entry] }), 'INVALID_INPUT');
  assert.equal(calls, 0);
});

test('only trusted registered capability names and distinct bounded registrations are admitted', () => {
  const instance = { manifest: declared(), initialize: async () => ok(undefined), dispose: async () => {} };
  bad(createExtensionRegistry({ entries: [{ instance }] }), 'UNSUPPORTED_PROVIDER');
  bad(createExtensionRegistry({ entries: [{ instance }, { instance }], registeredCapabilities: ['local:display'] }), 'CONFLICT');
  bad(createExtensionRegistry({ entries: Array.from({ length: 65 }, () => ({ instance })), registeredCapabilities: ['local:display'] }), 'LIMIT_EXCEEDED');
  for (const options of [{ entries: null }, { registeredCapabilities: null }, { generation: null }, { generation: -1 }]) bad(createExtensionRegistry(options), 'INVALID_INPUT');
  assert.equal(EXTENSION_LIMITS.modules, 16);
});

test('negotiation binds exact versions, registered capabilities and schema sets with no input mutation', async () => {
  const instances = ['z-display', 'a-display'].map(id => ({ manifest: declared({ id }), initialize: async () => ok(undefined), dispose: async () => {} }));
  const registry = val(createExtensionRegistry({ entries: instances.map(instance => ({ instance })), registeredCapabilities: ['local:display'] }));
  const offered = instances.map(instance => structuredClone(instance.manifest));
  const result = val(registry.negotiate(offered));
  assert.deepEqual(result.map(item => item.id), ['a-display', 'z-display']);
  offered[0].schemaHashes[0] = otherHash;
  assert.equal(result[1].schemaHashes[0], hash);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]) && Object.isFrozen(result[0].schemaHashes));
  bad(registry.negotiate([declared({ id: 'a-display', protocolVersion: 2 })]), 'UNSUPPORTED_VERSION');
  bad(registry.negotiate([declared({ id: 'a-display', schemaHashes: [otherHash] })]), 'UNSUPPORTED_PROVIDER');
  bad(registry.negotiate([declared({ id: 'a-display', capabilities: [] })]), 'UNSUPPORTED_PROVIDER');
  bad(registry.negotiate([instances[0].manifest, instances[0].manifest]), 'CONFLICT');
  bad(registry.negotiate(Array(17).fill(instances[0].manifest)), 'LIMIT_EXCEEDED');
  assert.equal(registry.resolve('a-display', 2), null); assert.equal(registry.resolve('invalid/path', 1), null);
  await registry.disposeAll();
});

test('managed initialization captures the bundled instance and runs once per owned generation', async () => {
  const f = fixture();
  assert.notEqual(f.managed, f.instance);
  f.instance.initialize = async () => { throw Error('SECRET'); };
  f.instance.manifest.id = 'mutated-after-registration';
  val(await f.managed.initialize(f.context, signal()));
  val(await f.managed.initialize({ readTrade() { throw Error('SECRET'); }, proposeIntent() { throw Error('SECRET'); } }, signal()));
  assert.equal(f.state.initialized, 1); assert.deepEqual(Object.keys(f.state.context).sort(), ['proposeIntent', 'readTrade']);
  assert.ok(Object.isFrozen(f.state.context));
  const result = f.state.context.readTrade(binding);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.binding) && Object.isFrozen(result.pendingIntentIds));
  await f.registry.disposeAll(); assert.equal(f.state.disposed, 1);
  assert.equal(f.state.context.readTrade(binding), null); bad(f.state.context.proposeIntent(binding, {}), 'LOCKED');
});

test('a pending initialization cannot be duplicated and dispose revokes context before draining late completion', async () => {
  const gate = deferred(), started = deferred(); let captured, scopedSignal;
  const f = fixture({ instance: { async initialize(context, scoped) { captured = context; scopedSignal = scoped; started.resolve(); await gate.promise; return ok(undefined); } } });
  const pending = f.managed.initialize(f.context, signal()); await started.promise;
  bad(await f.managed.initialize(f.context, signal()), 'CONFLICT');
  bad(captured.proposeIntent(binding, {}), 'LOCKED');
  const drain = f.registry.disposeAll();
  assert.equal(scopedSignal.aborted, true); assert.equal(captured.readTrade(binding), null);
  assert.equal(f.registry.resolve('local-evidence', 1), null);
  let drained = false; drain.then(() => { drained = true; }); await Promise.resolve(); assert.equal(drained, false);
  gate.resolve(); bad(await pending, 'LOCKED'); await drain; assert.equal(f.state.disposed, 1);
  bad(captured.proposeIntent(binding, { approved: true }), 'LOCKED'); assert.equal(f.state.proposed, 0);
});

test('external cancellation returns promptly, revokes jobs and also applies after readiness', async () => {
  const gate = deferred(), entered = deferred(); let scoped;
  const f = fixture({ instance: { async initialize(context, sourceSignal) { scoped = sourceSignal; entered.resolve(); await gate.promise; return ok(undefined); } } });
  const controller = new AbortController(), pending = f.managed.initialize(f.context, controller.signal); await entered.promise;
  controller.abort(); bad(await pending, 'CANCELLED'); assert.equal(scoped.aborted, true);
  gate.resolve(); await f.registry.disposeAll(); assert.equal(f.state.disposed, 1);
  const active = fixture(), lifetime = new AbortController(); val(await active.managed.initialize(active.context, lifetime.signal));
  lifetime.abort(); assert.equal(active.state.signal.aborted, true); assert.equal(active.state.context.readTrade(binding), null);
  await active.registry.disposeAll(); assert.equal(active.state.disposed, 1);
});

test('retired or throwing generation hooks abort active contexts and forbid late initialization results', async () => {
  let generation = 3;
  const f = fixture({ options: { generation: 3, isCurrent: expected => generation === expected } });
  val(await f.managed.initialize(f.context, signal())); generation++;
  assert.equal(f.state.context.readTrade(binding), null); assert.equal(f.state.signal.aborted, true);
  bad(f.registry.negotiate([]), 'LOCKED'); await f.registry.disposeAll();
  const throwing = fixture({ options: { isCurrent() { throw Error('SECRET'); } } });
  assert.equal(throwing.managed, null); bad(throwing.registry.negotiate([]), 'LOCKED'); await throwing.registry.disposeAll();
  const malformed = fixture({ options: { isCurrent: () => 'truthy malformed value' } });
  assert.equal(malformed.managed, null); bad(malformed.registry.negotiate([]), 'LOCKED'); await malformed.registry.disposeAll();
});

test('failed or malformed module results are fixed errors and disable that module', async () => {
  const rejection = fixture({ instance: { initialize: async () => ({ ok: false, error: { code: 'USER_REJECTED', message: 'SECRET' } }) } });
  bad(await rejection.managed.initialize(rejection.context, signal()), 'USER_REJECTED');
  assert.equal(rejection.registry.resolve('local-evidence', 1), null); bad(rejection.registry.negotiate([declared()]), 'UNSUPPORTED_PROVIDER'); await rejection.registry.disposeAll();
  for (const start of [async () => ok('SECRET'), async () => { throw Object.assign(Error('SECRET'), { code: 'SECRET' }); }, async () => { const p = Proxy.revocable({}, {}); p.revoke(); throw p.proxy; }]) {
    const f = fixture({ instance: { initialize: start } }); const result = await f.managed.initialize(f.context, signal());
    assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /SECRET/); await f.registry.disposeAll(); assert.equal(f.state.disposed, 1);
  }
});

test('read context rejects mismatched, hostile or mutable authority results without leaking source objects', async () => {
  const original = view();
  const f = fixture({ context: { readTrade: () => original } }); val(await f.managed.initialize(f.context, signal()));
  const captured = f.state.context.readTrade(binding); original.pendingIntentIds.push(Buffer.alloc(32, 1).toString('base64url'));
  assert.deepEqual(captured.pendingIntentIds, []);
  assert.equal(f.state.context.readTrade({ ...binding, tradeId: 'other' }), null);
  Object.defineProperty(original, 'chainHealth', { get() { throw Error('SECRET'); } }); assert.equal(f.state.context.readTrade(binding), null);
  await f.registry.disposeAll();
});

test('only exact registered schema parsing reaches core proposal checks; caller content cannot grant consent', async () => {
  const f = fixture({ registration: { validateProposal(_binding, input) {
    if (input.approved !== true) return { ok: false, error: { code: 'INVALID_INPUT', message: 'SECRET' } };
    return ok({ schemaHash: hash, value: { approved: true, network: binding.networkId } });
  } }, context: { proposeIntent(_binding, input) {
    f.state.proposed++; f.state.seen = input;
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'SECRET wallet-private' } };
  } } });
  val(await f.managed.initialize(f.context, signal()));
  bad(f.state.context.proposeIntent(binding, { approved: false }), 'INVALID_INPUT'); assert.equal(f.state.proposed, 0);
  bad(f.state.context.proposeIntent(binding, { approved: true, walletConsent: true, unsafeField: 'not in parsed value' }), 'UNAUTHORIZED');
  assert.equal(f.state.proposed, 1); assert.deepEqual({ ...f.state.seen.value }, { approved: true, network: binding.networkId });
  assert.ok(Object.isFrozen(f.state.seen) && Object.isFrozen(f.state.seen.value));
  await f.registry.disposeAll();
});

test('missing schemas, unregistered parser output and hostile proposals never reach core', async () => {
  const absent = fixture({ registration: { validateProposal: undefined } }); val(await absent.managed.initialize(absent.context, signal()));
  bad(absent.state.context.proposeIntent(binding, {}), 'UNSUPPORTED_PROVIDER'); await absent.registry.disposeAll();
  const wrong = fixture({ registration: { validateProposal: () => ok({ schemaHash: otherHash, value: {} }) } }); val(await wrong.managed.initialize(wrong.context, signal()));
  bad(wrong.state.context.proposeIntent(binding, {}), 'UNSUPPORTED_PROVIDER'); assert.equal(wrong.state.proposed, 0); await wrong.registry.disposeAll();
  const f = fixture(); val(await f.managed.initialize(f.context, signal()));
  let gets = 0; const getter = {}; Object.defineProperty(getter, 'approved', { enumerable: true, get() { gets++; return true; } });
  const cyclic = {}; cyclic.self = cyclic;
  for (const input of [getter, cyclic, { approved: 'a'.repeat(65_537) }, { approved: () => true }]) assert.equal(f.state.context.proposeIntent(binding, input).ok, false);
  assert.equal(gets, 0); assert.equal(f.state.parsed, 0); assert.equal(f.state.proposed, 0);
  val(f.state.context.proposeIntent(binding, { approved: true })); assert.equal(f.state.proposed, 1);
  await f.registry.disposeAll();
});

test('reentrant module cleanup is idempotent, all contexts revoked before cleanup can inspect registry', async () => {
  let stopped = 0, registry;
  const instance = { manifest: declared(), initialize: async () => ok(undefined), dispose: async () => { stopped++; assert.equal(registry.resolve('local-evidence', 1), null); registry.disposeAll(); } };
  registry = val(createExtensionRegistry({ entries: [{ instance }], registeredCapabilities: ['local:display'] }));
  val(await registry.resolve('local-evidence', 1).initialize({ readTrade: () => null, proposeIntent: () => ok('proposal') }, signal()));
  await Promise.all([registry.disposeAll(), registry.disposeAll()]); assert.equal(stopped, 1);
});
