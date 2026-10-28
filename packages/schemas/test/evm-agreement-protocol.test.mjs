import test from 'node:test';
import assert from 'node:assert/strict';
// UNEXECUTED tests. Exact missing-target guard only: transitive failures are rethrown.
const moduleUrl = new URL('../src/evm-agreement-protocol.ts', import.meta.url);
const api = await import(moduleUrl.href).catch(error => {
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && error?.url === moduleUrl.href) return {};
  throw error;
});
const parseReq = (...a) => { assert.equal(typeof api.parseEvmAgreementCheckRequest, 'function', 'missing parseEvmAgreementCheckRequest'); return api.parseEvmAgreementCheckRequest(...a); };
const parseRep = (...a) => { assert.equal(typeof api.parseEvmAgreementCheckReply, 'function', 'missing parseEvmAgreementCheckReply'); return api.parseEvmAgreementCheckReply(...a); };
const MAX = Number.MAX_SAFE_INTEGER - 1;
const h = c => c.repeat(64);
const A = c => '0x' + c.repeat(40);
const body = () => ({
  privateAgreement: { v: 1, orderId: h('a'), revision: '1', fiatCurrency: 'USD', fiatMinorUnits: '10000', fiatScale: 2,
    paymentInstructions: 'PRIVATE-FIXTURE pay', capabilities: [{ id: 'alpha', version: '1', policyHash: h('b') }], agreementSalt: h('c') },
  domain: { chainId: '11155111', verifyingContract: A('1') },
  terms: { orderId: h('a'), revision: '1', networkId: 'eip155-1', deploymentId: 'escrow-v1', seller: A('2'), buyer: A('3'),
    assetKind: 'erc20', asset: A('4'), amountBaseUnits: '1000', privateAgreementHash: h('d'), capabilitiesHash: h('e'),
    sellerNonce: h('f'), acceptBeforeSeconds: '100', escrowExpirySeconds: '5000' },
  acceptances: [
    { termsHash: h('9'), role: 'seller', walletAccount: A('2'), signature: new Uint8Array(65).fill(7) },
    { termsHash: h('9'), role: 'buyer', walletAccount: A('3'), signature: new Uint8Array(65).fill(8) }]
});
const req = (over = {}) => ({ version: 1, requestId: 1, generation: 0, operation: 'checkEvmAgreement', input: body(), ...over });
const okResult = () => ({ ok: true, value: { testOnly: true, economicPreparationAllowed: false, termsHash: h('1'), accounts: { seller: A('2'), buyer: A('3') } } });
const rep = (over = {}) => ({ version: 1, requestId: 1, generation: 0, operation: 'checkEvmAgreement', kind: 'response', result: okResult(), ...over });
const badReq = (r, code = 'INVALID_INPUT') => assert.throws(() => parseReq(r), e => e.name === 'CoreSchemaError' && e.code === code && !String(e.message).includes('PRIVATE-FIXTURE'));
const badRep = r => assert.throws(() => parseRep(r), e => e.name === 'CoreSchemaError' && e.code === 'INVALID_INPUT' && e.message === 'Invalid core data.');
const wipe = r => { for (const a of r.input.acceptances) a.signature.fill(0); };

test('request: valid minimal snapshot is fresh, frozen and owned', () => {
  const src = req(), out = parseReq(src);
  try {
    assert.ok(Object.isFrozen(out) && Object.isFrozen(out.input) && Object.isFrozen(out.input.terms));
    assert.deepEqual(Object.keys(out).sort(), ['generation', 'input', 'operation', 'requestId', 'version']);
    assert.notEqual(out, src); assert.notEqual(out.input, src.input);
    assert.equal(out.input.acceptances.length, 2);
    assert.notEqual(out.input.acceptances[0].signature.buffer, src.input.acceptances[0].signature.buffer);
    src.input.acceptances[0].signature.fill(0); src.input.terms.amountBaseUnits = '2';
    assert.ok(out.input.acceptances[0].signature.some(b => b !== 0));
    assert.equal(out.input.terms.amountBaseUnits, '1000');
  } finally { wipe(out); }
});

