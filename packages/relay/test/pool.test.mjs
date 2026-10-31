import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRelayPool, POOL_LIMITS, webSocketConnector } from '../src/pool.ts';
import { createOrderBook, adKey } from '../src/ad.ts';
import { startFakeRelay } from './support/fake-relay.mjs';
import { adFor, AD_KIND, FAST, makeBroker, makeCrypto, makeKey, memoryNetwork, NOW, ORDER, seller, sellerCrypto, signedAd, signWith, until, wait, loopbackRelayFixture } from './support/harness.mjs';

const filter = (extra = {}) => ({ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: NOW - 3600, limit: 50, ...extra });
const relays = (...fakes) => loopbackRelayFixture(fakes).relays;
const stateOf = (pool, id) => pool.status().find(s => s.endpointId === id);
const opts = (fakes, extra = {}) => { const fixture = loopbackRelayFixture(fakes); return { broker: makeBroker({ endpointURLs: fixture.endpointURLs }).broker,
  relays: fixture.relays, connect: fixture.connect, verifier: sellerCrypto, timing: FAST, nowSeconds: () => NOW, ...extra }; };
async function withRelays(count, behaviors, body) {
  const fakes = []; for (let i = 0; i < count; i++) fakes.push(await startFakeRelay(behaviors?.[i]));
  let pool;
  try { await body(fakes, p => (pool = p)); } finally { pool?.close(); await Promise.all(fakes.map(f => f.stop())); }
}
const collect = () => { const got = []; return { got, handlers: { onEvent: (e, id) => got.push([e.id, id]), onEose: id => got.push(['eose', id]) } }; };

test('connects through an explicit loopback WebSocket fixture with G05-bound logical URLs, receives a verified ad and dedupes', async () => {
  await withRelays(2, [], async (fakes, keep) => {
    const ad = await signedAd(); fakes.forEach(f => f.events.push(ad));
    const pool = keep(createRelayPool(opts(fakes))); const { got, handlers } = collect();
    assert.equal(pool.subscribe([filter()], handlers).ok, true);
    await until(() => got.filter(g => g[0] === 'eose').length === 2);
    assert.equal(got.filter(g => g[0] === ad.id).length, 1, 'same event id from two relays is delivered once');
    assert.deepEqual(pool.status().map(s => s.state), ['open', 'open']);
    const book = createOrderBook({ nowSeconds: () => NOW }); assert.equal(book.ingest(ad), 'accepted');
  });
});

test('strict mode without verified-private coverage: no relay is contacted, nothing falls back to direct', async () => {
  await withRelays(2, [], async (fakes, keep) => {
    for (const setup of [{ coverage: 'direct', mode: 'strict' }, { coverage: 'unknown', mode: 'ordinary' }, { empty: true, mode: 'strict' }, { empty: true, mode: 'ordinary' }]) {
      const pool = createRelayPool(opts(fakes, { broker: makeBroker({ ...setup, endpointURLs: loopbackRelayFixture(fakes).endpointURLs }).broker }));
      assert.equal(pool.subscribe([filter()], collect().handlers).ok, true);
      await until(() => pool.status().every(s => s.state === 'blocked'));
      await wait(30);
      pool.close();
    }
    assert.equal(fakes[0].connectCount + fakes[1].connectCount, 0);
  });
});

