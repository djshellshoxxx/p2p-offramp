import test from "node:test";
import assert from "node:assert/strict";
import {
  createMeetupReplayProjection,
  encodeMeetupClaimEvent,
  parseMeetupClaimEvent,
} from "../src/geofence.ts";
import {
  H,
  scope,
  good,
  bad,
  vaultFixture,
} from "./support/policy-fixtures.mjs";
const event = (now, over = {}) => ({
  v: 1,
  domain: "p2p-offramp/meetup/v1",
  tradeHash: scope.tradeHash,
  termsHash: scope.termsHash,
  meetupPlanHash: H("5"),
  sessionId: "6".repeat(32),
  sender: scope.peerKey,
  seq: 0,
  kind: "arrival-claimed",
  issuedAtMs: now,
  expiresAtMs: now + 300000,
  eventId: "7".repeat(32),
  ...over,
});
async function setup(t) {
  const s = await vaultFixture(t),
    options = {
      scope,
      planHash: H("5"),
      sessionId: "6".repeat(32),
      isCurrent: () => s.state.current,
      nowMs: () => s.state.now,
      persistence: s.persistence,
    },
    model = good(createMeetupReplayProjection(options));
  t.after(() => model.close());
  return {
    ...s,
    options,
    model,
    record: async (p) =>
      good(await model.record(scope.peerKey, good(encodeMeetupClaimEvent(p)))),
  };
}
test("local replay persists before projection, never authenticates peer/proximity, and deduplicates100copies across reload", async (t) => {
  const s = await setup(t),
    p = event(s.state.now),
    first = await s.record(p);
  assert.equal(first.disposition, "unverified-candidate");
  assert.equal(first.authenticated, false);
  assert.equal(first.economicAuthority, false);
  assert.equal(first.physicalPresenceVerified, false);
  const writes = s.store.writes;
  for (let i = 0; i < 100; i++)
    assert.equal((await s.record(p)).disposition, "duplicate");
  assert.equal(s.store.writes, writes);
  s.model.close();
  const reopened = good(createMeetupReplayProjection(s.options));
  t.after(() => reopened.close());
  assert.equal(
    good(await reopened.record(scope.peerKey, good(encodeMeetupClaimEvent(p))))
      .disposition,
    "duplicate",
  );
  assert.ok(
    !JSON.stringify([...s.store.rows.values()]).includes("arrival-claimed"),
  );
});
test("changed native bindings/plan/session/sender and coordinate fields cannot become current claims", async (t) => {
  const s = await setup(t),
    p = event(s.state.now);
  for (const changed of [
    { tradeHash: H("9") },
    { termsHash: H("9") },
    { meetupPlanHash: H("9") },
    { sessionId: "9".repeat(32) },
    { sender: H("9") },
  ])
    assert.equal(
      (await s.record({ ...p, ...changed })).disposition,
      "superseded",
    );
  for (const changed of [
    { lat: 1 },
    { accuracyM: 1 },
    { v: 2 },
    { expiresAtMs: p.issuedAtMs + 300001 },
    { eventId: "short" },
  ])
    bad(parseMeetupClaimEvent({ ...p, ...changed }));
  const different = good(
    createMeetupReplayProjection({
      ...s.options,
      scope: { ...scope, binding: { ...scope.binding, networkId: "other" } },
    }),
  );
  t.after(() => different.close());
  await s.record(p);
  bad(
    await different.record(scope.peerKey, good(encodeMeetupClaimEvent(p))),
    "CONFLICT",
  );
});
test("concurrent native writes consume one event once; seq survives32IDs and expired/ended candidates never resurrect", async (t) => {
  const s = await setup(t),
    p = event(s.state.now),
    other = good(createMeetupReplayProjection(s.options));
  t.after(() => other.close());
  const both = await Promise.all([
    s.model.record(scope.peerKey, good(encodeMeetupClaimEvent(p))),
    other.record(scope.peerKey, good(encodeMeetupClaimEvent(p))),
  ]);
  assert.equal(
    both.filter((r) => r.ok && r.value.disposition === "unverified-candidate")
      .length,
    1,
  );
  assert.ok(both.some((r) => !r.ok || r.value.disposition === "duplicate"));
  for (let seq = 1; seq <= 33; seq++)
    await s.record({ ...p, seq, eventId: seq.toString(16).padStart(32, "0") });
  assert.equal((await s.record(p)).disposition, "stale");
  s.state.now = p.expiresAtMs;
  assert.equal(
    (await s.record({ ...p, seq: 34, eventId: "a".repeat(32) })).disposition,
    "expired",
  );
  good(await s.model.endSession());
  assert.equal(
    (
      await s.record({
        ...p,
        issuedAtMs: s.state.now,
        expiresAtMs: s.state.now + 300000,
      })
    ).disposition,
    "ended",
  );
});
test("24hour logical retention and expiry/lock during native commit suppress candidate publication", async (t) => {
  const s = await setup(t),
    p = event(s.state.now);
  await s.record(p);
  s.state.now += 86400000;
  assert.equal((await s.record(event(s.state.now))).disposition, "expired");
  assert.equal((await s.record(event(s.state.now))).disposition, "ended");
  const a = await setup(t),
    q = event(a.state.now);
  a.store.afterWrite = () => {
    a.state.now = q.expiresAtMs;
  };
  assert.equal((await a.record(q)).disposition, "expired");
  const b = await setup(t);
  b.store.beforeWrite = () => b.vault.lockAll();
  bad(
    await b.model.record(
      scope.peerKey,
      good(encodeMeetupClaimEvent(event(b.state.now))),
    ),
  );
});
test("audit regression:24hour retention crossing actual G02 mutation or committed-write boundary cannot return a candidate", async (t) => {
  for (const when of ["before", "after"]) {
    const s = await setup(t),
      start = s.state.now;
    await s.record(event(start));
    s.state.now = start + 86400000 - 1000;
    const hook = () => {
      s.state.now = start + 86400000;
    };
    s.store[when === "before" ? "beforeWrite" : "afterWrite"] = hook;
    const r = await s.model.record(
      scope.peerKey,
      good(
        encodeMeetupClaimEvent(
          event(start + 86400000 - 1000, { seq: 1, eventId: "8".repeat(32) }),
        ),
      ),
    );
    assert.ok(!r.ok || r.value.disposition !== "unverified-candidate");
  }
});
