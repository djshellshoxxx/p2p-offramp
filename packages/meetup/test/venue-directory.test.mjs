import test from "node:test";
import assert from "node:assert/strict";
import {
  createVenueDirectory,
  parseVenueRecord,
  encodeVenueRecord,
  encodeVenueRevocation,
} from "../src/venue-directory.ts";
import { createPolicyOwner, createPolicyVault } from "../src/policy-data.ts";
import {
  H,
  scope,
  good,
  bad,
  vaultFixture,
} from "./support/policy-fixtures.mjs";
const DAY = 86400000,
  key = H("5"),
  signature = "0".repeat(128);
const record = (now, over = {}) => ({
  v: 1,
  venueId: "1".repeat(32),
  publisherKey: key,
  revision: 1,
  latE6: 0,
  lonE6: 0,
  name: "Public fixture venue",
  address: "Synthetic public plaza",
  notes: "Publisher recommendation only",
  facilities: [{ kind: "lighting", status: "unknown", lastCheckedAtMs: now }],
  issuedAtMs: now,
  expiresAtMs: now + 30 * DAY,
  license: "fixture-license",
  attribution: "Fixture attribution",
  signature,
  ...over,
});
const revoke = (now, over = {}) => ({
  v: 1,
  publisherKey: key,
  venueId: "1".repeat(32),
  sequence: 1,
  effectiveAtMs: now,
  reason: "closed",
  signature,
  ...over,
});
async function setup(t, over = {}) {
  const s = await vaultFixture(t),
    buffers = [],
    options = {
      scope,
      isCurrent: () => s.state.current,
      persistence: s.persistence,
      policyVersion: "synthetic-unqualified-v1",
      publisherKeys: [key],
      blockedKeys: [],
      licenses: ["fixture-license"],
      nowMs: () => s.state.now,
      lastRefreshAtMs: () => s.state.checked,
      moderate: () => true,
      verify: async (req) => {
        buffers.push(req.canonicalPayload);
        assert.equal(
          req.domain,
          req.kind === "record" ? "p2p-offramp/venue/v1" : null,
        );
        return true;
      },
      ...over,
    },
    model = good(createVenueDirectory(options));
  t.after(() => model.close());
  return {
    ...s,
    buffers,
    options,
    model,
    apply: async (records, revocations = []) =>
      good(
        await model.apply(
          records.map((p) => good(encodeVenueRecord(p))),
          revocations.map((p) => good(encodeVenueRevocation(p))),
        ),
      ),
  };
}

test("exact venue records are detached public content; unknown fields/floats/licenses/keys and noncanonical bytes never grant recommendation", async (t) => {
  assert.equal(
    (await good(createVenueDirectory()).apply([], [])).value.freshness,
    "unconfigured",
  );
  const s = await setup(t),
    p = record(s.state.now);
  const first = await s.apply([p]);
  assert.equal(first.decisions[0].state, "recommended");
  assert.equal(first.distributionApproved, false);
  assert.equal(first.decisions[0].recommendationNotCertification, true);
  assert.ok(s.buffers.every((b) => b.every((v) => v === 0)));
  for (const changed of [
    { latE6: 1.5 },
    { lonE6: 180000000 },
    { publisherKey: "A".repeat(64) },
    { signature: "0".repeat(127) },
    { name: "n".repeat(161) },
    { remoteImage: "https://invalid/" },
    { notes: "hidden\u202e" },
  ])
    bad(parseVenueRecord({ ...p, ...changed }));
  const unknown = await s.apply([
    { ...p, venueId: "2".repeat(32), license: "unknown" },
  ]);
  assert.equal(unknown.invalidEntries, 1);
  const badKey = await s.apply([{ ...p, publisherKey: H("6") }]);
  assert.equal(badKey.invalidEntries, 1);
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  const result = good(await s.model.apply([bytes], []));
  assert.equal(result.invalidEntries, 1);
  const duplicate = new TextEncoder().encode('{"v":1,"v":1}');
  assert.equal(good(await s.model.apply([duplicate], [])).invalidEntries, 1);
});

test("actual encrypted high-water survives reload, rejects rollback/equivocation and applies venue/publisher revocation before ordering", async (t) => {
  const s = await setup(t),
    p = record(s.state.now);
  await s.apply([{ ...p, revision: 2 }]);
  s.model.close();
  const reopened = good(createVenueDirectory(s.options));
  t.after(() => reopened.close());
  const apply = async (ps, rs = []) =>
    good(
      await reopened.apply(
        ps.map((p) => good(encodeVenueRecord(p))),
        rs.map((p) => good(encodeVenueRevocation(p))),
      ),
    );
  assert.equal((await apply([p])).decisions[0].reason, "older-revision");
  const conflict = await apply([
    { ...p, revision: 2, name: "Changed same revision" },
  ]);
  assert.equal(conflict.decisions[0].state, "quarantined");
  const other = { ...p, venueId: "2".repeat(32) };
  assert.equal(
    (await apply([other], [revoke(s.state.now, { venueId: "*" })])).decisions[0]
      .state,
    "revoked",
  );
  reopened.close();
  const again = good(createVenueDirectory(s.options));
  t.after(() => again.close());
  assert.equal(
    good(await again.apply([good(encodeVenueRecord(other))], [])).decisions[0]
      .state,
    "revoked",
  );
  const serialized = JSON.stringify([...s.store.rows.values()]);
  assert.ok(
    !serialized.includes("Public fixture venue") && !serialized.includes(key),
  );
});

