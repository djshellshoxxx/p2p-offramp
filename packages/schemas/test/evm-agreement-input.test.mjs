import test from 'node:test';
import assert from 'node:assert/strict';
// Test-scoped spy over the intrinsic copy method. The module caches %TypedArray%.prototype.set at import time, so the
// wrapper must be installed before the dynamic import and is restored in `finally` immediately after it. `copyHook` is
// null except inside the one test that opts in, making the captured wrapper a pure pass-through otherwise.
let copyHook = null;
const nativeSet = Uint8Array.prototype.set;
Uint8Array.prototype.set = function spiedSet(...args) { if (copyHook) copyHook(this, args); return nativeSet.apply(this, args); };
let api;
const moduleUrl = new URL('../src/evm-agreement-input.ts', import.meta.url);
try {
  api = await import(moduleUrl.href).catch(error => {
    const target = error?.url === moduleUrl.href; // Exact missing target only; importer text must never hide a transitive miss.
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && target) return {};
    throw error;
  });
}
finally { Uint8Array.prototype.set = nativeSet; }
assert.equal(Uint8Array.prototype.set, nativeSet);
const parse = (...args) => { assert.equal(typeof api.parseEvmAgreementInput, 'function', 'missing parseEvmAgreementInput'); return api.parseEvmAgreementInput(...args); };
const h = c => c.repeat(64);
const A = c => '0x' + c.repeat(40);
const make = () => ({
  privateAgreement: { v: 1, orderId: h('a'), revision: '1', fiatCurrency: 'USD', fiatMinorUnits: '10000', fiatScale: 2,
    paymentInstructions: 'PRIVATE-FIXTURE pay', capabilities: [{ id: 'alpha', version: '1', policyHash: h('b') }], agreementSalt: h('c') },
  domain: { chainId: '11155111', verifyingContract: A('1') },
  terms: { orderId: h('a'), revision: '1', networkId: 'eip155:1'.replace(':', '-'), deploymentId: 'escrow-v1', seller: A('2'), buyer: A('3'),
    assetKind: 'erc20', asset: A('4'), amountBaseUnits: '1000', privateAgreementHash: h('d'), capabilitiesHash: h('e'),
    sellerNonce: h('f'), acceptBeforeSeconds: '100', escrowExpirySeconds: '5000' },
  acceptances: [
    { termsHash: h('9'), role: 'seller', walletAccount: A('2'), signature: new Uint8Array(65).fill(7) },
    { termsHash: h('9'), role: 'buyer', walletAccount: A('3'), signature: new Uint8Array(65).fill(8) }]
});
const bad = (mutate, code = 'INVALID_INPUT') => {
  const input = make(); mutate(input);
  assert.throws(() => parse(input), error => error.code === code && !String(error.message).includes('PRIVATE-FIXTURE'));
};

