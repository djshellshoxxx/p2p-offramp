// P2P-PARSER-SEEDED-FUZZ-08 helper. Test glue only; NONSECURITY deterministic test-input generation.
// Uses node:crypto SHA-256 counter mode over a fixed seed/index layout. No randomBytes/Math.random/time in generation.
import { createHash } from 'node:crypto';
import { existsSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MAPPING_VERSION = 'p2p-parser-fuzz-08/v2';
const LABEL = 'p2p-parser-fuzz-08/nonsecurity-test-input';
const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), '..');
const PARSER_URL = new URL('../packages/schemas/src/evm-agreement-input.ts', import.meta.url).href;
const parserModule = await import(PARSER_URL);
export const realParser = parserModule.parseEvmAgreementInput;
const CORE_URL = new URL('../packages/schemas/src/core.ts', import.meta.url).href;
const CoreSchemaError = (await import(CORE_URL)).CoreSchemaError;

export const FAMILIES = ['instruction-text', 'text-mutation', 'decimal', 'hex-address', 'capabilities', 'signature-views', 'shape', 'resource'];
const MAX_METRICS_BYTES = 1048576;
const MAX_COUNTEREXAMPLE_BYTES = 4096;

class HarnessFault extends Error {}

// ---------- deterministic byte stream ----------
class Stream {
  constructor(seed, index, family) { this.seed = seed; this.index = index; this.family = family; this.ctr = 0; this.buf = Buffer.alloc(0); this.pos = 0; }
  refill() {
    const h = createHash('sha256');
    const hdr = Buffer.alloc(12);
    hdr.writeUInt32BE(this.seed >>> 0, 0); hdr.writeUInt32BE(this.index >>> 0, 4); hdr.writeUInt32BE(this.ctr++ >>> 0, 8);
    h.update(LABEL); h.update('\0'); h.update(MAPPING_VERSION); h.update('\0'); h.update(hdr);
    this.buf = h.digest(); this.pos = 0;
  }
  byte() { if (this.pos >= this.buf.length) this.refill(); return this.buf[this.pos++]; }
  u32() { return ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0; }
  below(n) { return n <= 1 ? 0 : this.u32() % n; }
  range(lo, hi) { return lo + this.below(hi - lo + 1); }
  pick(arr) { return arr[this.below(arr.length)]; }
  hexChars(n, alphabet = '0123456789abcdef') { let s = ''; for (let i = 0; i < n; i++) s += alphabet[this.below(alphabet.length)]; return s; }
}

// ---------- fresh valid base graph (factory shape from parser tests) ----------
const h = c => c.repeat(64);
const A = c => '0x' + c.repeat(40);
function makeBase() {
  return {
    privateAgreement: { v: 1, orderId: h('a'), revision: '1', fiatCurrency: 'USD', fiatMinorUnits: '10000', fiatScale: 2,
      paymentInstructions: 'PRIVATE-FIXTURE pay', capabilities: [{ id: 'alpha', version: '1', policyHash: h('b') }], agreementSalt: h('c') },
    domain: { chainId: '11155111', verifyingContract: A('1') },
    terms: { orderId: h('a'), revision: '1', networkId: 'eip155-1', deploymentId: 'escrow-v1', seller: A('2'), buyer: A('3'),
      assetKind: 'erc20', asset: A('4'), amountBaseUnits: '1000', privateAgreementHash: h('d'), capabilitiesHash: h('e'),
      sellerNonce: h('f'), acceptBeforeSeconds: '100', escrowExpirySeconds: '5000' },
    acceptances: [
      { termsHash: h('9'), role: 'seller', walletAccount: A('2'), signature: new Uint8Array(65).fill(7) },
      { termsHash: h('9'), role: 'buyer', walletAccount: A('3'), signature: new Uint8Array(65).fill(8) }]
  };
}

