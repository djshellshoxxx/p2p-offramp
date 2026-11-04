import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createMapValidator,
  encodeMapManifest,
  parseMapManifest,
  xyzForDisplay,
  mapTileKey,
  checkMapDecodeLimits,
  MAP_LIMITS,
} from "../src/map-manifest.ts";
import { regionFor, createLocationConsentController } from "../index.ts";
import { H, scope, good, bad } from "./support/policy-fixtures.mjs";
const empty =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const manifest = (now, over = {}) => ({
  v: 1,
  datasetId: "fixture-dataset",
  version: "v1",
  grid: "xyz-v1",
  format: "mvt-2.1",
  tiles: [
    { z: 0, x: 0, y: 0, sha256: empty, byteLength: 0 },
    ...Array.from({ length: 4 }, (_, i) => ({
      z: 10,
      x: 511 + (i % 2),
      y: 511 + Math.floor(i / 2),
      sha256: empty,
      byteLength: 0,
    })),
  ],
  license: "fixture-license",
  attribution: "Offline fixture attribution",
  issuedAtMs: now,
  expiresAtMs: now + 900000,
  signature: "synthetic-profile-only",
  ...over,
});
function world(t, over = {}) {
  const state = { now: 1700000000000, current: true },
    buffers = [],
    options = {
      scope,
      isCurrent: () => state.current,
      nowMs: () => state.now,
      licenses: ["fixture-license"],
      lookup: () => ({
        id: "synthetic-unqualified-content-profile",
        parseSignature: (s) => {
          if (s !== "synthetic-profile-only")
            throw Error("private profile decoder");
          return s;
        },
        verify: async (r) => {
          buffers.push(r.canonicalPayload);
          return true;
        },
      }),
      ...over,
    },
    model = good(createMapValidator(options));
  t.after(() => model.close());
  return {
    state,
    buffers,
    model,
    options,
    validate: async (p) =>
      good(await model.validate(good(encodeMapManifest(p)))),
  };
}

test("XYZ display addressing matches independent Python log/tan oracle at zoom0/dateline/maxzoom and keeps clipping out of location evidence", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("./fixtures/xyz-python-v1.json", import.meta.url)),
  );
  for (const row of fixture.vectors)
    assert.deepEqual(good(xyzForDisplay(row.lat, row.lon, row.z)), {
      z: row.z,
      x: row.x,
      y: row.y,
      latitudeClipped: row.latitudeClipped,
    });
  assert.equal(
    good(
      mapTileKey("dataset", "v1", {
        z: 0,
        x: 0,
        y: 0,
        sha256: empty,
        byteLength: 0,
      }),
    ),
    `dataset/v1/0/0/0/${empty}`,
  );
  for (const changed of [
    { z: 15 },
    { x: -1 },
    { y: 1 },
    { sha256: empty.toUpperCase() },
  ])
    bad(
      mapTileKey("dataset", "v1", {
        z: 0,
        x: 0,
        y: 0,
        sha256: empty,
        byteLength: 0,
        ...changed,
      }),
    );
  bad(
    mapTileKey("../private", "v1", {
      z: 0,
      x: 0,
      y: 0,
      sha256: empty,
      byteLength: 0,
    }),
  );
});

test("exact manifests reject unknown URL/style/grid/duplicate fields and unconfigured signing/dataset/license policies", async (t) => {
  bad(
    await good(createMapValidator()).validate(new Uint8Array()),
    "MAP_UNCONFIGURED",
  );
  const s = world(t),
    p = manifest(s.state.now);
  for (const changed of [
    { grid: "tms" },
    { remoteStyle: "https://invalid/" },
    { sourceUrl: "https://invalid/" },
    { tiles: [p.tiles[0], p.tiles[0]] },
    { tiles: [{ ...p.tiles[0], byteLength: MAP_LIMITS.compressedBytes + 1 }] },
  ])
    bad(parseMapManifest({ ...p, ...changed }));
  bad(
    await s.model.validate(new Uint8Array(MAP_LIMITS.manifestBytes + 1)),
    "CAPACITY_EXCEEDED",
  );
  bad(await s.model.validate(new TextEncoder().encode('{"v":1,"v":1}')));
  const unsupported = world(t, { lookup: () => null });
  bad(
    await unsupported.model.validate(good(encodeMapManifest(p))),
    "MAP_UNCONFIGURED",
  );
  bad(
    await s.model.validate(
      good(encodeMapManifest({ ...p, license: "unknown" })),
    ),
    "UNSUPPORTED_LICENSE",
  );
  const evidence = await s.validate(p);
  assert.equal(evidence.decodeApproved, false);
  assert.equal(evidence.networkExecutionAllowed, false);
  assert.ok(s.buffers.every((b) => b.every((v) => v === 0)));
});