test('request: native assetKind also structurally valid', () => {
  const src = req(); src.input.terms.assetKind = 'native'; src.input.terms.asset = A('0');
  const out = parseReq(src);
  try { assert.equal(out.input.terms.assetKind, 'native'); } finally { wipe(out); }
});

test('request: header counter bounds', () => {
  for (const requestId of [1, 2, MAX]) { const out = parseReq(req({ requestId })); try { assert.equal(out.requestId, requestId); } finally { wipe(out); } }
  for (const generation of [0, 1, MAX]) { const out = parseReq(req({ generation })); try { assert.equal(out.generation, generation); } finally { wipe(out); } }
  for (const requestId of [0, MAX + 1, -1, 1.5, NaN, Infinity, '1', null, 2 ** 53]) badReq(req({ requestId }));
  for (const generation of [-1, MAX + 1, 0.5, NaN, Infinity, '0', null, 2 ** 53]) badReq(req({ generation }));
  badReq(req({ version: 2 })); badReq(req({ version: '1' })); badReq(req({ operation: 'status' })); badReq(req({ operation: 'checkevmagreement' }));
});

test('request: outer exact fields, symbols, accessors, non-plain', () => {
  const missing = req(); delete missing.generation; badReq(missing);
  badReq(req({ extra: true }));
  const sym = req(); sym[Symbol('x')] = 1; badReq(sym);
  const hid = req(); Object.defineProperty(hid, 'requestId', { enumerable: false, value: 1 }); badReq(hid);
  let calls = 0; const acc = req(); Object.defineProperty(acc, 'generation', { enumerable: true, get() { calls++; throw Error('PRIVATE-FIXTURE'); } });
  badReq(acc); assert.equal(calls, 0);
  badReq(Object.assign(Object.create({ x: 1 }), req()));
  badReq([]); badReq(null); badReq('x'); badReq(7);
  const nullProto = Object.assign(Object.create(null), req()); const out = parseReq(nullProto); wipe(out);
});

test('request: bad header fails before the body is touched', () => {
  let touched = 0;
  const spy = new Proxy(body(), {
    ownKeys(t) { touched++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, k) { touched++; return Reflect.getOwnPropertyDescriptor(t, k); },
    get(t, k) { touched++; return Reflect.get(t, k); }, getPrototypeOf(t) { touched++; return Reflect.getPrototypeOf(t); }
  });
  badReq({ version: 1, requestId: 0, generation: 0, operation: 'checkEvmAgreement', input: spy });
  badReq({ version: 1, requestId: 1, generation: -1, operation: 'checkEvmAgreement', input: spy });
  badReq({ version: 3, requestId: 1, generation: 0, operation: 'checkEvmAgreement', input: spy });
  badReq({ version: 1, requestId: 1, generation: 0, operation: 'x', input: spy });
  assert.equal(touched, 0);
});

test('request: body errors are the original native typed errors', () => {
  const lim = req(); lim.input.privateAgreement.paymentInstructions = 'x'.repeat(4097); badReq(lim, 'LIMIT_EXCEEDED');
  const ver = req(); ver.input.privateAgreement.v = 2; badReq(ver, 'UNSUPPORTED_VERSION');
  const ext = req(); ext.input.extra = 1; badReq(ext);
  const dec = req(); dec.input.terms.amountBaseUnits = '9'.repeat(5000); badReq(dec);
  const sig = req(); sig.input.acceptances[0].signature = new Uint8Array(66); badReq(sig);
  const sur = req(); sur.input.privateAgreement.paymentInstructions = '\ud800'; badReq(sur);
  const px = req(); px.input.acceptances[0].signature = new Proxy(px.input.acceptances[0].signature, {}); badReq(px);
  const sw = req(); sw.input.acceptances[0].termsHash = h('f'); const out = parseReq(sw); wipe(out); // bytes never prove a signature
});