test('ordinary mode with direct coverage and consent is the only direct path; unlisted endpoints stay blocked', async () => {
  await withRelays(1, [], async (fakes, keep) => {
    const { broker } = makeBroker({ coverage: 'direct', mode: 'ordinary', endpoints: ['relay-a'], endpointURLs: loopbackRelayFixture(fakes).endpointURLs });
    const pool = keep(createRelayPool(opts(fakes, { broker, relays: [...relays(...fakes), { endpointId: 'relay-zzz', url: relays(...fakes)[0].url }] })));
    pool.subscribe([filter()], collect().handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    assert.equal(stateOf(pool, 'relay-zzz').state, 'blocked');
  });
});

test('switching to strict mid-session revokes sockets and the pool does not reconnect', async () => {
  await withRelays(1, [], async (fakes, keep) => {
    const { broker } = makeBroker({ coverage: 'direct', mode: 'ordinary', endpointURLs: loopbackRelayFixture(fakes).endpointURLs });
    const pool = keep(createRelayPool(opts(fakes, { broker })));
    pool.subscribe([filter()], collect().handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    broker.setMode('strict');
    await until(() => stateOf(pool, 'relay-a').state === 'blocked');
    await until(() => fakes[0].conns.size === 0);
    assert.equal(fakes[0].connectCount, 1);
  });
});

test('bounds: relay candidates, active connections, subscriptions and filter shape', async () => {
  const net = memoryNetwork();
  const many = Array.from({ length: 6 }, (_, i) => ({ endpointId: `relay-${i}`, url: 'wss://fixture.example/' }));
  assert.throws(() => createRelayPool({ broker: makeBroker().broker, relays: Array.from({ length: 17 }, (_, i) => ({ endpointId: `r${i}`, url: 'wss://x' })), verifier: sellerCrypto, connect: net.connector }), RangeError);
  const { broker } = makeBroker({ endpoints: many.map(r => r.endpointId) });
  const pool = createRelayPool({ broker, relays: many, verifier: sellerCrypto, connect: net.connector, timing: FAST, nowSeconds: () => NOW, maxRelays: 99 });
  try {
    for (let i = 0; i < POOL_LIMITS.maxSubscriptionsPerRelay; i++) assert.equal(pool.subscribe([filter()], collect().handlers).ok, true);
    assert.deepEqual(pool.subscribe([filter()], collect().handlers), { ok: false, error: 'LIMIT_EXCEEDED' });
    await until(() => pool.status().filter(s => s.state === 'open').length === 4);
    await wait(20);
    assert.equal(net.attempts, 4, 'at most four connections');
    assert.equal(net.sockets[0].sent.filter(m => m[0] === 'REQ').length, 4);
  } finally { pool.close(); }
  const p2 = createRelayPool({ broker, relays: many, verifier: sellerCrypto, connect: net.connector, timing: FAST, nowSeconds: () => NOW });
  try {
    for (const bad of [filter({ limit: 101 }), filter({ limit: 0 }), filter({ since: NOW - 86_401 }), filter({ kinds: [] }), filter({ authors: ['nothex'] }), { ...filter(), kinds: [1.5] }, filter({ '#t': Array(17).fill('a') })]) {
      assert.deepEqual(p2.subscribe([bad], collect().handlers), { ok: false, error: 'INVALID_FILTER' }, JSON.stringify(bad).slice(0, 80));
    }
    assert.deepEqual(p2.subscribe([], collect().handlers), { ok: false, error: 'INVALID_FILTER' });
    assert.deepEqual(p2.subscribe([filter(), filter(), filter()], collect().handlers), { ok: false, error: 'INVALID_FILTER' });
    assert.equal(p2.subscribe([filter({ since: NOW - 86_400 })], collect().handlers).ok, true);
  } finally { p2.close(); }
});

test('failover: a relay that never connects exhausts six reconnects, then the next approved relay is used', async () => {
  await withRelays(2, [], async (fakes, keep) => {
    fakes[0].refuse = true; const ad = await signedAd(); fakes[1].events.push(ad);
    const pool = keep(createRelayPool(opts(fakes, { maxRelays: 1 }))); const { got, handlers } = collect();
    pool.subscribe([filter()], handlers);
    await until(() => got.some(g => g[0] === ad.id));
    assert.equal(stateOf(pool, 'relay-a').state, 'failed');
    assert.equal(fakes[0].connectCount, 1 + POOL_LIMITS.maxReconnects, 'initial attempt plus six reconnects, then explicit retry required');
    assert.equal(stateOf(pool, 'relay-b').state, 'open');
    const before = fakes[0].connectCount; await wait(60);
    assert.equal(fakes[0].connectCount, before, 'no background retry after exhaustion');
    fakes[0].refuse = false; pool.retry('relay-a');
    await until(() => stateOf(pool, 'relay-a').state === 'idle' || stateOf(pool, 'relay-a').state === 'open' || fakes[0].connectCount > before);
  });
});

test('reconnect: a dropped socket reconnects with backoff, replays the REQ and keeps receiving; no duplicate delivery', async () => {
  await withRelays(1, [], async (fakes, keep) => {
    const first = await signedAd({ orderId: '1'.repeat(64) }); fakes[0].events.push(first);
    const pool = keep(createRelayPool(opts(fakes))); const { got, handlers } = collect();
    pool.subscribe([filter()], handlers);
    await until(() => got.some(g => g[0] === first.id));
    fakes[0].dropAll();
    await until(() => fakes[0].connectCount === 2 && stateOf(pool, 'relay-a').state === 'open');
    const second = await signedAd({ orderId: '2'.repeat(64) }); fakes[0].conns.values().next().value.send(JSON.stringify(['EVENT', 's1', second]));
    await until(() => got.some(g => g[0] === second.id));
    assert.equal(got.filter(g => g[0] === first.id).length, 1, 'replayed history is deduped');
    assert.equal(fakes[0].received.filter(m => m[0] === 'REQ').length, 2);
  });
});

test('backoff is full-jitter within the 1/2/4/8/16/30 s ceilings and resets only after stable uptime', async () => {
  const net = memoryNetwork(); const delays = []; const realSetTimeout = globalThis.setTimeout;
  let clock = 0;
  const { broker } = makeBroker();
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: sellerCrypto, connect: net.connector, nowSeconds: () => NOW,
    clock: () => clock, random: () => 0.999, timing: { stableMs: 60_000, connectTimeoutMs: 800 } });
  globalThis.setTimeout = (fn, ms, ...rest) => { if (ms >= 100 && ms < 30_000 && ms !== 800) { delays.push(ms); return realSetTimeout(fn, 1); } return realSetTimeout(fn, ms, ...rest); };
  try {
    pool.subscribe([filter()], collect().handlers);
    for (let i = 0; i < 4; i++) { await until(() => net.sockets.length === i + 1 && stateOf(pool, 'relay-a').state === 'open'); net.sockets[i].onclose({}); }
    await until(() => net.sockets.length === 5 && stateOf(pool, 'relay-a').state === 'open');
    assert.deepEqual(delays, [999, 1998, 3996, 7992].map(v => v), 'ceil(1000,2000,4000,8000) * 0.999');
    clock = 61_000; net.sockets[4].onclose({});
    await until(() => net.sockets.length === 6 && stateOf(pool, 'relay-a').state === 'open');
    assert.equal(delays.at(-1), 999, 'stable for 60 s resets to the first ceiling');
  } finally { globalThis.setTimeout = realSetTimeout; pool.close(); }
});

