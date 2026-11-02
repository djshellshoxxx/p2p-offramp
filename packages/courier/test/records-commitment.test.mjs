import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseCourierRecord,
  decodeCourierRecord,
  encodeCourierRecord,
} from "../src/records.ts";
import {
  containerCommitmentBytes,
  commitContainerOpening,
  verifyContainerOpening,
} from "../src/commitment.ts";
const H = (n) => n.repeat(64),
  profile = {
    id: "fixture-only-unqualified",
    parseKey: (v) => {
      if (typeof v !== "string" || !/^key-[a-z]+$/.test(v))
        throw Error("PRIVATE key");
      return v;
    },
    parseSignature: (v) => {
      if (typeof v !== "string" || !/^sig-[0-9a-f]+$/.test(v))
        throw Error("PRIVATE sig");
      return v;
    },
  };
const val = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const fail = (r, code = "MALFORMED") => {
  assert.equal(r.ok, false);
  assert.equal(r.code, code);
  assert.equal(JSON.stringify(r).includes("PRIVATE"), false);
};
const cap = () => ({
  shipmentId: H("1"),
  termsHash: H("2"),
  subject: "key-courier",
  role: "courier",
  actions: ["pickup"],
  legId: H("3"),
  generation: 1,
  notBefore: 100,
  expiresAt: 200,
  issuer: "key-seller",
});

test("strict detached canonical courier payloads reject unknown fields, getters, duplicate keys and unsupported role/profile data", () => {
  const raw = cap(),
    parsed = val(parseCourierRecord("capability", raw, profile));
  raw.actions.push("recover");
  assert.deepEqual(parsed.actions, ["pickup"]);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.actions));
  const bytes = val(encodeCourierRecord("capability", cap(), profile));
  assert.deepEqual(
    val(decodeCourierRecord("capability", bytes, profile)),
    parsed,
  );
  const duplicate = new TextEncoder().encode(
    new TextDecoder()
      .decode(bytes)
      .replace('"generation":1', '"generation":1,"generation":2'),
  );
  fail(decodeCourierRecord("capability", duplicate, profile));
  for (const changed of [
    { ...cap(), release: true },
    { ...cap(), actions: ["release"] },
    { ...cap(), actions: ["pickup", "pickup"] },
    { ...cap(), generation: Number.MAX_SAFE_INTEGER + 1 },
    { ...cap(), subject: "PRIVATE" },
    { ...cap(), expiresAt: 100 },
  ])
    fail(parseCourierRecord("capability", changed, profile));
  let touched = 0;
  const getter = cap();
  Object.defineProperty(getter, "subject", {
    enumerable: true,
    get() {
      touched++;
      return "PRIVATE";
    },
  });
  fail(parseCourierRecord("capability", getter, profile));
  assert.equal(touched, 0);
  fail(
    decodeCourierRecord("capability", new Uint8Array(16 * 1024 + 1), profile),
  );
});

test("protocol time windows, human inspection, private route and receipt claim bounds are structural rather than physical proof", () => {
  const window = {
    reservationId: "r",
    credentialId: H("1"),
    subject: "key-courier",
    notBefore: 100,
    expiresAt: 200,
    maxClockError: 30,
    maxUses: 1,
    issuer: "key-seller",
    revocationEpoch: 1,
    offlineAllowed: false,
  };
  val(parseCourierRecord("window", window, profile));
  fail(parseCourierRecord("window", { ...window, expiresAt: 3701 }, profile));
  fail(parseCourierRecord("window", { ...window, maxClockError: 31 }, profile));
  fail(
    parseCourierRecord("window", { ...window, offlineAllowed: true }, profile),
    "UNSUPPORTED_PROFILE",
  );
  const inspection = {
    shipmentId: H("1"),
    containerId: H("2"),
    legId: H("3"),
    observer: "key-courier",
    sealId: "S1",
    condition: "intactClaimed",
    observedAt: 100,
    priorInspection: null,
    evidenceHashes: [],
    source: "human",
    deviceProfile: null,
  };
  val(parseCourierRecord("inspection", inspection, profile));
  fail(
    parseCourierRecord(
      "inspection",
      { ...inspection, sealId: "S1\n" },
      profile,
    ),
  );
  fail(
    parseCourierRecord(
      "inspection",
      { ...inspection, source: "reviewedDevice" },
      profile,
    ),
    "UNSUPPORTED_PROFILE",
  );
});

test("container preimage and SHA256 match independent fixed Python fixture; fields and opening scope cannot be substituted", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("fixtures/container-python-v1.json", import.meta.url),
      "utf8",
    ),
  );
  const bytes = val(containerCommitmentBytes(fixture.opening));
  assert.equal(Buffer.from(bytes).toString("hex"), fixture.preimageHex);
  bytes.fill(0);
  assert.equal(
    val(await commitContainerOpening(fixture.opening)),
    fixture.sha256,
  );
  const expected = {
    shipmentId: fixture.opening.shipmentId,
    containerId: fixture.opening.containerId,
    generation: fixture.opening.generation,
    commitment: fixture.sha256,
  };
  assert.equal(
    val(await verifyContainerOpening(fixture.opening, expected)),
    "match",
  );
  for (const changed of [
    { shipmentId: H("3") },
    { containerId: H("4") },
    { generation: 2 },
    { secret: H("5") },
  ])
    assert.equal(
      val(
        await verifyContainerOpening(
          { ...fixture.opening, ...changed },
          expected,
        ),
      ),
      "mismatch",
    );
  fail(await commitContainerOpening({ ...fixture.opening, secret: "00" }));
  fail(containerCommitmentBytes({ ...fixture.opening, generation: -1 }));
});