test('request: meta-trap throws become fresh fixed INVALID_INPUT', () => {
  const forged = Object.assign(new Error('PRIVATE-FIXTURE forged'), { name: 'CoreSchemaError', code: 'LIMIT_EXCEEDED' });
  const trap = new Proxy({}, { ownKeys() { throw forged; }, getPrototypeOf() { throw forged; } });
  assert.throws(() => parseReq(req({ input: trap })), e => e !== forged && e.name === 'CoreSchemaError' && e.code === 'INVALID_INPUT' && e.message === 'Invalid core data.');
  const outerTrap = new Proxy(req(), { ownKeys() { throw forged; }, getPrototypeOf() { throw forged; } });
  assert.throws(() => parseReq(outerTrap), e => e !== forged && e.code === 'INVALID_INPUT' && e.message === 'Invalid core data.');
  const r = Proxy.revocable(req(), {}); r.revoke(); badReq(r.proxy);
  const rr = Proxy.revocable({}, {}); rr.revoke(); badReq(req({ input: rr.proxy }));
  badRep((() => { const p = new Proxy(rep(), { ownKeys() { throw forged; }, getPrototypeOf() { throw forged; } }); return p; })());
  const rv = Proxy.revocable(rep(), {}); rv.revoke(); badRep(rv.proxy);
});

test('reply: valid success and every known failure code', () => {
  const out = parseRep(rep());
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.result) && Object.isFrozen(out.result.value) && Object.isFrozen(out.result.value.accounts));
  assert.deepEqual(Object.keys(out).sort(), ['generation', 'kind', 'operation', 'requestId', 'result', 'version']);
  assert.equal(out.result.value.testOnly, true); assert.equal(out.result.value.economicPreparationAllowed, false);
  const codes = ['INVALID_INPUT', 'UNSUPPORTED_VERSION', 'UNSUPPORTED_PROVIDER', 'WRONG_CHAIN', 'UNAUTHORIZED', 'USER_REJECTED', 'LOCKED', 'CONFLICT', 'UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'LIMIT_EXCEEDED', 'INTEGRITY_FAILURE', 'BROADCAST_UNKNOWN', 'EXPIRED', 'BUSY'];
  for (const code of codes) {
    const f = parseRep(rep({ result: { ok: false, error: { code } } }));
    assert.equal(f.result.ok, false); assert.equal(f.result.error.code, code); assert.ok(Object.isFrozen(f.result.error));
  }
});

test('reply: header bounds and exact discriminators', () => {
  for (const requestId of [1, MAX]) parseRep(rep({ requestId }));
  for (const generation of [0, MAX]) parseRep(rep({ generation }));
  for (const requestId of [0, MAX + 1, -1, 1.5, NaN, '1']) badRep(rep({ requestId }));
  for (const generation of [-1, MAX + 1, 0.5, Infinity, '0']) badRep(rep({ generation }));
  badRep(rep({ version: 2 })); badRep(rep({ operation: 'status' })); badRep(rep({ kind: 'event' })); badRep(rep({ kind: 'request' }));
});

test('reply: rich errors, unknown codes and authority fields reject', () => {
  badRep(rep({ result: { ok: false, error: { code: 'BOGUS' } } }));
  badRep(rep({ result: { ok: false, error: { code: 'busy' } } }));
  badRep(rep({ result: { ok: false, error: { code: 'INVALID_INPUT', retryable: false } } }));
  badRep(rep({ result: { ok: false, error: { code: 'INVALID_INPUT', retryable: false, action: 'none', correlationId: 'x', messageKey: 'k' } } }));
  badRep(rep({ result: { ok: false, error: {} } }));
  badRep(rep({ result: { ok: false } })); badRep(rep({ result: { ok: false, error: null } }));
  badRep(rep({ result: { ok: false, error: { code: 'BUSY' }, value: okResult().value } }));
  badRep(rep({ result: { ok: 'true', value: okResult().value } }));
  badRep(rep({ result: { ok: true } }));
  badRep(rep({ result: { ok: true, value: okResult().value, error: { code: 'BUSY' } } }));
  badRep(rep({ result: null })); badRep(rep({ result: [] }));
  badRep(rep({ extra: 1 })); badRep(rep({ handle: 'x' })); badRep(rep({ status: 'ok' }));
});

