// Differential tests: this repo's NIP-01 implementation vs nostr-tools 2.25.2 (exact devDependency).
// Subpaths verified against node_modules/nostr-tools/package.json "exports" and lib/types/{pure,core,filter}.d.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventHash, finalizeEvent, getPublicKey, verifyEvent as ntVerify, validateEvent as ntValidate } from 'nostr-tools/pure';
import { matchFilter } from 'nostr-tools/filter';
import { sha256 } from '@noble/hashes/sha2.js';
import { parseEvent, matchesFilters } from '../src/nip01.ts';
import { createRelayPool } from '../src/pool.ts';
import { FAST, makeBroker, memoryNetwork, until } from './support/harness.mjs';
import { computeEventId, signEvent, verifyEventSync } from '../../nostr-crypto/src/event.ts';
import { createLocalNobleNostrProvider } from '../../nostr-crypto/src/provider.ts';

const provider = createLocalNobleNostrProvider();
const sk = sha256(new TextEncoder().encode('differential-key-1'));
const sk2 = sha256(new TextEncoder().encode('differential-key-2'));
const pub = getPublicKey(sk), pub2 = getPublicKey(sk2);
const T = 1_700_000_000;
const tpl = (o = {}) => ({ created_at: T, kind: 1, tags: [], content: 'hi', ...o });
const repoVerifies = ev => { try { verifyEventSync(ev); return true; } catch { return false; } };
// nostr-tools caches verification on the object. Keep its cache away from the independent repo verifier.
const ntVerifies = event => {
  try {
    const candidate = structuredClone(event);
    return ntValidate(candidate) && ntVerify(candidate);
  } catch {
    return false;
  }
};

const longTags = Array.from({ length: 64 }, (_, i) => ['t', `tag${i}`, '', 'x'.repeat(100)]);
const corpus = {
  empty: tpl({ content: '' }),
  unicode: tpl({ content: 'héllo \u{1F600}\u{1F468}‍\u{1F469}‍\u{1F467} שלום مرحبا é ‮‬' }),
  escapes: tpl({ content: 'a\nb\tc"d\\e f g\r\b\f/' }),
  controlChars: tpl({ content: Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('') }),
  del7f: tpl({ content: '\u007f\u0080\u009f￾￿' }),
  manyTags: tpl({ tags: longTags }),
  emptyStringTags: tpl({ tags: [[''], ['', ''], ['e', '', 'x'], ['p']] }),
  large: tpl({ content: 'xé\u{1F600}'.repeat(5000) }),
  kindEdges: tpl({ kind: 65535, created_at: 0 }),
  maxTime: tpl({ kind: 0, created_at: 0xffffffff }),
};
const idOf = (pubkey, t) => computeEventId(pubkey, t);

test('event id equals nostr-tools getEventHash for the whole corpus (incl. chars the repo refuses to sign)', () => {
  for (const [name, t] of Object.entries(corpus)) {
    assert.equal(idOf(pub, t), getEventHash({ ...t, pubkey: pub }), name);
  }
});

test('nostr-tools finalizeEvent output verifies in the repo; repo signEvent output verifies in nostr-tools', async () => {
  for (const [name, t] of Object.entries(corpus)) {
    const nt = finalizeEvent({ ...t }, sk); // finalizeEvent mutates its template, so pass a copy
    const plain = JSON.parse(JSON.stringify(nt)); // wire form: strips nostr-tools verifiedSymbol, which verifyEventSync rejects as an extra own key
    const repoSigned = await signEvent(t, sk, provider).then(e => e, () => null);
    // Repo rejects control chars (U+0000-0007, 000B, 000E-001F) at signing: intentional stricter canonical-form rule.
    const forbidden = /[\u0000-\u0007\u000b\u000e-\u001f]/.test(t.content);
    if (forbidden) {
      assert.equal(repoSigned, null, `${name}: repo must refuse to sign non-NIP-01-escapable control chars`);
      assert.equal(repoVerifies(plain), false, `${name}: repo verifier refuses (stricter) what nostr-tools signed`);
      continue;
    }
    assert.ok(repoSigned, name);
    assert.equal(repoSigned.id, nt.id, name);
    assert.ok(repoVerifies(plain), `repo verifies nt-signed ${name}`);
    assert.ok(ntVerifies({ ...repoSigned }), `nt verifies repo-signed ${name}`);
    // BIP-340 default signing is randomized in nostr-tools (aux rand) and in noble; only validity is compared.
  }
});

