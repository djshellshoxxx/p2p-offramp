import test from "node:test";
import assert from "node:assert/strict";
import {
  createLockerModel,
  evaluateAccessWindow,
  createInspectionModel,
} from "../src/locker.ts";
import { fixture, H, context, signs } from "./support/fixtures.mjs";
const val = (r) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  },
  fail = (r, c) => {
    assert.equal(r.ok, false);
    assert.equal(r.code, c);
  };
function setup() {
  let at = 100;
  const f = fixture({ requiredSigners: () => ["key-device"] });
  const options = {
    verifier: f.verifier,
    profileId: "fixture-no-hardware-support",
    lockerId: "local-fixture",
    reservationId: "r",
    deviceKey: "key-device",
    initialCounter: 0,
    nowSeconds: () => at,
  };
  return {
    ...f,
    options,
    model: val(createLockerModel(options)),
    setTime: (t) => (at = t),
  };
}
const command = () => ({
  commandId: H("4"),
  shipmentId: context.shipmentId,
  lockerId: "local-fixture",
  profileId: "fixture-no-hardware-support",
  operation: "unlock",
  reservationId: "r",
  expectedCounter: 0,
  capabilityHash: H("5"),
  expiresAt: 200,
});
test("unknown profile refuses before any action; uncertain unlock cannot be sent or prepared twice and status reads are bounded", () => {
  const f = setup();
  fail(
    createLockerModel({ ...f.options, profileId: null }),
    "UNSUPPORTED_PROFILE",
  );
  val(f.model.prepare(0, command()));
  val(f.model.markSendStarted(1));
  fail(f.model.markSendStarted(2), "CONFLICT");
  fail(f.model.prepare(2, command()), "UNKNOWN_OUTCOME");
  for (let i = 0; i < 3; i++) val(f.model.requestStatusRead(2 + i));
  const v = val(f.model.requestStatusRead(5));
  assert.equal(v.phase, "manualRecovery");
  assert.equal(v.statusReads, 3);
  assert.equal(v.physicalCustodyResolved, false);
  assert.equal(v.economicAuthority, false);
});
test("a prepared command can start only strictly before its original expiry", () => {
  const live = setup();
  val(live.model.prepare(0, command()));
  live.setTime(199);
  const sent = val(live.model.markSendStarted(1));
  assert.equal(sent.phase, "unknown");
  assert.equal(sent.economicAuthority, false);
  fail(live.model.markSendStarted(2), "CONFLICT");
  live.verifier.close();

  for (const at of [200, 201]) {
    const f = setup();
    const prepared = val(f.model.prepare(0, command()));
    f.setTime(at);
    fail(f.model.markSendStarted(1), "EXPIRED");
    assert.deepEqual(val(f.model.inspect()), prepared);
    fail(f.model.markSendStarted(1), "EXPIRED");
    assert.deepEqual(val(f.model.inspect()), prepared);
    f.verifier.close();
  }
});
test("authenticated-looking imported status is not proof; counter rollback/conflicting sensors/jam quarantine without completing delivery", async () => {
  const f = setup();
  val(f.model.prepare(0, command()));
  val(f.model.markSendStarted(1));
  const observation = {
    commandId: H("4"),
    counter: 1,
    status: "unlocked",
    authenticated: true,
  };
  fail(
    f.model.observe(2, { kind: "locker-observation", ...observation }),
    "UNAUTHORIZED",
  );
  let p = val(
    await f.verifier.verify(
      "locker-observation",
      observation,
      signs("key-device"),
    ),
  );
  let v = val(f.model.observe(2, p));
  assert.equal(v.phase, "unknown");
  assert.equal(v.physicalCustodyResolved, false);
  p = val(
    await f.verifier.verify(
      "locker-observation",
      { ...observation, status: "locked" },
      signs("key-device"),
    ),
  );
  v = val(f.model.observe(3, p));
  assert.equal(v.phase, "quarantined");
  const g = setup();
  val(g.model.prepare(0, command()));
  val(g.model.markSendStarted(1));
  p = val(
    await g.verifier.verify(
      "locker-observation",
      { ...observation, status: "jammed" },
      signs("key-device"),
    ),
  );
  assert.equal(val(g.model.observe(2, p)).phase, "quarantined");
});
test("window upper-bound equality, clock uncertainty and lost replay/revocation storage refuse; valid remains diagnostic only", async () => {
  const f = fixture({ requiredSigners: () => ["key-issuer"] }),
    body = {
      reservationId: "r",
      credentialId: H("5"),
      subject: "key-courier",
      notBefore: 100,
      expiresAt: 200,
      maxClockError: 30,
      maxUses: 1,
      issuer: "key-issuer",
      revocationEpoch: 4,
      offlineAllowed: false,
    };
  const window = val(
      await f.verifier.verify("window", body, signs("key-issuer")),
    ),
    opts = {
      verifier: f.verifier,
      window,
      reservationId: "r",
      subject: "key-courier",
      interval: { lower: 110, upper: 120, error: 10 },
      revocationEpoch: 4,
      replayStorageAvailable: true,
    };
  const v = val(evaluateAccessWindow(opts));
  assert.equal(v.decision, "valid");
  assert.equal(v.nativeUnlockAllowed, false);
  assert.equal(v.oneUsePersistenceVerified, false);
  assert.equal(
    val(
      evaluateAccessWindow({
        ...opts,
        interval: { lower: 95, upper: 105, error: 10 },
      }),
    ).decision,
    "too-early",
  );
  assert.equal(
    val(
      evaluateAccessWindow({
        ...opts,
        interval: { lower: 190, upper: 200, error: 10 },
      }),
    ).decision,
    "expired",
  );
  assert.equal(
    val(
      evaluateAccessWindow({
        ...opts,
        interval: { lower: 110, upper: 120, error: 31 },
      }),
    ).decision,
    "clock-uncertain",
  );
  assert.equal(
    val(evaluateAccessWindow({ ...opts, replayStorageAvailable: false }))
      .decision,
    "revocation-unavailable",
  );
  assert.equal(
    val(evaluateAccessWindow({ ...opts, revocationEpoch: null })).decision,
    "revocation-unavailable",
  );
});
test("changed seals and damaged history remain visible after a later intact claim; unapproved device is not human verification", async () => {
  const f = fixture({ requiredSigners: () => ["key-observer"] }),
    model = val(
      createInspectionModel({
        verifier: f.verifier,
        containerId: H("5"),
        legId: H("6"),
      }),
    );
  const body = {
    shipmentId: context.shipmentId,
    containerId: H("5"),
    legId: H("6"),
    observer: "key-observer",
    sealId: "S1",
    condition: "damaged",
    observedAt: 100,
    priorInspection: null,
    evidenceHashes: [],
    source: "human",
    deviceProfile: null,
  };
  const first = val(
    await f.verifier.verify("inspection", body, signs("key-observer")),
  );
  assert.equal(val(model.record(first)).damageEverClaimed, true);
  const next = val(
      await f.verifier.verify(
        "inspection",
        {
          ...body,
          condition: "intactClaimed",
          sealId: "S2",
          observedAt: 101,
          priorInspection: first.hash,
        },
        signs("key-observer"),
      ),
    ),
    v = val(model.record(next));
  assert.equal(v.damageEverClaimed, true);
  assert.equal(v.sealChanged, true);
  assert.equal(v.physicalContentsVerified, false);
  const device = val(
    await f.verifier.verify(
      "inspection",
      { ...body, source: "reviewedDevice", deviceProfile: "unapproved" },
      signs("key-observer"),
    ),
  );
  fail(model.record(device), "UNSUPPORTED_PROFILE");
});