// ---------- generation helpers ----------
const SCALARS = {
  ascii: ['a', 'Z', '0', ' ', '~', '"', '\\', '\n', '\t'],
  two: ['\u00e9', '\u03a9', '\u0416', '\u07ff'],
  three: ['\u20ac', '\u4e2d', '\uffff', '\u0800', '\u0301'],
  four: ['\u{1F600}', '\u{10000}', '\u{10FFFF}', '\u{1D11E}']
};
function pickScalar(s, kind) { return s.pick(SCALARS[kind]); }
const U8LEN = { ascii: 1, two: 2, three: 3, four: 4 };
const KINDS = ['ascii', 'two', 'three', 'four'];
// Valid text of exactly utf8 byte target (<=4096), mixing scalar kinds.
function textOfBytes(s, target) {
  let out = '', bytes = 0, guardN = 0;
  while (bytes < target && guardN++ < 5000) {
    const rem = target - bytes;
    const kinds = KINDS.filter(k => U8LEN[k] <= rem);
    const k = s.below(3) === 0 ? 'ascii' : s.pick(kinds);
    const kk = U8LEN[k] <= rem ? k : 'ascii';
    out += pickScalar(s, kk); bytes += U8LEN[kk];
  }
  return out;
}
// Largest valid text whose UTF-16 length <= 4096 and utf8 <= 4096: use mix. Byte-boundary biased targets.
function boundaryLen(s, cap) { return s.pick([0, 1, 2, cap - 2, cap - 1, cap, s.range(0, cap)]); }
function jsonRoundtrip(str) { return JSON.parse(JSON.stringify(str)); }
const BAD_SURROGATES = [
  { name: 'lone-high', make: p => p + '\uD800' },
  { name: 'lone-low', make: p => p + '\uDC00' },
  { name: 'reversed', make: p => p + '\uDC00\uD800' },
  { name: 'high-then-ascii', make: p => p + '\uD83Da' },
  { name: 'low-first', make: p => '\uDE00' + p }
];
function digitsStr(s, n) { // canonical decimal of exactly n digits, first nonzero
  let r = String(s.range(1, 9));
  for (let i = 1; i < n; i++) r += String(s.below(10));
  return r;
}
const LIMITS = {
  revision: { cap: 20, min: '1', max: '18446744073709551615' },
  fiatMinorUnits: { cap: 39, min: '1', max: '340282366920938463463374607431768211455' },
  chainId: { cap: 78, min: '1', max: '115792089237316195423570985008687907853269984665640564039457584007913129639935' },
  amountBaseUnits: { cap: 78, min: '1', max: '115792089237316195423570985008687907853269984665640564039457584007913129639935' },
  acceptBeforeSeconds: { cap: 20, min: '0', max: '18446744073709551615' },
  escrowExpirySeconds: { cap: 20, min: '0', max: '18446744073709551615' }
};
const DEC_FIELDS = Object.keys(LIMITS);
function setDec(input, field, value) {
  if (field === 'fiatMinorUnits' || field === 'revision') input.privateAgreement[field] = value;
  if (field === 'revision') input.terms.revision = value;
  if (field === 'chainId') input.domain.chainId = value;
  if (field === 'amountBaseUnits' || field === 'acceptBeforeSeconds' || field === 'escrowExpirySeconds') input.terms[field] = value;
}
function decValid(s, field) {
  const L = LIMITS[field];
  const choice = s.below(5);
  if (choice === 0) return L.min;
  if (choice === 1) return L.max;
  if (choice === 2) return L.min === '0' ? '1' : '2';
  return digitsStr(s, s.range(1, L.max.length - 1));
}
function hexAlphabetBad(s, n) { return s.hexChars(n - 1) + s.pick(['g', 'G', 'x', 'Z', ' ', '-']); }

