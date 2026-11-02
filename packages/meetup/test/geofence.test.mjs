import test from "node:test";
import assert from "node:assert/strict";
import { createLocationConsentController } from "../index.ts";
import { createGeofence } from "../src/geofence.ts";
import { distanceM } from "../src/shared.ts";
const H = (c) => c.repeat(64),
  good = (r) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  },
  bad = (r) => assert.equal(r.ok, false);
const plan = {
  v: 1,
  planHash: H("4"),
  centerLatE6: 0,
  centerLonE6: 0,
  enterM: 50,
  exitM: 100,
  dwellMs: 30000,
};
function setup(t, over = {}) {
  const clock = {
      wall: 1000000,
      mono: 0,
      gesture: true,
      current: true,
      distance: 0,
    },
    borrowed = [];
  const owner = good(
    createLocationConsentController({
      isUserGesture: () => clock.gesture,
      isForeground: () => true,
      isOwnerCurrent: () => clock.current,
      wallNowMs: () => clock.wall,
      monotonicNowMs: () => clock.mono,
      setTimer: () => 0,
      clearTimer: () => {},
    }),
  );
  const ex = good(
      owner.explain({
        tradeHash: H("1"),
        recipientKey: H("2"),
        radiusM: 500,
        collect: true,
        shareCoarse: false,
        mapFetch: false,
        directNetwork: false,
      }),
    ),
    consent = good(owner.grant(ex));
  good(owner.permissionResult(consent, "granted"));
  const options = {
    plan,
    scope: {
      binding: {
        chain: "evm",
        networkId: "local",
        deploymentId: "fixture",
        tradeId: H("1"),
      },
      tradeHash: H("1"),
      termsHash: H("3"),
      accountKey: H("2"),
      peerKey: H("5"),
    },
    consent,
    isCurrent: () => clock.current,
    wallNowMs: () => clock.wall,
    monotonicNowMs: () => clock.mono,
    isUserGesture: () => clock.gesture,
    geodesic: {
      id: "synthetic-local-fixture",
      distanceM: (b) => {
        borrowed.push(b);
        return clock.distance;
      },
    },
    ...over,
  };
  const model = good(createGeofence(options));
  t.after(() => {
    model.end();
    owner.dispose();
  });
  const step = (mono, d = 0, changes = {}) => {
    clock.mono = mono;
    clock.wall = 1000000 + mono;
    clock.distance = d;
    return model.step(plan.planHash, {
      v: 1,
      lat: 0,
      lon: 0,
      accuracyM: 10,
      sampledAtMs: clock.wall,
      receivedMonotonicMs: mono,
      provenance: "browser-reported",
      consentGeneration: consent.generation,
      ...changes,
    });
  };
  return { model, clock, owner, consent, borrowed, step, options };
}

test("three separated samples and30 monotonic seconds only produce a local prompt; a user gesture alone confirms the claimed arrival", (t) => {
  const s = setup(t);
  assert.equal(good(s.step(0)).state, "entering");
  assert.equal(good(s.step(1000)).state, "entering");
  assert.equal(good(s.step(5000)).state, "dwelling");
  assert.notEqual(good(s.step(29999)).state, "arrival-prompt");
  const v = good(s.step(30000));
  assert.equal(v.state, "arrival-prompt");
  assert.equal(v.confirmedByUser, false);
  assert.equal(v.physicalPresenceVerified, false);
  assert.equal(v.economicAuthority, false);
  assert.doesNotMatch(JSON.stringify(v), /lat|lon|accuracy|sampledAt/);
  s.clock.gesture = false;
  bad(s.model.confirmArrival(s.consent.generation));
  s.clock.gesture = true;
  assert.equal(
    good(s.model.confirmArrival(s.consent.generation)).state,
    "arrival-confirmed",
  );
  assert.ok(s.borrowed.every((b) => b.every((v) => v === 0)));
});

test("49/51/99/101m jitter, accuracy/manual/stale/duplicate samples reset dwell and never fabricate a departure", (t) => {
  const s = setup(t);
  assert.equal(good(s.step(0, 49, { accuracyM: 1 })).state, "entering");
  assert.equal(good(s.step(5000, 51, { accuracyM: 1 })).state, "uncertain");
  assert.equal(good(s.step(10000, 99, { accuracyM: 1 })).state, "uncertain");
  assert.equal(good(s.step(15000, 101, { accuracyM: 1 })).state, "outside");
  assert.equal(
    good(s.step(20000, 0, { provenance: "manual" })).state,
    "uncertain",
  );
  assert.equal(good(s.step(25000, 0, { accuracyM: 26 })).state, "uncertain");
  good(s.step(26000));
  assert.equal(good(s.step(26000)).state, "uncertain");
  assert.equal(
    good(s.step(27000, 0, { sampledAtMs: 900000 })).state,
    "uncertain",
  );
});