test('malicious relay: flood is rate limited, valid events pass, memory use stays bounded', async () => {
  const flood = [];
  for (let i = 0; i < 200; i++) flood.push(await signedAd({ orderId: i.toString(16).padStart(64, '0') }));
  await withRelays(1, [{ onMessage(conn, m) { if (m[0] === 'REQ') { conn.subs.set(m[1], []); for (const e of flood) conn.send(JSON.stringify(['EVENT', m[1], e])); return true; } return false; } }], async (fakes, keep) => {
    const pool = keep(createRelayPool(opts(fakes))); const { got, handlers } = collect();
    pool.subscribe([filter()], handlers);
    await until(() => fakes[0].received.length > 0); await wait(300);
    const delivered = got.filter(g => g[0] !== 'eose').length;
    assert.ok(delivered >= 1 && delivered <= POOL_LIMITS.burst + 5, `delivered ${delivered}`);
  });
});

test('malicious relay: three consecutive overloaded 10 s windows disconnect the relay (deterministic clock)', async () => {
  const net = memoryNetwork(); let clock = 1_000_000;
  const { broker } = makeBroker(); const events = [];
  for (let i = 0; i < 400; i++) events.push(signWith(seller, { kind: AD_KIND, created_at: NOW, tags: [['t', 'p2p-offramp-ad-v1']], content: String(i) }));
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: sellerCrypto, connect: net.connector, nowSeconds: () => NOW, clock: () => clock, timing: { ...FAST, backoffCeilingsMs: [60_000] }, random: () => 0.5 });
  try {
    pool.subscribe([filter()], collect().handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    const socket = net.sockets[0]; let i = 0;
    const burst = n => { for (let k = 0; k < n; k++) socket.deliver(JSON.stringify(['EVENT', 's1', events[i++]])); };
    for (let window = 0; window < 4; window++) { burst(40); clock += 10_000; if (stateOf(pool, 'relay-a').state !== 'open') break; }
    burst(1);
    assert.equal(stateOf(pool, 'relay-a').state, 'backoff');
    assert.equal(stateOf(pool, 'relay-a').reason, 'overload');
    assert.equal(socket.closed, true);
  } finally { pool.close(); }
});