test("blocked publishers cannot self-unblock; suppressed lower revocations, stale dates and clock rollback cannot become fresh recommendations", async (t) => {
  const s = await setup(t, { blockedKeys: [key] }),
    p = record(s.state.now);
  assert.equal((await s.apply([p])).decisions[0].state, "blocked");
  const a = await setup(t),
    q = record(a.state.now);
  await a.apply(
    [q],
    [revoke(a.state.now, { sequence: 2, effectiveAtMs: a.state.now + 1000 })],
  );
  assert.equal(
    (await a.apply([q], [revoke(a.state.now, { sequence: 1 })])).decisions[0]
      .state,
    "revoked",
  );
  const b = await setup(t),
    r = record(b.state.now);
  b.state.checked -= DAY;
  assert.equal((await b.apply([r])).decisions[0].state, "stale");
  b.state.checked = b.state.now;
  await b.apply([r]);
  b.state.now--;
  assert.equal((await b.apply([r])).freshness, "unknown");
  b.state.now += 30 * DAY + 1;
  b.state.checked = b.state.now;
  assert.equal((await b.apply([r])).decisions[0].state, "expired");
});

test("chunked actual G02 persistence supports5000 records, preserves foreign preferences, and rejects5001 before signature work", async (t) => {
  const s = await setup(t);
  good(
    await s.vault.commit(s.session.sessionId, s.session.revision, [
      {
        op: "put",
        record: {
          id: "b".repeat(32),
          kind: "preference",
          schemaVersion: 77,
          payload: "e30",
        },
      },
    ]),
  );
  const p = record(s.state.now),
    records = Array.from({ length: 5000 }, (_, n) => ({
      ...p,
      venueId: n.toString(16).padStart(32, "0"),
    }));
  const view = await s.apply(records);
  assert.equal(view.decisions.length, 5000);
  assert.ok(view.decisions.every((d) => d.state === "recommended"));
  assert.equal(
    good(await s.vault.read(s.session.sessionId, "b".repeat(32))).schemaVersion,
    77,
  );
  const calls = s.buffers.length;
  bad(
    await s.model.apply(Array(5001).fill(new Uint8Array()), []),
    "CAPACITY_EXCEEDED",
  );
  assert.equal(s.buffers.length, calls);
  const rows = good(await s.vault.list(s.session.sessionId));
  assert.ok(
    rows.length > 3,
    "actual high-water crosses a G02 record payload boundary",
  );
});

test("lock/reentrant owner/late callback cannot publish decisions; native foreign preference head remains untouched", async (t) => {
  const s = await setup(t);
  good(
    await s.vault.commit(s.session.sessionId, s.session.revision, [
      {
        op: "put",
        record: {
          id: s.persistence.recordId,
          kind: "preference",
          schemaVersion: 19,
          payload: "e30",
        },
      },
    ]),
  );
  bad(
    await s.model.apply([good(encodeVenueRecord(record(s.state.now)))], []),
    "CONFLICT",
  );
  assert.equal(
    good(await s.vault.read(s.session.sessionId, s.persistence.recordId))
      .schemaVersion,
    19,
  );
  const a = await setup(t);
  a.store.beforeWrite = () => a.vault.lockAll();
  bad(await a.model.apply([good(encodeVenueRecord(record(a.state.now)))], []));
  assert.ok(a.buffers.every((b) => b.every((v) => v === 0)));
  let model,
    armed = false;
  const b = await setup(t, {
    isCurrent: () => {
      if (armed) model.close();
      return true;
    },
    verify: async () => {
      armed = true;
      return true;
    },
  });
  model = b.model;
  bad(
    await model.apply([good(encodeVenueRecord(record(b.state.now)))], []),
    "LOCKED",
  );
});

test("local90day high-water retention expires only owned diagnostic history, without deleting core or foreign records", async (t) => {
  const s = await setup(t),
    p = record(s.state.now);
  await s.apply([p], [revoke(s.state.now)]);
  s.state.now += 90 * DAY;
  s.state.checked = s.state.now;
  await s.apply([]);
  const owner = createPolicyOwner(scope, () => true),
    storage = createPolicyVault(owner, s.persistence);
  const stored = good(await owner.run(async () => await storage.read())).value;
  assert.equal(stored.records.length, 0);
  assert.equal(stored.revocations.length, 0);
  owner.close();
});
test("audit regression: failed constructors never retain a captured actual G02 lease", async (t) => {
  const s = await vaultFixture(t);
  let captures = 0,
    disposed = 0;
  const vault = {
    read: s.vault.read.bind(s.vault),
    commit: s.vault.commit.bind(s.vault),
    captureSession(...args) {
      const r = s.vault.captureSession(...args);
      if (!r.ok) return r;
      captures++;
      let ended = false;
      return {
        ok: true,
        value: {
          current: r.value.current,
          dispose() {
            if (!ended) {
              ended = true;
              disposed++;
              r.value.dispose();
            }
          },
        },
      };
    },
  };
  const persistence = { ...s.persistence, vault },
    options = {
      scope,
      isCurrent: () => true,
      persistence,
      policyVersion: null,
      publisherKeys: [],
      blockedKeys: [],
      licenses: [],
      nowMs: () => s.state.now,
      lastRefreshAtMs: () => null,
      moderate: () => true,
      verify: async () => true,
    };
  bad(createVenueDirectory(options));
  const { createMeetupReplayProjection } = await import("../src/geofence.ts");
  bad(
    createMeetupReplayProjection({
      scope,
      isCurrent: () => true,
      persistence,
      planHash: "invalid",
      sessionId: "6".repeat(32),
      nowMs: () => s.state.now,
    }),
  );
  assert.equal(captures, disposed);
  bad(
    createVenueDirectory({
      ...options,
      policyVersion: "valid",
      persistence: {
        ...persistence,
        isStorageCurrent: () => {
          throw Error("PRIVATE");
        },
      },
    }),
  );
  assert.equal(captures, disposed);
});