test("confirmed arrival requires two separated exit observations and explicit departure confirmation; ambiguity remains uncertain", (t) => {
  const s = setup(t);
  good(s.step(0));
  good(s.step(5000));
  good(s.step(30000));
  good(s.model.confirmArrival(s.consent.generation));
  assert.equal(good(s.step(35000, 120)).reason, "exit-dwell");
  assert.equal(good(s.step(36000, 120)).reason, "exit-dwell");
  assert.equal(good(s.step(40000, 120)).reason, "departure-prompt");
  assert.equal(
    good(s.model.confirmDeparture(s.consent.generation)).reason,
    "departure-claimed",
  );
  assert.equal(good(s.step(45000, 70)).state, "uncertain");
});

test("hide/changed terms/account, clock rollback, changed center plan and sample silence end a generation without reactivation", (t) => {
  for (const how of ["hide", "owner", "clock", "plan", "silence"]) {
    const s = setup(t);
    good(s.step(1000));
    if (how === "hide") s.owner.revoke("hide");
    if (how === "owner") s.clock.current = false;
    if (how === "clock") s.clock.mono = 0;
    if (how === "plan") bad(s.model.step(H("6"), {}));
    if (how === "silence") {
      s.clock.mono = 31001;
      s.clock.wall = 1031001;
    }
    s.model.tick();
    assert.equal(s.model.inspect().state, "ended");
    bad(s.step(40000));
    assert.ok(s.borrowed.every((b) => b.every((v) => v === 0)));
  }
});

test("dateline calculations remain local numerical reports; unavailable adapter and forged imported consent never produce presence", (t) => {
  const s = setup(t, {
    plan: { ...plan, centerLonE6: 179999900 },
    geodesic: {
      id: "existing-spherical-mean-earth",
      distanceM: (b) => distanceM(...b),
    },
  });
  assert.equal(good(s.step(0, 0, { lon: -179.9999 })).state, "entering");
  bad(createGeofence({ ...s.options, geodesic: null }));
  bad(createGeofence({ ...s.options, consent: { ...s.consent } }));
});
test("raw coordinate jobs are bounded by silence timers and rechecked after geodesic/gesture callbacks", (t) => {
  let world;
  const borrowed = [];
  const s = setup(t, {
    geodesic: {
      id: "synthetic-jump",
      distanceM: (b) => {
        borrowed.push(b);
        world.clock.mono = 40000;
        world.clock.wall = 1040000;
        return 0;
      },
    },
  });
  world = s;
  assert.equal(good(s.step(0)).state, "uncertain");
  assert.ok(borrowed.every((b) => b.every((v) => v === 0)));
  let armed = false,
    a;
  const z = setup(t, {
    isUserGesture: () => {
      if (armed) {
        a.clock.mono += 30001;
        a.clock.wall += 30001;
      }
      return true;
    },
  });
  a = z;
  good(z.step(0));
  good(z.step(5000));
  good(z.step(30000));
  armed = true;
  bad(z.model.confirmArrival(z.consent.generation));
  assert.equal(z.model.inspect().state, "ended");
  const timers = new Set(),
    k = setup(t, {
      setTimer: (callback, ms) => {
        assert.ok(ms <= 30000);
        timers.add(callback);
        return callback;
      },
      clearTimer: (handle) => timers.delete(handle),
    });
  good(k.step(0));
  assert.equal(timers.size, 1);
  good(k.step(5000));
  assert.equal(timers.size, 1);
  [...timers][0]();
  assert.equal(k.model.inspect().state, "ended");
  assert.equal(timers.size, 0);
});
test("read-only inspect reentry cannot recurse owner hooks or advance a mutating sample", (t) => {
  let model,
    armed = false,
    depth = 0,
    maxDepth = 0;
  const s = setup(t, {
    isCurrent: () => {
      if (armed) {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        try {
          model.inspect();
        } finally {
          depth--;
        }
      }
      return true;
    },
  });
  model = s.model;
  armed = true;
  assert.equal(good(s.step(0)).state, "entering");
  assert.equal(maxDepth, 1);
  assert.equal(model.inspect().state, "entering");
});