test('malicious relay: an oversized frame bans the relay immediately and it is never reconnected', async () => {
  const huge = JSON.stringify(['NOTICE', 'x'.repeat(70_000)]);
  await withRelays(2, [{ onMessage(conn, m) { if (m[0] === 'REQ') { conn.send(huge); return true; } return false; } }, {}], async (fakes, keep) => {
    const ad = await signedAd(); fakes[1].events.push(ad);
    const pool = keep(createRelayPool(opts(fakes, { maxRelays: 2 }))); const { got, handlers } = collect();
    pool.subscribe([filter()], handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'banned');
    assert.equal(stateOf(pool, 'relay-a').reason, 'oversized-frame');
    await until(() => got.some(g => g[0] === ad.id));
    await wait(40); assert.equal(fakes[0].connectCount, 1);
  });
});

test('malicious relay: invalid signatures are never delivered, never poison dedupe, and ban the relay', async () => {
  const good = await signedAd();
  const forged = { ...good, sig: '1'.repeat(128) };
  const tampered = { ...good, content: good.content.replace('EUR', 'USD') };
  await withRelays(2, [{ onMessage(conn, m) { if (m[0] === 'REQ') { conn.send(JSON.stringify(['EVENT', m[1], forged])); conn.send(JSON.stringify(['EVENT', m[1], tampered])); conn.send(JSON.stringify(['EVENT', m[1], forged])); return true; } return false; } }, {}], async (fakes, keep) => {
    const pool = keep(createRelayPool(opts(fakes, { maxRelays: 2 }))); const { got, handlers } = collect();
    pool.subscribe([filter()], handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'banned');
    assert.equal(got.filter(g => g[0] !== 'eose').length, 0);
    fakes[1].conns.values().next().value.send(JSON.stringify(['EVENT', 's1', good]));
    await until(() => got.some(g => g[0] === good.id));
    assert.equal(stateOf(pool, 'relay-a').reason, 'invalid-signature');
  });
});

test('malicious relay: wrong-subscription events, events outside the filter and binary frames are dropped and penalized', async () => {
  const net = memoryNetwork(); const { broker } = makeBroker();
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: sellerCrypto, connect: net.connector, nowSeconds: () => NOW, timing: FAST });
  try {
    const { got, handlers } = collect(); pool.subscribe([filter()], handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    const s = net.sockets[0], ad = await signedAd();
    s.deliver(JSON.stringify(['EVENT', 'nope', ad]));
    assert.equal(stateOf(pool, 'relay-a').penalty, 3);
    const wrongKind = signWith(seller, { kind: 1, created_at: NOW, tags: [['t', 'p2p-offramp-ad-v1']], content: 'hi' });
    s.deliver(JSON.stringify(['EVENT', 's1', wrongKind]));
    assert.equal(stateOf(pool, 'relay-a').penalty, 6);
    s.deliver(JSON.stringify(['EVENT', 's1', { ...ad, extra: true }]));
    assert.equal(stateOf(pool, 'relay-a').penalty, 9);
    s.onmessage({ data: new Uint8Array([1, 2, 3]) });
    assert.equal(stateOf(pool, 'relay-a').state, 'banned');
    assert.equal(got.length, 0);
  } finally { pool.close(); }
});

test('malformed and unknown frames are ignored safely; NOTICE and CLOSED never create events; AUTH is never answered', async () => {
  const net = memoryNetwork(); const { broker } = makeBroker();
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: sellerCrypto, connect: net.connector, nowSeconds: () => NOW, timing: FAST });
  try {
    const { got, handlers } = collect(); pool.subscribe([filter()], handlers);
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    const s = net.sockets[0], sentBefore = s.sent.length;
    for (const frame of ['["AUTH","challenge"]', '["NOTICE","hello"]', '["CLOSED","s1","auth-required"]']) s.deliver(frame);
    assert.equal(stateOf(pool, 'relay-a').penalty, 0);
    s.deliver('{not json'); assert.equal(stateOf(pool, 'relay-a').penalty, 3);
    s.deliver('["EVENT","s1"]'); assert.equal(stateOf(pool, 'relay-a').penalty, 6);
    assert.equal(s.sent.length, sentBefore, 'nothing is sent in response to relay frames');
    assert.equal(got.length, 0);
    s.deliver(JSON.stringify(['EVENT', 's1', await signedAd()]));
    assert.equal(got.length, 0, 'a subscription the relay CLOSED stays closed');
  } finally { pool.close(); }
});