test('reply: value flags, hashes and accounts', () => {
  const v = over => rep({ result: { ok: true, value: { ...okResult().value, ...over } } });
  badRep(v({ testOnly: false })); badRep(v({ economicPreparationAllowed: true })); badRep(v({ approved: true }));
  badRep(v({ termsHash: 'A'.repeat(64) })); badRep(v({ termsHash: 'a'.repeat(63) })); badRep(v({ termsHash: 5 }));
  badRep(v({ accounts: { seller: A('2'), buyer: A('2') } }));
  badRep(v({ accounts: { seller: A('0'), buyer: A('3') } })); badRep(v({ accounts: { seller: A('2'), buyer: A('0') } }));
  badRep(v({ accounts: { seller: '0x' + 'A'.repeat(40), buyer: A('3') } }));
  badRep(v({ accounts: { seller: A('2') } })); badRep(v({ accounts: { seller: A('2'), buyer: A('3'), extra: 1 } }));
  const noFlag = { ...okResult().value }; delete noFlag.testOnly; badRep(rep({ result: { ok: true, value: noFlag } }));
});

test('reply: data-only; invented values and mismatched ids parse structurally', () => {
  const out = parseRep(rep({ requestId: 999, generation: 42, result: { ok: true, value: { testOnly: true, economicPreparationAllowed: false, termsHash: h('7'), accounts: { seller: A('5'), buyer: A('6') } } } }));
  assert.equal(out.requestId, 999); assert.equal(out.generation, 42);
});

test('reply: symbols, non-enumerable, accessors and custom prototypes', () => {
  const sym = rep(); sym[Symbol('x')] = 1; badRep(sym);
  const hid = rep(); Object.defineProperty(hid, 'kind', { enumerable: false, value: 'response' }); badRep(hid);
  let calls = 0;
  const acc = rep(); Object.defineProperty(acc, 'result', { enumerable: true, get() { calls++; throw Error('PRIVATE-FIXTURE'); } }); badRep(acc);
  const vacc = rep(); Object.defineProperty(vacc.result.value, 'termsHash', { enumerable: true, get() { calls++; throw Error('PRIVATE-FIXTURE'); } }); badRep(vacc);
  const eacc = rep({ result: { ok: false, error: {} } }); Object.defineProperty(eacc.result.error, 'code', { enumerable: true, get() { calls++; throw Error('PRIVATE-FIXTURE'); } }); badRep(eacc);
  assert.equal(calls, 0);
  badRep(Object.assign(Object.create({ x: 1 }), rep()));
  badRep(rep({ result: Object.assign(Object.create({ x: 1 }), okResult()) }));
  badRep(rep({ result: { ok: true, value: Object.assign(Object.create({ x: 1 }), okResult().value) } }));
  badRep([]); badRep(null); badRep(undefined); badRep('x');
  parseRep(Object.assign(Object.create(null), rep()));
});

test('reply: errors contain no private sentinel and are fixed', () => {
  const sentinel = rep({ result: { ok: false, error: { code: 'PRIVATE-FIXTURE secret' } } });
  assert.throws(() => parseRep(sentinel), e => e.name === 'CoreSchemaError' && e.message === 'Invalid core data.' && !JSON.stringify(e).includes('PRIVATE-FIXTURE'));
});

test('reply: changing result discriminator between probe and snapshot is rejected in both branches', () => {
  for (const first of [true, false]) {
    let reads = 0;
    const result = first ? okResult() : { ok: false, error: { code: 'CONFLICT' } };
    const changing = new Proxy(result, { getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      return key === 'ok' ? { ...descriptor, value: ++reads === 1 ? first : !first } : descriptor;
    } });
    badRep(rep({ result: changing })); assert.equal(reads, 2);
  }
});