test('tampering with any field is rejected by BOTH implementations', async () => {
  const base = await signEvent(tpl({ tags: [['t', 'a']] }), sk, provider);
  const other = finalizeEvent(tpl({ content: 'other' }), sk2);
  const flip = h => (h[0] === '0' ? '1' : '0') + h.slice(1);
  const variants = {
    id: { ...base, id: flip(base.id) }, sig: { ...base, sig: flip(base.sig) }, content: { ...base, content: 'hi!' },
    pubkey: { ...base, pubkey: pub2 }, tags: { ...base, tags: [['t', 'b']] }, created_at: { ...base, created_at: T + 1 },
    kind: { ...base, kind: 2 }, foreignSig: { ...base, sig: other.sig },
  };
  assert.ok(repoVerifies({ ...base }) && ntVerifies({ ...base }));
  for (const [name, ev] of Object.entries(variants)) {
    assert.equal(repoVerifies(ev), false, `repo rejects tampered ${name}`);
    assert.equal(ntVerifies(ev), false, `nostr-tools rejects tampered ${name}`);
  }
});

// Malformed-input table. `stricter` documents each intentional case where the repo rejects but nostr-tools accepts.
// Relay parsers receive JSON. nostr-tools also puts a private verification symbol on its in-memory result.
const G = JSON.parse(JSON.stringify(finalizeEvent(tpl({ tags: [['e', 'x']] }), sk)));
const up = s => s.toUpperCase();
const malformed = [
  ['uppercase id', { ...G, id: up(G.id) }], ['uppercase pubkey', { ...G, pubkey: up(G.pubkey) }], ['uppercase sig', { ...G, sig: up(G.sig) }],
  ['short id', { ...G, id: G.id.slice(1) }], ['long pubkey', { ...G, pubkey: G.pubkey + '0' }], ['short sig', { ...G, sig: G.sig.slice(2) }],
  ['non-hex pubkey', { ...G, pubkey: 'z'.repeat(64) }], ['id number', { ...G, id: 5 }],
  ['extra key', { ...G, extra: 1 }], ['missing id', (({ id, ...r }) => r)(G)], ['missing sig', (({ sig, ...r }) => r)(G)],
  ['missing content', (({ content, ...r }) => r)(G)], ['missing tags', (({ tags, ...r }) => r)(G)], ['missing kind', (({ kind, ...r }) => r)(G)],
  ['created_at float', { ...G, created_at: 1.5 }], ['created_at negative', { ...G, created_at: -1 }], ['created_at string', { ...G, created_at: '1' }],
  ['created_at huge', { ...G, created_at: 2 ** 53 }], ['created_at > u32', { ...G, created_at: 0x1_0000_0000 }], ['created_at NaN', { ...G, created_at: NaN }],
  ['created_at Infinity', { ...G, created_at: Infinity }],
  ['kind negative', { ...G, kind: -1 }], ['kind > 65535', { ...G, kind: 65536 }], ['kind float', { ...G, kind: 1.5 }], ['kind string', { ...G, kind: '1' }],
  ['tags object', { ...G, tags: {} }], ['tags null', { ...G, tags: null }], ['tag not array', { ...G, tags: ['e'] }], ['tag number item', { ...G, tags: [['e', 1]] }],
  ['tag null item', { ...G, tags: [['e', null]] }], ['tag empty array', { ...G, tags: [[]] }],
  ['content number', { ...G, content: 1 }], ['content null', { ...G, content: null }],
  ['65 tags', { ...G, tags: Array.from({ length: 65 }, () => ['t', 'a']) }], ['9 tag items', { ...G, tags: [Array(9).fill('a')] }],
  ['257-byte tag item', { ...G, tags: [['t', 'a'.repeat(257)]] }], ['66KiB content', { ...G, content: 'a'.repeat(65_537) }],
  ['array instead of object', [G.id]], ['null', null], ['string', 'x'],
];
// Cases the repo rejects but nostr-tools validateEvent accepts (structure only): allowed to differ, each is a deliberate hardening.
const intentionallyStricter = new Set([
  'uppercase id', 'short id', 'id number', 'uppercase sig', 'short sig', // nt validateEvent never inspects id/sig shape
  'extra key', 'missing id', 'missing sig', // exact 7-key shape required
  'created_at negative', 'created_at huge', 'created_at > u32', 'created_at NaN', 'created_at Infinity', 'created_at float', // nt only checks typeof number
  'kind negative', 'kind > 65535', 'kind float', // nt only checks typeof number
  'tag empty array', // nt accepts [] as a tag; repo requires a tag name
  '65 tags', '9 tag items', '257-byte tag item', '66KiB content', // relay resource caps (FRAME_LIMITS)
]);
test('parsing strictness: repo rejects everything nostr-tools rejects; extra rejections are enumerated', () => {
  const findings = [], undocumented = [];
  for (const [name, input] of malformed) {
    const repoRejects = parseEvent(input) === null;
    const ntRejects = !ntValidate(input);
    if (ntRejects && !repoRejects) findings.push(name);
    if (repoRejects && !ntRejects && !intentionallyStricter.has(name)) undocumented.push(name);
    if (!repoRejects) assert.ok(repoVerifies(input) === false || name === 'none', `${name}: accepted by parseEvent so must be rejected by verify`);
  }
  assert.deepEqual(findings, [], `FINDING: repo ACCEPTS inputs nostr-tools rejects: ${findings.join(', ')}`);
  assert.deepEqual(undocumented, [], `repo is stricter than nostr-tools in undocumented cases: ${undocumented.join(', ')}`);
  // Sanity: the well-formed baseline is accepted by both.
  assert.ok(parseEvent(G) !== null && ntValidate(G));
});