test("exact byte hash and opaque dataset namespace precede any decoder/cache; stale cached content remains explicitly stale", async (t) => {
  const s = world(t),
    p = manifest(s.state.now),
    e = await s.validate(p),
    r = p.tiles[0];
  const verified = good(await s.model.verifyTile(e, r, new Uint8Array()));
  assert.equal(verified.hashVerified, true);
  assert.equal(verified.decodeApproved, false);
  assert.equal(verified.cacheApproved, false);
  assert.ok(
    verified.tileKey.startsWith(e.manifestDigest + "/fixture-dataset/v1/"),
  );
  bad(
    await s.model.verifyTile({ ...e }, r, new Uint8Array()),
    "INTEGRITY_FAILURE",
  );
  bad(
    await s.model.verifyTile(e, { ...r, sha256: H("1") }, new Uint8Array()),
    "INTEGRITY_FAILURE",
  );
  bad(await s.model.verifyTile(e, r, new Uint8Array([1])), "HASH_MISMATCH");
  for (const changed of [
    { decompressedBytes: MAP_LIMITS.decompressedBytes + 1 },
    { features: 100001 },
    { coordinates: 1000001 },
  ])
    bad(
      checkMapDecodeLimits({
        compressedBytes: 0,
        decompressedBytes: 0,
        features: 0,
        coordinates: 0,
        ...changed,
      }),
    );
  assert.equal(
    good(
      checkMapDecodeLimits({
        compressedBytes: 0,
        decompressedBytes: 0,
        features: 0,
        coordinates: 0,
      }),
    ).decodeApproved,
    false,
  );
  s.state.now = p.expiresAtMs;
  const stale = await s.validate(p);
  assert.equal(stale.stale, true);
});

test("bundle projection is the same fixed coarse rectangle without viewport/sensor inputs, under tile/byte limits and no private/direct fallback", async (t) => {
  const s = world(t),
    p = manifest(s.state.now),
    e = await s.validate(p),
    region = good(
      regionFor(
        {
          v: 1,
          latE6: 0,
          lonE6: 0,
          radiusM: 500,
          uncertaintyM: 510,
          epoch: "1".repeat(32),
          expiresAtMs: s.state.now + 900000,
        },
        s.state.now,
      ),
    );
  const first = good(await s.model.plan(e, region, 10, "offline-bundle")),
    second = good(
      await s.model.plan(e, structuredClone(region), 10, "offline-bundle"),
    );
  assert.deepEqual(first, second);
  assert.equal(first.tileCount, 4);
  assert.deepEqual(first.tiles.map((t) => `${t.x}/${t.y}`).sort(), [
    "511/511",
    "511/512",
    "512/511",
    "512/512",
  ]);
  assert.equal(first.networkExecutionAllowed, false);
  assert.equal(first.transportPolicyId, null);
  assert.equal(first.maxConcurrency, 2);
  assert.equal(first.deadlineMs, 60000);
  bad(
    await s.model.plan(e, region, 10, "strict-routed"),
    "ROUTING_UNSUPPORTED",
  );
  bad(
    await s.model.plan(e, region, 10, "consented-gateway"),
    "CONSENT_REVOKED",
  );
  const consentOwner = good(
    createLocationConsentController({
      isUserGesture: () => true,
      isForeground: () => true,
      isOwnerCurrent: () => s.state.current,
      wallNowMs: () => s.state.now,
      monotonicNowMs: () => 0,
      setTimer: () => 0,
      clearTimer: () => {},
    }),
  );
  t.after(() => consentOwner.dispose());
  const ex = good(
      consentOwner.explain({
        tradeHash: scope.tradeHash,
        recipientKey: scope.peerKey,
        radiusM: 500,
        collect: false,
        shareCoarse: false,
        mapFetch: true,
        directNetwork: false,
      }),
    ),
    consent = good(consentOwner.grant(ex));
  assert.equal(
    good(await s.model.plan(e, region, 10, "consented-gateway", consent))
      .consentGeneration,
    consent.generation,
  );
  consentOwner.revoke("hide");
  bad(
    await s.model.plan(e, region, 10, "consented-gateway", consent),
    "CONSENT_REVOKED",
  );
  const large = good(
    regionFor(
      {
        v: 1,
        latE6: 84900000,
        lonE6: 0,
        radiusM: 2000,
        uncertaintyM: 2010,
        epoch: "2".repeat(32),
        expiresAtMs: s.state.now + 900000,
      },
      s.state.now,
    ),
  );
  bad(await s.model.plan(e, large, 14, "offline-bundle"), "BUDGET_EXCEEDED");
  s.state.now = p.expiresAtMs;
  bad(await s.model.plan(e, region, 10, "offline-bundle"), "EXPIRED");
});