// ---------- family generators: return { input, expected, mutation, controls } ----------
function fam0(s) { // valid instruction text
  const input = makeBase();
  const mode = s.below(4);
  let txt;
  if (mode === 0) { // only one scalar kind
    const k = s.pick(KINDS); const unit = U8LEN[k]; const maxN = Math.min(Math.floor(4096 / unit), k === 'four' ? 1024 : 4096);
    const n = s.pick([0, 1, maxN, maxN - 1, s.range(0, maxN)]); txt = '';
    for (let i = 0; i < n; i++) txt += pickScalar(s, k);
  } else if (mode === 1) { // byte-boundary biased mix
    txt = textOfBytes(s, boundaryLen(s, 4096));
  } else if (mode === 2) { // JSON escapes + combining
    let raw = '';
    const n = s.range(0, 64);
    for (let i = 0; i < n; i++) raw += s.pick(['"', '\\', '\n', '\t', '\u0301', '\u0000', '\u001f', 'x', '\u20ac', '\u{1F600}']);
    txt = raw;
  } else { txt = ''; }
  if (s.below(2) === 0) txt = jsonRoundtrip(txt);
  if (Buffer.byteLength(txt, 'utf8') > 4096 || txt.length > 4096) txt = 'ok';
  input.privateAgreement.paymentInstructions = txt;
  return { input, expected: { accepted: true }, mutation: 'valid-text-' + mode, boundary: mode === 1,
    meta: { textUnits: txt.length, textBytes: Buffer.byteLength(txt, 'utf8'), textDigest: sha(txt).slice(0, 16) } };
}
function fam1(s) { // text mutation
  const input = makeBase();
  const m = s.below(7);
  let mutation, expected;
  if (m === 0) { input.privateAgreement.paymentInstructions = 'a'.repeat(4097); mutation = 'ascii-4097'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' }; }
  else if (m === 1) { input.privateAgreement.paymentInstructions = '\u20ac'.repeat(s.range(1366, 1400)); mutation = 'three-byte-bytes-over'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' }; }
  else if (m === 2) { // 1025 four-byte scalars => 2050 units, 4100 bytes
    input.privateAgreement.paymentInstructions = '\u{1F600}'.repeat(s.range(1025, 1030)); mutation = 'four-byte-utf8-over'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' };
  } else if (m === 3) { // surrogate patterns within code-unit cap -> INVALID_INPUT
    const bs = s.pick(BAD_SURROGATES); input.privateAgreement.paymentInstructions = bs.make(textOfBytes(s, s.range(0, 64))); mutation = 'surrogate-' + bs.name; expected = { accepted: false, code: 'INVALID_INPUT' };
  } else if (m === 4) { // over cap AND lone surrogate: code-unit cap first -> LIMIT_EXCEEDED
    input.privateAgreement.paymentInstructions = 'a'.repeat(4096) + '\uD800'; mutation = 'overcap-plus-surrogate'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' };
  } else if (m === 5) { // wellformed surrogate pairs valid within cap
    let t = ''; const n = s.range(1, 64); for (let i = 0; i < n; i++) t += pickScalar(s, 'four'); input.privateAgreement.paymentInstructions = t; mutation = 'wellformed-pairs'; expected = { accepted: true };
  } else { input.privateAgreement.paymentInstructions = s.below(2) ? 7 : null; mutation = 'nonstring-text'; expected = { accepted: false, code: 'INVALID_INPUT' }; }
  const pt = input.privateAgreement.paymentInstructions;
  return { input, expected, mutation, meta: typeof pt === 'string' ? { textUnits: pt.length, textDigest: sha(pt).slice(0, 16) } : { textType: typeof pt } };
}
function fam2(s) { // decimals
  const input = makeBase();
  const field = s.pick(DEC_FIELDS);
  const L = LIMITS[field];
  const kind = s.below(10);
  const MAXP1 = { '18446744073709551615': '18446744073709551616', '340282366920938463463374607431768211455': '340282366920938463463374607431768211456',
    '115792089237316195423570985008687907853269984665640564039457584007913129639935': '115792089237316195423570985008687907853269984665640564039457584007913129639936' };
  let mutation, expected = { accepted: false, code: 'INVALID_INPUT' };
  if (kind <= 2) { setDec(input, field, decValid(s, field)); mutation = 'valid-' + field; expected = { accepted: true }; }
  else if (kind === 3) { setDec(input, field, L.min === '0' ? '00' : '01'); mutation = 'leading-zero-' + field; }
  else if (kind === 4) { setDec(input, field, s.pick(['-1', '+1', '1.0', '1e3', ' 1', '0x1', ''])); mutation = 'syntax-' + field; }
  else if (kind === 5) { setDec(input, field, s.pick([1, null, 10n, {}, undefined])); mutation = 'nonstring-' + field; }
  else if (kind === 6) { setDec(input, field, digitsStr(s, L.cap + 1)); mutation = 'overwidth-' + field; }
  else if (kind === 7) { setDec(input, field, digitsStr(s, 5000)); mutation = 'digits5000-' + field; }
  else if (kind === 8) { setDec(input, field, MAXP1[L.max]); mutation = 'max-plus-one-' + field; }
  else if (L.min === '1') { setDec(input, field, '0'); mutation = 'zero-below-min-' + field; }
  else { setDec(input, field, L.max); mutation = 'valid-max-' + field; expected = { accepted: true }; }
  return { input, expected, mutation, boundary: kind <= 1 || kind === 9, meta: { field, kind } };
}
function fam3(s) { // hex/address
  const input = makeBase();
  const kind = s.below(9);
  let mutation, expected = { accepted: false, code: 'INVALID_INPUT' };
  if (kind <= 2) {
    input.privateAgreement.orderId = s.hexChars(64); input.terms.orderId = input.privateAgreement.orderId;
    input.privateAgreement.agreementSalt = s.hexChars(64); input.terms.sellerNonce = s.hexChars(64);
    input.domain.verifyingContract = '0x' + s.hexChars(39) + '1';
    input.terms.seller = '0x' + s.hexChars(39) + '2'; input.terms.buyer = '0x' + s.hexChars(39) + '3'; input.terms.asset = '0x' + s.hexChars(39) + '4';
    input.acceptances[0].termsHash = s.hexChars(64); input.acceptances[1].termsHash = s.hexChars(64);
    input.acceptances[0].walletAccount = input.terms.seller; input.acceptances[1].walletAccount = input.terms.buyer;
    mutation = 'valid-hex'; expected = { accepted: true };
  } else if (kind === 3) { input.privateAgreement.orderId = s.hexChars(63); mutation = 'hash-len-63'; }
  else if (kind === 4) { input.privateAgreement.agreementSalt = s.hexChars(64).toUpperCase().replace(/[0-9]/g, 'A'); mutation = 'hash-uppercase'; }
  else if (kind === 5) { input.terms.seller = '0x' + 'A'.repeat(40); mutation = 'address-uppercase'; }
  else if (kind === 6) { input.domain.verifyingContract = '0x' + '0'.repeat(40); mutation = 'zero-verifying-contract'; }
  else if (kind === 7) { input.terms.buyer = hexAlphabetBad(s, 40).replace(/^/, '0x'); mutation = 'address-alphabet'; }
  else { input.acceptances[s.below(2)].signature = s.pick(['ab'.repeat(65), 'QQ'.repeat(65), 'A'.repeat(88), '0x' + 'ab'.repeat(65)]); mutation = 'signature-string'; }
  return { input, expected, mutation, meta: { kind } };
}
function fam4(s) { // capabilities
  const input = makeBase();
  const kind = s.below(9);
  let mutation, expected = { accepted: false, code: 'INVALID_INPUT' };
  const mkCap = (id) => ({ id, version: String(s.range(1, 99)), policyHash: s.hexChars(64) });
  const ids = n => { const set = new Set(); while (set.size < n) set.add('c' + s.hexChars(s.range(1, 6))); return [...set].sort(); };
  if (kind <= 2) {
    const n = s.pick([0, 1, 8, s.range(0, 8)]); input.privateAgreement.capabilities = ids(n).map(mkCap); mutation = 'valid-caps-' + n; expected = { accepted: true };
  } else if (kind === 3) { input.privateAgreement.capabilities = ids(9).map(mkCap); mutation = 'nine-caps'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' }; }
  else if (kind === 4) { const [a, b] = ids(2); input.privateAgreement.capabilities = [mkCap(b), mkCap(a)]; mutation = 'unsorted'; }
  else if (kind === 5) { const [a] = ids(1); input.privateAgreement.capabilities = [mkCap(a), mkCap(a)]; mutation = 'duplicate'; }
  else if (kind === 6) { const arr = [mkCap('a1')]; arr.length = 2; input.privateAgreement.capabilities = arr; mutation = 'sparse'; }
  else if (kind === 7) { const c = mkCap('a1'); Object.defineProperty(c, 'id', { get() { throw new Error('PRIVATE-FIXTURE getter'); }, enumerable: true }); input.privateAgreement.capabilities = [c]; mutation = 'accessor-cap'; }
  else { const c = mkCap('a1'); c.extra = 'x'; input.privateAgreement.capabilities = [c]; mutation = 'extra-field'; }
  return { input, expected, mutation, meta: { kind } };
}
function fam5(s) { // signature views
  const input = makeBase();
  const kind = s.below(8);
  let mutation, expected = { accepted: false, code: 'INVALID_INPUT' };
  const viewAt = (len, fillFn) => { const total = s.range(len + 1, 1024); const off = s.range(1, Math.min(total - len, 512)); const buf = new ArrayBuffer(total); const v = new Uint8Array(buf, off, len); for (let i = 0; i < len; i++) v[i] = fillFn(i); return v; };
  if (kind <= 3) {
    const a = viewAt(65, i => (s.byte() + i) & 255), b = viewAt(65, i => (s.byte() ^ i) & 255); b[0] = (a[0] + 1) & 255;
    input.acceptances[0].signature = a; input.acceptances[1].signature = b; mutation = 'offset-views'; expected = { accepted: true };
  } else if (kind === 4) { input.acceptances[s.below(2)].signature = viewAt(s.pick([64, 66]), i => i); mutation = 'bad-length-view'; }
  else if (kind === 5) { input.acceptances[s.below(2)].signature = Array.from({ length: 65 }, () => 7); mutation = 'plain-array'; }
  else if (kind === 6) { input.acceptances[s.below(2)].signature = new Uint8Array(new SharedArrayBuffer(65)); mutation = 'shared-buffer'; }
  else { const ab = new ArrayBuffer(65); const v = new Uint8Array(ab); structuredCloneTransfer(ab); input.acceptances[s.below(2)].signature = v; mutation = 'detached'; }
  return { input, expected, mutation, meta: { kind } };
}
function structuredCloneTransfer(ab) { if (typeof ab.transfer === 'function') ab.transfer(); else structuredClone(ab, { transfer: [ab] }); }
function fam6(s) { // exact-field shapes
  const input = makeBase();
  const targets = [input, input.privateAgreement, input.domain, input.terms, input.acceptances[0]];
  const t = s.pick(targets);
  const kind = s.below(9);
  let mutation, expected = { accepted: false, code: 'INVALID_INPUT' };
  let getterCalled = { n: 0 };
  const firstKey = Object.keys(t)[0];
  if (kind === 0) { t.zzExtra = 1; mutation = 'extra'; }
  else if (kind === 1) { delete t[firstKey]; mutation = 'missing'; }
  else if (kind === 2) { Object.defineProperty(t, firstKey, { value: t[firstKey], enumerable: false, writable: true, configurable: true }); mutation = 'nonenumerable'; }
  else if (kind === 3) { t[Symbol('x')] = 1; mutation = 'symbol-key'; }
  else if (kind === 4) { const v = t[firstKey]; Object.defineProperty(t, firstKey, { get() { getterCalled.n++; return v; }, enumerable: true, configurable: true }); mutation = 'accessor'; }
  else if (kind === 5) { Object.setPrototypeOf(t, { inherited: 1 }); mutation = 'custom-proto'; }
  else if (kind === 6) { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); if (t === input) { return { input: proxy, expected, mutation: 'revoked-proxy-root', meta: { kind, root: true } }; } input[Object.keys(input)[s.below(4)]] = proxy; mutation = 'revoked-proxy'; }
  else if (kind === 7) { const p = new Proxy(t, { ownKeys() { throw Object.assign(new Error('PRIVATE-FIXTURE forged'), { code: 'LIMIT_EXCEEDED' }); } }); if (t === input) return { input: p, expected, mutation: 'forged-throw-proxy-root', meta: { kind, root: true } }; const slot = Object.keys(input).find(k => input[k] === t); if (slot) input[slot] = p; else input.acceptances[0] = p; mutation = 'forged-throw-proxy'; }
  else { input.acceptances = [input.acceptances[0]]; mutation = 'arity-short'; }
  return { input, expected, mutation, getterCalled, meta: { kind } };
}
function fam7(s) { // resource refusal
  const input = makeBase();
  const kind = s.below(6);
  let mutation, expected, instr = null;
  if (kind === 0) { input.privateAgreement.paymentInstructions = 'b'.repeat(4097); mutation = 'text-4097'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' }; instr = { noEncodeLen: 4097 }; }
  else if (kind === 1) { const f = s.pick(DEC_FIELDS); setDec(input, f, digitsStr(s, 5000)); mutation = 'decimal5000-' + f; expected = { accepted: false, code: 'INVALID_INPUT' }; instr = { noBigIntLen: 5000 }; }
  else if (kind === 2) { input.privateAgreement.capabilities = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, version: '1', policyHash: h('b') })); mutation = 'caps-9'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' }; instr = {}; }
  else if (kind === 3) { input.acceptances[s.below(2)].signature = new Uint8Array(66); mutation = 'signature-66'; expected = { accepted: false, code: 'INVALID_INPUT' }; instr = { noSigCopy: true }; }
  else if (kind === 4) { input.acceptances.push({ termsHash: h('9'), role: 'seller', walletAccount: A('2'), signature: new Uint8Array(65) }); mutation = 'acceptances-3'; expected = { accepted: false, code: 'LIMIT_EXCEEDED' }; instr = {}; }
  else { input.privateAgreement.fiatMinorUnits = digitsStr(s, 40); mutation = 'fiat-width-40'; expected = { accepted: false, code: 'INVALID_INPUT' }; instr = { noBigIntLen: 40 }; }
  return { input, expected, mutation, instr, meta: { kind } };
}
const GENS = [fam0, fam1, fam2, fam3, fam4, fam5, fam6, fam7];

function sha(str) { return createHash('sha256').update(str).digest('hex'); }
function assertInt(n, lo, hi, name) { if (!Number.isInteger(n) || n < lo || n > hi) throw new RangeError('invalid ' + name); }

export function generateCase(seed, index) {
  assertInt(seed, 0, 4294967295, 'seed'); assertInt(index, 0, 4095, 'index');
  const family = index % 8;
  const s = new Stream(seed, index, family);
  const g = GENS[family](s);
  // Descriptor material comes ONLY from trusted generator metadata; never traverse the (possibly hostile) graph.
  const material = g.meta || {};
  const descriptor = {
    version: MAPPING_VERSION, index, family: FAMILIES[family], familyIndex: family, mutation: g.mutation,
    expected: g.expected.accepted ? 'accept' : g.expected.code, boundaryControl: g.boundary === true, material
  };
  descriptor.digest = sha(JSON.stringify(descriptor) + ':' + seed);
  return { descriptor, input: g.input, expected: g.expected, extra: { instr: g.instr || null, getterCalled: g.getterCalled || null } };
}

// ---------- evaluation ----------
function safeCode(error) { try { const c = error && error.code; return typeof c === 'string' && c.length <= 32 ? c : 'unknown'; } catch { return 'unknown'; } }
function bounded(obj) { let t = JSON.stringify(obj); if (t.length > MAX_COUNTEREXAMPLE_BYTES) obj = { truncated: true, kind: obj.kind, observed: obj.observed }; return obj; }

function deepFrozen(v, seen = new Set()) {
  if (v === null || typeof v !== 'object') return true;
  if (v instanceof Uint8Array) return true;
  if (seen.has(v)) return true; seen.add(v);
  if (!Object.isFrozen(v)) return false;
  return Object.values(v).every(x => deepFrozen(x, seen));
}

export function evaluateCase(caseData, parser = realParser) {
  const { descriptor, input, expected, extra } = caseData;
  const info = { index: descriptor.index, family: descriptor.family, mutation: descriptor.mutation, expected: expected.accepted ? 'accept' : expected.code };
  const instr = extra && extra.instr;
  const origEncode = TextEncoder.prototype.encode, origBigInt = globalThis.BigInt, origSet = Uint8Array.prototype.set;
  const calls = { encodeMax: 0, bigintMaxLen: 0, bigintCalls: 0, sigSet: 0 };
  let snapshot, thrown, didThrow = false;
  let wrapperFault = false;
  const sentinel = new HarnessFault('wrapper');
  try {
    try {
    if (instr) {
      TextEncoder.prototype.encode = function (...a) { try { const v = a[0]; if (typeof v === 'string' && v.length > calls.encodeMax) calls.encodeMax = v.length; } catch { wrapperFault = true; throw sentinel; } return origEncode.apply(this, a); };
      const Wrapped = function (...a) { try { calls.bigintCalls++; const v = a[0]; if (typeof v === 'string' && v.length > calls.bigintMaxLen) calls.bigintMaxLen = v.length; } catch { wrapperFault = true; throw sentinel; } return origBigInt(...a); };
      try { Object.defineProperties(Wrapped, Object.getOwnPropertyDescriptors(origBigInt)); } catch { /* ignore */ }
      globalThis.BigInt = Wrapped;
    }
    try { snapshot = parser(input); } catch (e) { didThrow = true; thrown = e; }
    } finally {
      TextEncoder.prototype.encode = origEncode; globalThis.BigInt = origBigInt; Uint8Array.prototype.set = origSet;
    }
    if (wrapperFault || thrown === sentinel) return { status: 'harness-error', ...info, observed: 'wrapper-fault' };
    const fail = (observed, why) => ({ status: 'counterexample', ...info, observed, why });
    if (thrown instanceof HarnessFault) return { status: 'harness-error', ...info, observed: 'harness-fault' };
    if (expected.accepted) {
      if (didThrow) return fail(safeCode(thrown), 'unexpected-refusal');
      return checkAccept(snapshot, input, info, fail);
    }
    if (!didThrow) return fail('accepted', 'unexpected-accept');
    let isCore = false;
    try { isCore = thrown instanceof CoreSchemaError; } catch { isCore = false; }
    if (!isCore) return fail('foreign', 'foreign-error');
    const msg = thrown.message;
    if (msg !== 'Invalid core data.') return fail(safeCode(thrown), 'unsanitized-message');
    if (thrown.code !== expected.code) return fail(thrown.code, 'wrong-code');
    if (extra && extra.getterCalled && extra.getterCalled.n !== 0) return fail(thrown.code, 'getter-invoked');
    if (instr && instr.noEncodeLen && calls.encodeMax >= instr.noEncodeLen) return fail(thrown.code, 'oversized-text-encoded');
    if (instr && instr.noBigIntLen && calls.bigintMaxLen >= instr.noBigIntLen) return fail(thrown.code, 'overlength-decimal-bigint');
    return { status: 'pass', ...info, observed: thrown.code };
  } catch {
    return { status: 'harness-error', ...info, observed: 'evaluator-error' };
  } finally {
    try { if (snapshot && snapshot.acceptances) for (const a of snapshot.acceptances) { try { a.signature.fill(0); } catch { /* ignore */ } } } catch { /* ignore */ }
  }
}
function checkAccept(snap, input, info, fail) {
  if (!snap || typeof snap !== 'object') return fail('none', 'no-snapshot');
  if (!snap.privateAgreement || typeof snap.privateAgreement !== 'object' ||
      !snap.domain || typeof snap.domain !== 'object' || !snap.terms || typeof snap.terms !== 'object' ||
      !Array.isArray(snap.privateAgreement.capabilities) || !Array.isArray(snap.acceptances)) return fail('accepted', 'snapshot-shape');
  if (!deepFrozen(snap)) return fail('accepted', 'snapshot-not-frozen');
  const pa = input.privateAgreement;
  if (snap.privateAgreement.paymentInstructions !== pa.paymentInstructions) return fail('accepted', 'text-changed');
  for (const k of ['orderId', 'revision', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale', 'agreementSalt']) if (snap.privateAgreement[k] !== pa[k]) return fail('accepted', 'field-changed:' + k);
  if (snap.domain.chainId !== input.domain.chainId || snap.domain.verifyingContract !== input.domain.verifyingContract) return fail('accepted', 'domain-changed');
  for (const k of Object.keys(input.terms)) if (snap.terms[k] !== input.terms[k]) return fail('accepted', 'terms-changed:' + k);
  if (snap.privateAgreement.capabilities.length !== pa.capabilities.length) return fail('accepted', 'caps-count');
  for (let i = 0; i < pa.capabilities.length; i++) for (const k of ['id', 'version', 'policyHash']) if (snap.privateAgreement.capabilities[i][k] !== pa.capabilities[i][k]) return fail('accepted', 'cap-changed');
  if (snap.acceptances.length !== 2) return fail('accepted', 'acceptance-count');
  for (let i = 0; i < 2; i++) {
    const out = snap.acceptances[i], src = input.acceptances[i];
    if (out.termsHash !== src.termsHash || out.role !== src.role || out.walletAccount !== src.walletAccount) return fail('accepted', 'acceptance-fields');
    const sig = out.signature;
    if (!(sig instanceof Uint8Array) || sig.length !== 65 || sig.byteOffset !== 0 || sig.buffer.byteLength !== 65) return fail('accepted', 'signature-not-compact');
    if (sig.buffer === src.signature.buffer) return fail('accepted', 'signature-aliased');
    for (let j = 0; j < 65; j++) if (sig[j] !== src.signature[j]) return fail('accepted', 'signature-bytes');
  }
  // source-mutation isolation: mutate source after parse, snapshot must not change
  const before = Buffer.from(snap.acceptances[0].signature).toString('hex');
  const s0 = input.acceptances[0].signature; const orig = s0[0]; s0[0] = (orig + 1) & 255;
  const after = Buffer.from(snap.acceptances[0].signature).toString('hex'); s0[0] = orig;
  if (before !== after) return fail('accepted', 'signature-not-isolated');
  return { status: 'pass', ...info, observed: 'accept' };
}

// ---------- campaign ----------
export function validateParams({ seed, cases = 256, caseIndex } = {}) {
  assertInt(seed, 0, 4294967295, 'seed'); assertInt(cases, 8, 4096, 'cases');
  if (caseIndex !== undefined) assertInt(caseIndex, 0, cases - 1, 'caseIndex');
}
export function runCampaign(params, parser = realParser) {
  const { seed, cases = 256, caseIndex } = params;
  validateParams({ seed, cases, caseIndex });
  const started = process.hrtime.bigint();
  const indices = caseIndex !== undefined ? [caseIndex] : Array.from({ length: cases }, (_, i) => i);
  const perFamily = Object.fromEntries(FAMILIES.map(f => [f, { executed: 0, accepted: 0, refused: 0, boundaryControls: 0 }]));
  const digest = createHash('sha256').update(MAPPING_VERSION + '|' + seed + '|');
  const metrics = {
    tool: 'fuzz-evm-agreement-input', mappingVersion: MAPPING_VERSION, domainLabel: LABEL, seed, requestedCases: cases,
    replayCaseIndex: caseIndex === undefined ? null : caseIndex, executedCases: 0, generatedCases: 0, generatedValidVariations: 0,
    passedCases: 0, mutatedCases: 0, boundaryControlCases: 0, perFamily, corpusDigest: null, status: 'pass', firstFailure: null,
    coverageGuided: false, shrinking: false, replayNote: caseIndex === undefined ? null : 'single case replayed; not full requested campaign', elapsedMs: 0
  };
  for (const index of indices) {
    let c;
    try { c = generateCase(seed, index); } catch { metrics.status = 'harness-error'; metrics.firstFailure = { index, kind: 'generation-error' }; break; }
    metrics.generatedCases++;
    digest.update(c.descriptor.digest);
    if (c.expected.accepted) metrics.generatedValidVariations++; else metrics.mutatedCases++;
    if (c.descriptor.boundaryControl) metrics.boundaryControlCases++;
    const r = evaluateCase(c, parser);
    const pf = perFamily[c.descriptor.family];
    metrics.executedCases++; pf.executed++;
    if (r.status === 'pass') {
      metrics.passedCases++;
      if (c.expected.accepted) pf.accepted++; else pf.refused++;
      if (c.descriptor.boundaryControl) pf.boundaryControls++;
      continue;
    }
    metrics.status = r.status;
    metrics.firstFailure = bounded({ kind: r.status, seed, index, mappingVersion: MAPPING_VERSION, family: c.descriptor.family, mutation: c.descriptor.mutation, expected: r.expected, observed: r.observed, why: r.why || null, descriptor: c.descriptor, completed: metrics.passedCases, generated: metrics.generatedCases });
    break;
  }
  metrics.corpusDigest = digest.digest('hex');
  metrics.elapsedMs = Number((process.hrtime.bigint() - started) / 1000000n);
  return metrics;
}

// ---------- CLI ----------
function parseArgs(argv) {
  const known = new Set(['--seed', '--cases', '--output', '--case-index']);
  const got = new Map();
  if (!Array.isArray(argv) || argv.length > 8) throw new RangeError('args');
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!known.has(k) || got.has(k) || typeof v !== 'string' || v.startsWith('--') || v.length > 4096) throw new RangeError('args');
    got.set(k, v);
  }
  if (!got.has('--seed') || !got.has('--output')) throw new RangeError('args');
  const dec = (s, name) => { if (!/^(0|[1-9][0-9]{0,9})$/.test(s)) throw new RangeError(name); return Number(s); };
  const seed = dec(got.get('--seed'), 'seed');
  const cases = got.has('--cases') ? dec(got.get('--cases'), 'cases') : 256;
  const caseIndex = got.has('--case-index') ? dec(got.get('--case-index'), 'case-index') : undefined;
  validateParams({ seed, cases, caseIndex });
  const out = got.get('--output');
  if (!path.isAbsolute(out) || out.includes('\0')) throw new RangeError('output');
  const resolved = path.resolve(out);
  if (existsSync(resolved)) throw new RangeError('output-exists');
  const parent = path.dirname(resolved);
  let st, realParent, realRoot;
  try { st = statSync(parent); realParent = realpathSync(parent); realRoot = realpathSync(ROOT); } catch { throw new RangeError('output-parent'); }
  if (!st.isDirectory()) throw new RangeError('output-parent');
  const rel = path.relative(realRoot, path.join(realParent, path.basename(resolved)));
  const outside = rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
  if (!outside) throw new RangeError('output-in-source');
  return { seed, cases, caseIndex, output: path.join(realParent, path.basename(resolved)) };
}
export function main(argv) {
  let p;
  try { p = parseArgs(argv); } catch (e) { process.stderr.write('fuzz-evm-agreement-input: invalid arguments (' + (e && e.message ? String(e.message).slice(0, 32) : 'error') + ')\n'); return 2; }
  let metrics;
  try { metrics = runCampaign({ seed: p.seed, cases: p.cases, caseIndex: p.caseIndex }); }
  catch { process.stderr.write('fuzz-evm-agreement-input: harness error\n'); return 3; }
  let text = JSON.stringify(metrics, null, 1);
  if (Buffer.byteLength(text) > MAX_METRICS_BYTES) { metrics.firstFailure = metrics.firstFailure && { kind: metrics.firstFailure.kind, truncated: true }; metrics.perFamily = undefined; text = JSON.stringify(metrics); }
  try { writeFileSync(p.output, text + '\n', { flag: 'wx', mode: 0o600 }); }
  catch { process.stderr.write('fuzz-evm-agreement-input: cannot write output\n'); return 3; }
  if (metrics.status === 'pass') return 0;
  return metrics.status === 'counterexample' ? 1 : 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