test('per-subscription event cap closes the subscription on that relay and dedupe memory is bounded', async () => {
  const net = memoryNetwork(); const { broker } = makeBroker(); let clock = 0;
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: { verifyEvent: () => true }, connect: net.connector, nowSeconds: () => NOW, clock: () => clock, timing: FAST });
  try {
    let delivered = 0; pool.subscribe([filter()], { onEvent: () => { delivered++; } });
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    const s = net.sockets[0];
    const fake = i => ({ id: i.toString(16).padStart(64, '0'), pubkey: 'b'.repeat(64), created_at: NOW, kind: AD_KIND, tags: [['t', 'p2p-offramp-ad-v1']], content: '', sig: 'c'.repeat(128) });
    for (let i = 0; i < POOL_LIMITS.maxEventsPerSubscription + 20; i++) { clock += 600; s.deliver(JSON.stringify(['EVENT', 's1', fake(i)])); }
    assert.equal(delivered, POOL_LIMITS.maxEventsPerSubscription);
    assert.ok(s.sent.some(m => m[0] === 'CLOSE' && m[1] === 's1'));
    assert.equal(stateOf(pool, 'relay-a').state, 'open', 'a capped subscription is not a ban');
  } finally { pool.close(); }
});

test('dedupe memory evicts the oldest ids beyond 4096', async () => {
  const net = memoryNetwork(); const { broker } = makeBroker(); let clock = 0;
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: { verifyEvent: () => true }, connect: net.connector, nowSeconds: () => NOW, clock: () => clock, timing: FAST });
  try {
    let delivered = 0;
    const subs = []; for (let i = 0; i < 4; i++) subs.push(pool.subscribe([filter()], { onEvent: () => { delivered++; } }));
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    let s = net.sockets[0];
    const fake = i => ({ id: i.toString(16).padStart(64, '0'), pubkey: 'b'.repeat(64), created_at: NOW, kind: AD_KIND, tags: [['t', 'p2p-offramp-ad-v1']], content: '', sig: 'c'.repeat(128) });
    const total = POOL_LIMITS.maxDedupIds + 10;
    const send = i => { clock += 600; s.deliver(JSON.stringify(['EVENT', `s${1 + (i % 4)}`, fake(i)])); };
    for (let i = 0; i < 4000; i++) send(i); // 4 subscriptions x per-subscription cap
    s.onclose({}); await until(() => net.sockets.length === 2 && stateOf(pool, 'relay-a').state === 'open'); s = net.sockets[1];
    for (let i = 4000; i < total; i++) send(i);
    assert.equal(delivered, total);
    send(total - 1); assert.equal(delivered, total, 'recent id still deduped');
    send(0); assert.equal(delivered, total + 1, 'oldest id was evicted');
  } finally { pool.close(); }
});

test('hanging socket: connect timeout fails the attempt without blocking other relays', async () => {
  const net = { n: 0, connector() { this.n++; return { onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} }; } };
  const { broker } = makeBroker(); const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: sellerCrypto, connect: () => net.connector(), nowSeconds: () => NOW, timing: { ...FAST, connectTimeoutMs: 20 } });
  try {
    pool.subscribe([filter()], collect().handlers);
    await until(() => net.n >= 3);
    assert.notEqual(stateOf(pool, 'relay-a').state, 'open');
  } finally { pool.close(); }
});

test('closing the last subscription closes sockets and stops reconnecting', async () => {
  await withRelays(1, [], async (fakes, keep) => {
    const pool = keep(createRelayPool(opts(fakes))); const sub = pool.subscribe([filter()], collect().handlers).value;
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    sub.close();
    await until(() => fakes[0].conns.size === 0);
    assert.equal(stateOf(pool, 'relay-a').state, 'idle');
    await wait(40); assert.equal(fakes[0].connectCount, 1);
  });
});