test('valid input yields frozen independent snapshot with owned signature copies', () => {
  const input = make(); const out = parse(input);
  assert.deepEqual(Object.keys(out).sort(), ['acceptances', 'domain', 'privateAgreement', 'terms']);
  for (const o of [out, out.privateAgreement, out.domain, out.terms, out.acceptances, out.acceptances[0], out.privateAgreement.capabilities, out.privateAgreement.capabilities[0]]) assert.ok(Object.isFrozen(o));
  assert.ok(!Object.isFrozen(out.acceptances[0].signature));
  assert.equal(out.acceptances[0].signature.byteLength, 65);
  assert.equal(out.acceptances[0].signature.buffer.byteLength, 65);
  assert.notEqual(out.acceptances[0].signature.buffer, input.acceptances[0].signature.buffer);
  input.acceptances[0].signature.fill(0); input.privateAgreement.paymentInstructions = 'x'; input.terms.amountBaseUnits = '9'; input.privateAgreement.capabilities[0].id = 'zzz';
  assert.equal(out.acceptances[0].signature[0], 7);
  assert.equal(out.privateAgreement.paymentInstructions, 'PRIVATE-FIXTURE pay');
  assert.equal(out.terms.amountBaseUnits, '1000');
  assert.equal(out.privateAgreement.capabilities[0].id, 'alpha');
  assert.ok(!('verified' in out) && !('approved' in out));
});
test('native asset, buyer-first order, mismatched claims and arbitrary signature bytes are accepted structurally', () => {
  const input = make(); input.terms.assetKind = 'native'; input.terms.asset = A('0');
  input.acceptances.reverse(); input.acceptances[0].walletAccount = A('5'); input.acceptances[1].termsHash = h('1');
  const out = parse(input); assert.equal(out.acceptances[0].role, 'buyer');
});
test('nonzero-offset view: exactly 65 independently owned bytes; constructor/species/byteLength/iterator/subarray never invoked', () => {
  const input = make(); const backing = new ArrayBuffer(1000); new Uint8Array(backing).fill(1);
  const view = new Uint8Array(backing, 100, 65); view.fill(5); view[0] = 3; view[64] = 9;
  let calls = 0; const trap = () => { calls++; throw new Error('override invoked'); };
  const species = { get [Symbol.species]() { return trap(); } };
  for (const target of [view, backing]) {
    Object.defineProperty(target, 'constructor', { get() { calls++; return species; }, configurable: true });
    Object.defineProperty(target, 'byteLength', { get: trap, configurable: true });
    Object.defineProperty(target, 'slice', { value: trap, configurable: true });
  }
  for (const key of ['length', 'byteOffset', 'buffer']) Object.defineProperty(view, key, { get: trap, configurable: true });
  for (const key of [Symbol.iterator, 'subarray', 'set', 'at', 'valueOf', 'toString']) Object.defineProperty(view, key, { value: trap, configurable: true });
  class HostileU8 extends Uint8Array { static get [Symbol.species]() { return trap(); } }
  const sub = new HostileU8(65); sub.fill(8);
  Object.defineProperty(sub.buffer, 'constructor', { get() { calls++; return species; }, configurable: true });
  input.acceptances[0].signature = view; input.acceptances[1].signature = sub;
  const out = parse(input); const sig = out.acceptances[0].signature;
  assert.equal(calls, 0);
  assert.equal(Object.getPrototypeOf(sig), Uint8Array.prototype);
  assert.equal(Object.getPrototypeOf(out.acceptances[1].signature), Uint8Array.prototype);
  assert.equal(sig.byteLength, 65); assert.equal(sig.byteOffset, 0); assert.equal(sig.buffer.byteLength, 65);
  assert.notEqual(sig.buffer, backing); assert.notEqual(out.acceptances[1].signature.buffer, sub.buffer);
  assert.deepEqual(Array.from(sig), [3, ...Array(63).fill(5), 9]);
  assert.deepEqual(Array.from(out.acceptances[1].signature), Array(65).fill(8));
  new Uint8Array(backing).fill(0); nativeSet.call(sub, new Uint8Array(65));
  assert.equal(sig[0], 3); assert.equal(sig[64], 9); assert.equal(out.acceptances[1].signature[10], 8);
  assert.equal(calls, 0);
});
test('buffer detached by a hostile descriptor meta-trap between validation and copy fails closed', () => {
  if (typeof structuredClone !== 'function') { assert.ok(true, 'environment without structuredClone transfer: detach-race case not exercised'); return; }
  const input = make(); const first = input.acceptances[0].signature;
  let fired = 0;
  // acceptances[0] is fully validated before acceptances[1]'s descriptors are read; the trap detaches [0]'s buffer then.
  input.acceptances[1] = new Proxy(input.acceptances[1], {
    getOwnPropertyDescriptor(target, key) { if (!fired++) structuredClone(first.buffer, { transfer: [first.buffer] }); return Reflect.getOwnPropertyDescriptor(target, key); }
  });
  assert.throws(() => parse(input), e => e.code === 'INVALID_INPUT' && e.name === 'CoreSchemaError');
  assert.equal(fired > 0, true); assert.equal(first.buffer.byteLength, 0);
});
test('hostile trap throwing a revoked proxy still yields fixed CoreSchemaError', () => {
  const r = Proxy.revocable({}, {}); r.revoke();
  bad(i => { i.domain = new Proxy({ chainId: '1', verifyingContract: A('1') }, { getPrototypeOf() { throw r.proxy; } }); });
  bad(i => { i.acceptances[1] = new Proxy(i.acceptances[1], { ownKeys() { throw r.proxy; } }); });
  bad(i => { i.terms = new Proxy(i.terms, { getOwnPropertyDescriptor() { throw r.proxy; } }); });
  const input = make(); input.acceptances[0] = new Proxy(input.acceptances[0], { getPrototypeOf() { throw r.proxy; } });
  assert.throws(() => parse(input), e => e.name === 'CoreSchemaError' && e.message === 'Invalid core data.' && e.code === 'INVALID_INPUT');
});
test('signature size and type failures', () => {
  for (const n of [0, 64, 66, 100000]) bad(i => { i.acceptances[0].signature = new Uint8Array(n); });
  bad(i => { i.acceptances[0].signature = new Uint16Array(65); });
  bad(i => { i.acceptances[0].signature = new Proxy(new Uint8Array(65), {}); });
  bad(i => { i.acceptances[0].signature = Array(65).fill(0); });
  const r = Proxy.revocable(new Uint8Array(65), {}); r.revoke(); bad(i => { i.acceptances[0].signature = r.proxy; });
  bad(i => { i.acceptances[0].signature = new Uint8Array(new SharedArrayBuffer(65)); });
  if (typeof ArrayBuffer.prototype.resize === 'function') bad(i => { i.acceptances[0].signature = new Uint8Array(new ArrayBuffer(65, { maxByteLength: 100 })); });
  if (typeof structuredClone === 'function') { const b = new ArrayBuffer(65); const v = new Uint8Array(b); structuredClone(b, { transfer: [b] }); bad(i => { i.acceptances[0].signature = v; }); }
});
test('bad shapes, extras, accessors and forged fields', () => {
  bad(i => { delete i.domain; });
  bad(i => { i.approved = true; });
  bad(i => { i.terms.mode = 0; });
  bad(i => { i.privateAgreement.extra = 1; });
  bad(i => { Object.defineProperty(i.terms, 'buyer', { get() { throw Error('getter'); }, enumerable: true }); });
  bad(i => { Object.defineProperty(i.domain, 'chainId', { value: '1', enumerable: false }); });
  bad(i => { i.domain[Symbol('s')] = 1; });
  bad(i => { i.terms = Object.create({ x: 1 }, Object.getOwnPropertyDescriptors(i.terms)); });
  bad(i => { delete i.acceptances[0]; });
  bad(i => { i.acceptances.extra = 1; });
  bad(i => { i.acceptances = Object.assign(Object.create({}), i.acceptances); });
  // ECMAScript does not expose a general transparent-Proxy detector; exercise a hostile meta-operation instead.
  bad(i => { i.privateAgreement.capabilities = new Proxy([], { ownKeys() { throw Error('PRIVATE-FIXTURE trap'); } }); });
  const r = Proxy.revocable({}, {}); r.revoke(); bad(i => { i.domain = r.proxy; });
  for (const v of [null, 1, 'x', []]) assert.throws(() => parse(v), e => e.code === 'INVALID_INPUT');
  bad(i => { i.privateAgreement.capabilities = [{ id: 'a', version: '1', policyHash: h('b'), x: 1 }]; Object.freeze(i.privateAgreement); });
});
test('version handling', () => {
  bad(i => { i.privateAgreement.v = 2; }, 'UNSUPPORTED_VERSION');
  bad(i => { i.privateAgreement.v = '1'; }, 'UNSUPPORTED_VERSION');
});
test('instruction byte boundary and code-unit guard', () => {
  const edge = text => { const i = make(); i.privateAgreement.paymentInstructions = text; return () => parse(i); };
  assert.equal(parse(make()).privateAgreement.paymentInstructions.length > 0, true);
  assert.doesNotThrow(edge('a'.repeat(4096))); assert.doesNotThrow(edge(''));
  assert.doesNotThrow(edge('\u00e9'.repeat(2048))); assert.doesNotThrow(edge('\u20ac'.repeat(1365) + 'x'));
  assert.throws(edge('\u20ac'.repeat(1365) + 'ab'), e => e.code === 'LIMIT_EXCEEDED');
  assert.doesNotThrow(edge('\u{1F600}'.repeat(1024)));
  assert.throws(edge('a'.repeat(4097)), e => e.code === 'LIMIT_EXCEEDED');
  assert.throws(edge('\u00e9'.repeat(2049)), e => e.code === 'LIMIT_EXCEEDED');
  assert.throws(edge('\u{1F600}'.repeat(1025)), e => e.code === 'LIMIT_EXCEEDED');
  assert.throws(edge('\ud800'), e => e.code === 'INVALID_INPUT');
  assert.throws(edge('\udc00x'), e => e.code === 'INVALID_INPUT');
  bad(i => { i.privateAgreement.paymentInstructions = 5; });
});
test('fixed private fields', () => {
  for (const [k, v] of [['orderId', 'A'.repeat(64)], ['orderId', 'a'.repeat(63)], ['agreementSalt', 'g'.repeat(64)], ['revision', '0'], ['revision', '01'],
    ['revision', '18446744073709551616'], ['revision', 1], ['fiatCurrency', 'usd'], ['fiatCurrency', 'USDX'], ['fiatMinorUnits', '0'],
    ['fiatMinorUnits', '340282366920938463463374607431768211456'], ['fiatMinorUnits', '9'.repeat(5000)], ['fiatScale', 7], ['fiatScale', -1], ['fiatScale', 1.5], ['fiatScale', '2']])
    bad(i => { i.privateAgreement[k] = v; });
  const ok = make(); ok.privateAgreement.revision = '18446744073709551615'; ok.privateAgreement.fiatMinorUnits = '340282366920938463463374607431768211455'; ok.privateAgreement.fiatScale = 6; parse(ok);
});
test('capabilities', () => {
  const cap = (id, version = '1') => ({ id, version, policyHash: h('b') });
  const set = list => { const i = make(); i.privateAgreement.capabilities = list; return () => parse(i); };
  assert.doesNotThrow(set([])); assert.doesNotThrow(set(Array.from({ length: 8 }, (_, n) => cap('c' + n))));
  assert.throws(set(Array.from({ length: 9 }, (_, n) => cap('c' + n))), e => e.code === 'LIMIT_EXCEEDED');
  assert.throws(set([cap('b'), cap('a')]), e => e.code === 'INVALID_INPUT');
  assert.throws(set([cap('a'), cap('a')]), e => e.code === 'INVALID_INPUT');
  assert.throws(set([cap('')]), e => e.code === 'INVALID_INPUT');
  assert.throws(set([cap('a b')]), e => e.code === 'INVALID_INPUT');
  assert.throws(set([cap('\u00e9')]), e => e.code === 'INVALID_INPUT');
  assert.throws(set([cap('a'.repeat(65))]), e => e.code === 'LIMIT_EXCEEDED');
  assert.doesNotThrow(set([cap('a'.repeat(64))]));
  assert.throws(set([cap('a', '')]), e => e.code === 'INVALID_INPUT');
  assert.doesNotThrow(set([cap('a', '\u00e9'.repeat(16))]));
  assert.throws(set([cap('a', '\u00e9'.repeat(17))]), e => e.code === 'LIMIT_EXCEEDED');
  const spaced = make(); spaced.privateAgreement.capabilities = [cap('a', ' v 1 ')]; assert.equal(parse(spaced).privateAgreement.capabilities[0].version, ' v 1 ');
  assert.throws(set([{ id: 'a', version: '1', policyHash: 'B'.repeat(64) }]), e => e.code === 'INVALID_INPUT');
  assert.throws(set([cap('a', 'x'.repeat(33))]), e => e.code === 'LIMIT_EXCEEDED');
  assert.throws(set(Object.assign([cap('a')], { 1: cap('b') }).slice(0, 1).concat([,])), e => e.code === 'INVALID_INPUT');
});
test('domain and terms', () => {
  const U256 = (1n << 256n) - 1n;
  const d = v => { const i = make(); i.domain.chainId = v; return () => parse(i); };
  assert.doesNotThrow(d(U256.toString())); assert.throws(d((U256 + 1n).toString()), e => e.code === 'INVALID_INPUT');
  for (const v of ['0', '01', '9'.repeat(200), 1, '1.0', '-1']) assert.throws(d(v), e => e.code === 'INVALID_INPUT');
  for (const v of [A('0'), '0x' + 'A'.repeat(40), '0x1', 5]) bad(i => { i.domain.verifyingContract = v; });
  bad(i => { i.terms.buyer = i.terms.seller; });
  bad(i => { i.terms.seller = A('0'); }); bad(i => { i.terms.buyer = A('0'); });
  bad(i => { i.terms.assetKind = 'native'; });
  bad(i => { i.terms.asset = A('0'); });
  bad(i => { i.terms.assetKind = 'spl'; });
  bad(i => { i.terms.networkId = 'a..b'; }); bad(i => { i.terms.deploymentId = '-x'; }); bad(i => { i.terms.networkId = 'a'.repeat(65); }); bad(i => { i.terms.networkId = ''; });
  bad(i => { i.terms.amountBaseUnits = '0'; });
  bad(i => { i.terms.amountBaseUnits = (U256 + 1n).toString(); }); bad(i => { i.terms.amountBaseUnits = '9'.repeat(100); });
  bad(i => { i.terms.revision = '0'; }); bad(i => { i.terms.revision = '18446744073709551616'; });
  bad(i => { i.terms.acceptBeforeSeconds = '18446744073709551616'; }); bad(i => { i.terms.escrowExpirySeconds = '-1'; });
  for (const k of ['orderId', 'privateAgreementHash', 'capabilitiesHash', 'sellerNonce']) bad(i => { i.terms[k] = 'A'.repeat(64); });
  const ok = make(); ok.terms.acceptBeforeSeconds = '0'; ok.terms.escrowExpirySeconds = '18446744073709551615'; ok.terms.amountBaseUnits = U256.toString(); parse(ok);
});
test('acceptance structure', () => {
  bad(i => { i.acceptances[1].role = 'seller'; });
  bad(i => { i.acceptances.pop(); });
  assert.throws(() => { const i = make(); i.acceptances.push({ ...i.acceptances[0] }); parse(i); }, e => e.code === 'LIMIT_EXCEEDED');
  bad(i => { i.acceptances[0].role = 'admin'; });
  bad(i => { i.acceptances[0].termsHash = 'A'.repeat(64); });
  bad(i => { i.acceptances[0].walletAccount = '0x' + 'A'.repeat(40); });
  bad(i => { i.acceptances[0].extra = 1; });
  bad(i => { i.acceptances[0] = null; });
});
test('injected native-copy failure zeros every observed allocated output', () => {
  const seen = []; const input = make();
  copyHook = target => {
    seen.push(target);
    if (seen.length === 2) {
      assert.equal(seen[0].byteLength, 65); assert.equal(seen[0][0], 7, 'first copy completed before injected failure');
      assert.equal(target.byteLength, 65); assert.ok(target.every(b => b === 0));
      throw new TypeError('injected copy failure');
    }
  };
  try { assert.throws(() => parse(input), e => e.code === 'INVALID_INPUT' && e.name === 'CoreSchemaError'); }
  finally { copyHook = null; }
  assert.equal(seen.length, 2);
  for (const target of seen) { assert.equal(Object.getPrototypeOf(target), Uint8Array.prototype); assert.equal(target.byteLength, 65); assert.ok(target.every(b => b === 0)); }
  assert.notEqual(seen[0].buffer, input.acceptances[0].signature.buffer); assert.notEqual(seen[1].buffer, input.acceptances[1].signature.buffer);
  assert.equal(input.acceptances[0].signature[0], 7); assert.equal(input.acceptances[1].signature[0], 8);
  assert.equal(Uint8Array.prototype.set, nativeSet);
  assert.equal(parse(make()).acceptances[1].signature[3], 8);
});
test('lengths are bounded before BigInt/encode', () => {
  const orig = globalThis.BigInt; const sentinel = '9'.repeat(5000); let sentinelCalls = 0;
  globalThis.BigInt = new Proxy(orig, { apply(t, th, a) { if (a[0] === sentinel) sentinelCalls++; return Reflect.apply(t, th, a); } });
  try { bad(i => { i.terms.amountBaseUnits = '9'.repeat(5000); }); } finally { globalThis.BigInt = orig; }
  assert.equal(globalThis.BigInt, orig);
  assert.equal(sentinelCalls, 0);
  const te = TextEncoder.prototype.encodeInto; const enc = TextEncoder.prototype.encode; let encodes = 0;
  TextEncoder.prototype.encode = function (...a) { encodes++; return enc.apply(this, a); };
  try { bad(i => { i.privateAgreement.paymentInstructions = 'a'.repeat(100000); }, 'LIMIT_EXCEEDED'); } finally { TextEncoder.prototype.encode = enc; }
  assert.equal(encodes, 0); assert.equal(te, TextEncoder.prototype.encodeInto);
});
test('forged CoreSchemaError thrown by hostile meta-traps is replaced by a fresh fixed error without touching accessors', () => {
  const Core = parse(make()) && Object.getPrototypeOf(((() => { try { parse(null); } catch (e) { return e; } })())).constructor;
  let touched = 0;
  const forged = new Core('LIMIT_EXCEEDED');
  Object.defineProperty(forged, 'message', { get() { touched++; return 'PRIVATE-FIXTURE message'; } });
  Object.defineProperty(forged, 'code', { get() { touched++; throw new Error('PRIVATE-FIXTURE code'); } });
  const traps = ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'];
  for (const trap of traps) {
    const input = make();
    input.domain = new Proxy(input.domain, { [trap]() { throw forged; } });
    let caught;
    try { parse(input); } catch (e) { caught = e; }
    assert.notEqual(caught, forged);
    assert.equal(caught.name, 'CoreSchemaError');
    assert.equal(caught.code, 'INVALID_INPUT');
    assert.equal(caught.message, 'Invalid core data.');
  }
  assert.equal(touched, 0);
});
