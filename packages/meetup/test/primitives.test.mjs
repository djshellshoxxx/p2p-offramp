import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocationConsentController, assessClaim, encodeGeohash, decodeGeohash, regionFor, validateDiscoveryRegion } from '../index.ts';
import { readConsent } from '../src/consent.ts';
import { blurMarker } from '../src/blur.ts';
const val = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const fail = (r, code) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code); };
const H = 'ab'.repeat(32), K = 'cd'.repeat(32), E = '12'.repeat(16);
const request = over => ({ tradeHash: H, recipientKey: K, radiusM: 500, collect: true, shareCoarse: true, mapFetch: false, directNetwork: false, ...over });
function world(over = {}) {
  const clock = { wall: 1_700_000_000_000, mono: 1000, gesture: true, visible: true, owner: true }, timers = new Set();
  const consent = val(createLocationConsentController({ wallNowMs: () => clock.wall, monotonicNowMs: () => clock.mono,
    isUserGesture: () => clock.gesture, isForeground: () => clock.visible, isOwnerCurrent: () => clock.owner,
    setTimer: callback => { timers.add(callback); return callback; }, clearTimer: callback => timers.delete(callback), ...over }));
  const explain = val(consent.explain(request()));
  return { clock, consent, explain, timers, grant() { const cap = val(consent.grant(explain)); val(consent.permissionResult(cap, 'granted')); return cap; } };
}
const claim = over => ({ v: 1, lat: 0, lon: 0, accuracyM: 10, sampledAtMs: 100_000, receivedMonotonicMs: 1000, provenance: 'browser-reported', consentGeneration: 0, ...over });
const marker = over => ({ v: 1, latE6: 0, lonE6: 0, radiusM: 500, uncertaintyM: 510, epoch: E, expiresAtMs: 900_000, ...over });