test("current owner checked after signing callback; nested work and late completion cannot mint or activate content", async (t) => {
  let model,
    armed = false,
    nested;
  const s = world(t, {
    isCurrent: () => {
      if (armed) model.close();
      return true;
    },
    lookup: () => ({
      id: "synthetic",
      parseSignature: (v) => v,
      verify: async () => {
        armed = true;
        return true;
      },
    }),
  });
  model = s.model;
  bad(
    await model.validate(good(encodeMapManifest(manifest(s.state.now)))),
    "LOCKED",
  );
  let other;
  const a = world(t, {
    lookup: () => ({
      id: "synthetic",
      parseSignature: (v) => v,
      verify: async () => {
        nested = other.validate(new Uint8Array());
        return true;
      },
    }),
  });
  other = a.model;
  await a.validate(manifest(a.state.now));
  bad(await nested, "CONFLICT");
});
test("audit regression: map consent revoked by a final clock or owner callback cannot publish a gateway projection", async (t) => {
  for (const how of ["clock", "owner"]) {
    let armed = false,
      calls = 0,
      consentOwner;
    const s = world(t, {
        nowMs: () => {
          if (armed && how === "clock" && ++calls === 2)
            consentOwner.revoke("hide");
          return s.state.now;
        },
        isCurrent: () => {
          if (armed && how === "owner" && ++calls === 9)
            consentOwner.revoke("hide");
          return true;
        },
      }),
      p = manifest(s.state.now),
      e = await s.validate(p),
      region = good(
        regionFor(
          {
            v: 1,
            latE6: 0,
            lonE6: 0,
            radiusM: 500,
            uncertaintyM: 510,
            epoch: "1".repeat(32),
            expiresAtMs: s.state.now + 900000,
          },
          s.state.now,
        ),
      );
    consentOwner = good(
      createLocationConsentController({
        isUserGesture: () => true,
        isForeground: () => true,
        isOwnerCurrent: () => true,
        wallNowMs: () => s.state.now,
        monotonicNowMs: () => 0,
        setTimer: () => 0,
        clearTimer: () => {},
      }),
    );
    t.after(() => consentOwner.dispose());
    const explanation = good(
        consentOwner.explain({
          tradeHash: scope.tradeHash,
          recipientKey: scope.peerKey,
          radiusM: 500,
          collect: false,
          shareCoarse: false,
          mapFetch: true,
          directNetwork: false,
        }),
      ),
      consent = good(consentOwner.grant(explanation));
    armed = true;
    bad(
      await s.model.plan(e, region, 10, "consented-gateway", consent),
      "CONSENT_REVOKED",
    );
  }
});