test('full pipeline: anything nostr-tools fully rejects (validate + id + sig), the repo verifier rejects too', () => {
  for (const [name, input] of malformed) {
    if (!ntVerifies(input)) assert.equal(repoVerifies(input), false, `FINDING: repo verifies ${name}`);
  }
});

// Filter matching. The repo's matchesFilters takes RelayFilter (kinds+since mandatory; no ids/until/#e support), so only the
// shared subset is compared; ids/until/#e are nostr-tools-only and intentionally absent from the repo filter type.
test('filter matching agrees with nostr-tools matchFilter on the shared subset (inclusive since edge, tags, authors)', () => {
  const evs = [
    { ...finalizeEvent(tpl({ kind: 30000, created_at: T, tags: [['d', 'x'], ['t', 'a']] }), sk) },
    { ...finalizeEvent(tpl({ kind: 30000, created_at: T + 10, tags: [['d', 'y']] }), sk2) },
    { ...finalizeEvent(tpl({ kind: 1, created_at: T - 1, tags: [['t', 'b'], ['p', pub]] }), sk) },
    { ...finalizeEvent(tpl({ kind: 1, created_at: T, tags: [['d'], ['t']] }), sk2) },
    { ...finalizeEvent(tpl({ kind: 7, created_at: T + 5, tags: [] }), sk) },
  ];
  const filters = [
    { kinds: [30000], since: 0, limit: 10 }, { kinds: [30000, 1], since: T, limit: 10 }, { kinds: [30000], since: T + 1, limit: 1 },
    { kinds: [1, 7, 30000], since: T - 1, limit: 5, authors: [pub] }, { kinds: [1, 30000], since: 0, limit: 5, authors: [pub, pub2] },
    { kinds: [30000], since: 0, limit: 5, '#d': ['x'] }, { kinds: [30000], since: 0, limit: 5, '#d': ['x', 'y'] },
    { kinds: [1, 30000], since: 0, limit: 5, '#t': ['a', 'b'] }, { kinds: [1], since: 0, limit: 5, '#p': [pub] },
    { kinds: [1], since: 0, limit: 5, '#t': ['nope'] }, { kinds: [], since: 0, limit: 5 }, { kinds: [1], since: 0, limit: 5, authors: [] },
  ];
  for (const f of filters) for (const e of evs) {
    assert.equal(matchesFilters(e, [f]), matchFilter(f, e), `filter ${JSON.stringify(f)} event kind=${e.kind} t=${e.created_at}`);
  }
  // Multi-filter OR semantics.
  for (const e of evs) assert.equal(matchesFilters(e, filters.slice(0, 3)), filters.slice(0, 3).some(f => matchFilter(f, e)));
});

test('a nostr-tools signed event received twice is delivered once to the subscription', async () => {
  const network = memoryNetwork();
  const { broker } = makeBroker({ endpoints: ['relay-a'] });
  const pool = createRelayPool({
    broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }],
    connect: network.connector, verifier: { verifyEvent: repoVerifies }, nowSeconds: () => T, timing: FAST,
  });
  try {
    const received = [];
    const subscription = pool.subscribe([{ kinds: [1], since: T, limit: 10 }], {
      onEvent: event => received.push(event.id),
    });
    assert.ok(subscription.ok);
    await until(() => pool.status().some(relay => relay.state === 'open'));
    const frame = JSON.stringify(['EVENT', subscription.value.id, G]);
    network.sockets[0].deliver(frame);
    network.sockets[0].deliver(frame);
    assert.deepEqual(received, [G.id]);
  } finally {
    pool.close();
  }
});