test('end to end: sign, publish through the broker, discover, supersede with a revision, then request deletion', async () => {
  await withRelays(1, [], async (fakes, keep) => {
    const { createAdEvent, createDeletionEvent } = await import('../src/ad.ts');
    const book = createOrderBook({ nowSeconds: () => NOW + 1 });
    const pool = keep(createRelayPool(opts(fakes)));
    const r1 = await createAdEvent(sellerCrypto, adFor({ revision: 1 }), NOW);
    const out = await pool.publish(r1);
    assert.deepEqual(out, { ok: true, value: [{ eventId: r1.id, relayId: 'relay-a', status: 'accepted' }] });
    const r2 = await createAdEvent(sellerCrypto, adFor({ revision: 2, amountMax: '700000000' }), NOW + 1);
    await pool.publish(r2);
    pool.subscribe([filter()], { onEvent: e => book.ingest(e) });
    await until(() => book.size === 1 && book.list()[0]?.ad.revision === 2);
    // Relay replays the stale revision after the new one: the book keeps revision 2.
    assert.equal(book.ingest(r1), 'stale-revision');
    const del = await createDeletionEvent(sellerCrypto, seller.pubkey, ORDER, NOW + 2);
    assert.equal((await pool.publish(del)).value[0].status, 'accepted');
    assert.equal(book.ingest(del), 'accepted');
    assert.equal(book.revalidate(adKey(seller.pubkey, ORDER)).ok, false);
    assert.ok(fakes[0].events.some(e => e.id === r1.id), 'relay still holds the old ad: deletion is a request, not removal');
  });
});

test('publish: strict refusal sends nothing; forged events are rejected locally; relay rejection is reported', async () => {
  await withRelays(1, [{ onMessage(conn, m) { if (m[0] === 'EVENT') { conn.send(JSON.stringify(['OK', m[1].id, false, 'blocked: spam'])); return true; } return false; } }], async (fakes, keep) => {
    const ad = await signedAd();
    const refused = createRelayPool(opts(fakes, { broker: makeBroker({ coverage: 'direct', mode: 'strict', endpointURLs: loopbackRelayFixture(fakes).endpointURLs }).broker }));
    assert.deepEqual(await refused.publish(ad), { ok: true, value: [{ eventId: ad.id, relayId: 'relay-a', status: 'unknown' }] });
    refused.close(); assert.equal(fakes[0].connectCount, 0);
    const pool = keep(createRelayPool(opts(fakes)));
    assert.deepEqual(await pool.publish({ ...ad, sig: '2'.repeat(128) }), { ok: false, error: 'INVALID_FILTER' });
    assert.equal(fakes[0].connectCount, 0);
    assert.equal((await pool.publish(ad)).value[0].status, 'rejected');
    assert.equal(fakes[0].received.filter(m => m[0] === 'EVENT').length, 1, 'exactly one EVENT, no automatic retry');
  });
});

test('relay data is discovery-only: the package imports no authority, chain, wallet or escrow module and ad outputs are labelled', () => {
  const dir = new URL('../src/', import.meta.url);
  const facade = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
  assert.deepEqual([...facade.matchAll(/from\s+['\"]\.\/src\/([^'\"]+)['\"]/g)].map(match => match[1]).sort(), ['ad.ts', 'nip01.ts', 'pool.ts'], 'only the canonical injected-crypto relay profile is public');
  const localDependencies = {
    'advertisement.ts': new Set(['../../schemas/index.ts', '@noble/curves/secp256k1.js', '@noble/hashes/sha2.js']),
    'local-pool.ts': new Set(['../../schemas/index.ts']),
  };
  for (const name of readdirSync(dir)) {
    const text = readFileSync(new URL(name, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const spec of text.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(spec[1].startsWith('./') || spec[1] === '../../transport/index.ts' || localDependencies[name]?.has(spec[1]), `${name} imports ${spec[1]}`);
    }
    assert.doesNotMatch(text, /TradeBinding|ChainObservation|dispatchLocal|walletGeneration|from\s+['"]node:/);
  }
});

test('crypto stays injected: the default verifier is required and signing is never done in the pool', () => {
  assert.equal(typeof webSocketConnector, 'function');
  const pool = createRelayPool({ broker: makeBroker().broker, relays: [], verifier: makeCrypto(makeKey('x')), nowSeconds: () => NOW });
  assert.equal(pool.subscribe([filter()], collect().handlers).ok, true);
  assert.deepEqual(pool.status(), []);
  pool.close();
  assert.deepEqual(pool.subscribe([filter()], collect().handlers), { ok: false, error: 'CLOSED' });
});