test('consent has no sensor/network activation and grants only its own explained capability on a gesture', () => {
  let touches = 0; const s = world(); assert.equal(s.consent.inspect().state, 'explaining');
  fail(s.consent.grant({ ...s.explain }), 'CONSENT_REVOKED'); s.clock.gesture = false;
  fail(s.consent.grant(s.explain), 'CONSENT_REVOKED'); s.clock.gesture = true;
  const cap = val(s.consent.grant(s.explain)); assert.equal(s.consent.inspect().state, 'awaiting-browser');
  assert.throws(() => readConsent(cap, 'collect')); val(s.consent.permissionResult(cap, 'granted'));
  assert.equal(readConsent(cap, 'collect').generation, cap.generation); assert.throws(() => readConsent({ ...cap }, 'collect'));
  val(s.consent.registerCleanup(cap, () => { touches++; })); s.consent.revoke('hide');
  assert.equal(touches, 1); assert.equal(s.consent.inspect().state, 'paused'); assert.equal(s.timers.size, 0);
  assert.throws(() => readConsent(cap, 'shareCoarse')); fail(s.consent.permissionResult(cap, 'granted'), 'STALE_GENERATION');
  assert.equal(s.consent.inspect().consent, null); s.consent.dispose(); assert.equal(Object.isFrozen(s.consent), true);
});
test('consent expires on wall/monotonic time, clears all owner resources and rejects rollback/out-of-order work', () => {
  for (const how of ['wall', 'mono', 'owner', 'permission', 'clock-back']) {
    const s = world(), cap = s.grant(); let cleaned = 0;
    val(s.consent.registerCleanup(cap, () => { throw Error('private owner error'); })); val(s.consent.registerCleanup(cap, () => cleaned++));
    if (how === 'wall') s.clock.wall += 1_800_000;
    if (how === 'mono') s.clock.mono += 1_800_000;
    if (how === 'owner') s.clock.owner = false;
    if (how === 'permission') s.consent.revoke('permission-lost');
    if (how === 'clock-back') s.clock.wall--;
    assert.throws(() => readConsent(cap, 'collect')); assert.equal(cleaned, 1); assert.equal(s.consent.inspect().consent, null);
    assert.equal(s.timers.size, 0); s.consent.dispose();
  }
  const s = world(), first = s.grant(), newer = val(s.consent.explain(request({ mapFetch: true })));
  const second = val(s.consent.grant(newer)); fail(s.consent.permissionResult(first, 'granted'), 'STALE_GENERATION');
  val(s.consent.permissionResult(second, 'denied')); assert.equal(s.consent.inspect().consent, null); s.consent.dispose();
});
test('collection, sharing, map and direct permissions stay separate and cleanup registration is bounded', () => {
  const s = world(), ex = val(s.consent.explain(request({ collect: false, shareCoarse: true, directNetwork: false })));
  const cap = val(s.consent.grant(ex)); assert.equal(s.consent.inspect().state, 'collecting');
  assert.throws(() => readConsent(cap, 'collect')); assert.throws(() => readConsent(cap, 'directNetwork')); assert.throws(() => readConsent(cap, 'mapFetch'));
  assert.equal(readConsent(cap, 'shareCoarse').tradeHash, H);
  for (let i = 0; i < 32; i++) val(s.consent.registerCleanup(cap, () => {}));
  fail(s.consent.registerCleanup(cap, () => {}), 'CAPACITY_EXCEEDED'); s.consent.dispose();
});
test('claim freshness is bounded by wall and monotonic time; provenance never upgrades to physical authentication', () => {
  assert.equal(val(assessClaim(claim(), 100_000, 1000, 0)).status, 'reported');
  for (const input of [claim({ sampledAtMs: 69_999 }), claim({ sampledAtMs: 105_001 }), claim({ receivedMonotonicMs: 0 })]) {
    assert.equal(val(assessClaim(input, 100_000, 30_000, 0)).status, 'rejected');
  }
  assert.equal(val(assessClaim(claim({ accuracyM: 26 }), 100_000, 1000, 0)).status, 'uncertain');
  assert.equal(val(assessClaim(claim({ provenance: 'manual' }), 100_000, 1000, 0)).status, 'uncertain');
  assert.equal(val(assessClaim(claim({ consentGeneration: 1 }), 100_000, 1000, 0)).status, 'rejected');
  assert.equal(val(assessClaim(claim({ lat: 1, receivedMonotonicMs: 2000 }), 100_000, 2000, 0, claim())).reason, 'inconsistent');
  assert.equal(val(assessClaim(claim(), 100_000, 1000, 0, claim())).reason, 'inconsistent');
  for (const over of [{ lat: NaN }, { lon: Infinity }, { accuracyM: 0 }, { accuracyM: -1 }, { accuracyM: 101 }, { lon: 180 }]) assert.equal(assessClaim(claim(over), 100_000, 1000, 0).ok, false);
});
test('geohash agrees with independent exact-grid oracle on 1024 fixed points at precisions4..7', async () => {
  const oracle = JSON.parse(await readFile(new URL('./fixtures/geohash-oracle.json', import.meta.url), 'utf8'));
  assert.equal(oracle.points, 1024); let compared = 0;
  for (const row of oracle.vectors) for (const [precision, expected] of Object.entries(row.hashes)) {
    assert.equal(val(encodeGeohash(row.lat, row.lon, Number(precision))), expected, row.label);
    const box = val(decodeGeohash(expected));
    assert.ok(row.lat >= box.south && row.lat <= box.north && row.lon >= box.west && row.lon <= box.east); compared++;
  }
  assert.equal(compared, 4096); assert.equal(val(encodeGeohash(42.6, -5.6, 5)), 'ezs42');
});
test('regions stay coarse and stable at dateline, cell boundaries and high latitudes without a query surface', () => {
  for (const lat of [0, 60, 84.9, -84.9, 85, -85]) for (const lon of [-180, -179.999999, 0, 179.999999]) for (const radiusM of [500, 1000, 2000]) {
    const input = marker({ latE6: Math.round(lat * 1e6), lonE6: Math.round(lon * 1e6), radiusM, uncertaintyM: radiusM + 10 });
    const region = val(regionFor(input, 0)); assert.equal(region.cells.length, 9); assert.ok(region.diagonalM < 50_000);
    assert.deepEqual(region.cells, [...new Set(region.cells)].sort()); assert.deepEqual(val(validateDiscoveryRegion(region, 0)), region);
    assert.deepEqual(val(regionFor(input, 0)), region); assert.ok(region.precision >= 4 && region.precision <= 7);
    assert.equal(region.source, 'blurred'); assert.equal(val(regionFor(input, 0, 'manual')).source, 'manual');
  }
  fail(encodeGeohash(85.1, 0, 5), 'UNSUPPORTED_LATITUDE'); fail(regionFor(marker({ latE6: 85_000_001 }), 0), 'UNSUPPORTED_LATITUDE');
  const good = val(regionFor(marker(), 0));
  for (const over of [{ cells: [...good.cells, good.cells[0]] }, { cells: [...good.cells].reverse() }, { cells: ['ezs4', ...good.cells.slice(1)] }, { diagonalM: 1 }, { cells: ['zzzzzz'] }, { extra: 'coordinate' }]) assert.equal(validateDiscoveryRegion({ ...good, ...over }, 0).ok, false);
  fail(regionFor(marker(), 900_000), 'EXPIRED'); assert.equal('query' in good, false); assert.equal(Object.isFrozen(good.cells), true);
});
test('spherical blur handles deterministic zero/near-one uniforms, dateline and RNG failure', () => {
  const source = claim({ lat: 0, lon: 179.999999 });
  const zero = blurMarker(source, 500, E, 0, 900_000, bytes => bytes.fill(0));
  assert.equal(zero.latE6, 0); assert.equal(zero.lonE6, 179_999_999);
  const edge = blurMarker(source, 500, E, 0, 900_000, bytes => bytes.fill(255));
  assert.ok(edge.lonE6 >= -180_000_000 && edge.lonE6 < 180_000_000); assert.equal(edge.uncertaintyM, 510);
  assert.throws(() => blurMarker(source, 500, E, 0, 900_000, () => { throw Error('private RNG error'); }));
  assert.throws(() => blurMarker(claim({ lat: 86 }), 500, E, 0, 900_000, bytes => bytes.fill(0)));
});
test('bounded actual WebCrypto blur distribution diagnostic has approximately area-uniform squared radius', () => {
  const source = claim(), radius = 500, samples = 10_000; let squared = 0;
  // Independent unit-sphere central-angle calculation, separate from the sampling destination formula.
  for (let i = 0; i < samples; i++) {
    const point = blurMarker(source, radius, E, 0, 900_000, bytes => crypto.getRandomValues(bytes));
    const lat = point.latE6 / 1e6 * Math.PI / 180, lon = point.lonE6 / 1e6 * Math.PI / 180;
    const d = 6_371_008.8 * Math.atan2(Math.hypot(Math.sin(lon) * Math.cos(lat), Math.sin(lat)), Math.cos(lat) * Math.cos(lon));
    assert.ok(d <= radius + 2); squared += (d / radius) ** 2;
  }
  assert.ok(Math.abs(squared / samples - 0.5) < 0.03, String(squared / samples));
});
test('hostile properties, unknown fields and future versions fail without invoking accessors', () => {
  let getters = 0; const hostile = Object.defineProperty({}, 'tradeHash', { enumerable: true, get() { getters++; return H; } });
  const s = world(); fail(s.consent.explain(hostile), 'INVALID_INPUT');
  const weird = Object.create(null); weird.v = 2; assert.equal(assessClaim(weird, 0, 0, 0).ok, false); assert.equal(getters, 0);
  assert.equal(regionFor({ ...marker(), v: 2 }, 0).ok, false); s.consent.dispose();
});
test('reentrant gesture/RNG/timer owners cannot revive retired consent or leak a timer', () => {
  let s, revokeDuringGesture = false;
  s = world({ isUserGesture: () => { if (revokeDuringGesture) s.consent.revoke('lock'); return true; } });
  revokeDuringGesture = true; fail(s.consent.grant(s.explain), 'CONSENT_REVOKED'); assert.equal(s.consent.inspect().consent, null); s.consent.dispose();
  let r, revokeDuringRandom = false;
  r = world({ randomFill: bytes => { bytes.fill(0); if (revokeDuringRandom) r.consent.revoke('lock'); } });
  revokeDuringRandom = true; fail(r.consent.grant(r.explain), 'CONSENT_REVOKED'); assert.equal(r.consent.inspect().consent, null); r.consent.dispose();
  let timed, cleared = 0;
  timed = world({ setTimer: () => { timed.consent.revoke('lock'); return 91; }, clearTimer: () => { cleared++; } });
  fail(timed.consent.grant(timed.explain), 'CONSENT_REVOKED'); assert.equal(cleared, 1); timed.consent.dispose();
  const good = val(regionFor(marker(), 0));
  fail(validateDiscoveryRegion({ ...good, precision: 4, cells: ['zzzz'], diagonalM: 1, widthM: 1, heightM: 1 }, 0), 'UNSUPPORTED_LATITUDE');
});
