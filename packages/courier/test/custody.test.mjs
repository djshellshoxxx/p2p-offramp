import test from "node:test";
import assert from "node:assert/strict";
import {
  createCustodyModel,
  createRecoveryModel,
  authorizeRouteFields,
} from "../src/custody.ts";
import { createHandoffChallenge } from "../src/challenge.ts";
import {
  fixture,
  H,
  context,
  profile,
  handshake,
  signs,
} from "./support/fixtures.mjs";
const val = (r) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  },
  fail = (r, c) => {
    assert.equal(r.ok, false);
    if (c) assert.equal(r.code, c);
  };
function world() {
  let at = 100,
    actor = "key-courier";
  const f = fixture({
    requiredSigners: (kind, r) =>
      kind === "handshake"
        ? ["key-seller", "key-buyer", "key-courier"]
        : kind === "capability"
          ? ["key-seller"]
          : kind === "challenge" || kind === "receipt"
            ? [r.giver, r.taker]
            : ["key-seller", "key-courier"],
  });
  const model = val(
    createCustodyModel({
      verifier: f.verifier,
      proposal: handshake(),
      legId: H("4"),
      containerCommitment: H("5"),
      generation: 1,
      knownCustodians: ["key-seller", "key-buyer", "key-courier", "key-peer"],
      nowSeconds: () => at,
      actor: () => actor,
    }),
  );
  return {
    ...f,
    model,
    setTime: (t) => (at = t),
    setActor: (k) => (actor = k),
  };
}
async function accept(w) {
  return val(
    await w.verifier.verify(
      "handshake",
      handshake(),
      signs("key-seller", "key-buyer", "key-courier"),
    ),
  );
}
const capability = (generation = 1) => ({
  shipmentId: context.shipmentId,
  termsHash: context.termsHash,
  subject: "key-courier",
  role: "courier",
  actions: ["pickup"],
  legId: H("4"),
  generation,
  notBefore: 100,
  expiresAt: 200,
  issuer: "key-seller",
});
async function pickup(w) {
  val(w.model.accept(0, await accept(w)));
  const cap = val(
    await w.verifier.verify("capability", capability(), signs("key-seller")),
  );
  return val(w.model.beginPickup(1, cap));
}
async function receipt(
  w,
  {
    giver = "key-seller",
    taker = "key-courier",
    head = null,
    id = "6",
    at = 110,
    oneSided = false,
  } = {},
) {
  const challenge = {
    challengeId: H(id),
    shipmentId: context.shipmentId,
    legId: H("4"),
    giver,
    taker,
    receiptHead: head,
    nonce: H("9"),
    issuedAt: at - 10,
    expiresAt: at + 100,
  };
  const proof = val(
    await w.verifier.verify("challenge", challenge, signs(giver, taker)),
  );
  const body = {
    version: 1,
    shipmentId: context.shipmentId,
    legId: H("4"),
    challengeHash: proof.hash,
    predecessor: head,
    giver,
    taker,
    containerCommitment: H("5"),
    inspectionHashes: [],
    observedAt: at,
    claim: "containerTransferred",
    contents: "countClaimed",
    declaredCurrency: "USD",
    declaredMinorUnits: "10000",
  };
  return {
    challenge: proof,
    receipt: val(
      await w.verifier.verify(
        "receipt",
        body,
        signs(...(oneSided ? [giver] : [giver, taker])),
      ),
    ),
  };
}
test("matched three-party consent and two-party fresh challenge/receipt progress custody as attributed claims only", async () => {
  const w = world();
  await pickup(w);
  const first = await receipt(w);
  w.setTime(110);
  const v = val(w.model.recordReceipt(2, first.receipt, first.challenge));
  assert.equal(v.state, "inCustody");
  assert.equal(v.economicAuthority, false);
  assert.equal(v.physicalContentsVerified, false);
  const last = await receipt(w, {
    giver: "key-courier",
    taker: "key-buyer",
    head: v.receiptHead,
    id: "7",
    at: 401,
  });
  w.setTime(401);
  const done = val(w.model.recordReceipt(3, last.receipt, last.challenge));
  assert.equal(done.state, "deliveredClaimed");
  assert.equal(done.lateDeliveryClaim, true);
  fail(w.model.recordReceipt(4, last.receipt, last.challenge), "CONFLICT");
});
test("one-sided or conflicting receipts preserve candidate custodians and never reset a claimed pickup", async () => {
  const w = world();
  await pickup(w);
  const a = await receipt(w);
  w.setTime(110);
  val(w.model.recordReceipt(2, a.receipt, a.challenge));
  const fork = await receipt(w, { taker: "key-peer", id: "8" });
  const conflict = val(w.model.recordReceipt(3, fork.receipt, fork.challenge));
  assert.equal(conflict.state, "ambiguous");
  assert.equal(conflict.receiptCandidates.length, 2);
  assert.ok(conflict.candidateCustodians.includes("key-peer"));
  w.setActor("key-buyer");
  const cancelled = val(w.model.cancel(4));
  assert.equal(cancelled.state, "ambiguous");
  assert.equal(cancelled.receiptCandidates.length, 2);
  const b = world();
  await pickup(b);
  const half = await receipt(b, { oneSided: true });
  b.setTime(110);
  assert.equal(
    val(b.model.recordReceipt(2, half.receipt, half.challenge)).state,
    "ambiguous",
  );
});
test("capability roles, generation, actor, challenge expiry, foreign hashes and stale revisions fail closed", async () => {
  const w = world();
  val(w.model.accept(0, await accept(w)));
  val(w.model.revokeCapabilities(1));
  const old = val(
    await w.verifier.verify("capability", capability(), signs("key-seller")),
  );
  fail(w.model.beginPickup(2, old), "UNAUTHORIZED");
  const cap = val(
    await w.verifier.verify("capability", capability(2), signs("key-seller")),
  );
  w.setActor("key-buyer");
  fail(w.model.beginPickup(2, cap), "UNAUTHORIZED");
  w.setActor("key-courier");
  val(w.model.beginPickup(2, cap));
  const r = await receipt(w);
  w.setTime(210);
  fail(w.model.recordReceipt(3, r.receipt, r.challenge), "EXPIRED");
  fail(w.model.recordReceipt(2, r.receipt, r.challenge), "STALE_REVISION");
  fail(w.model.recordReceipt(3, { ...r.receipt }, r.challenge), "UNAUTHORIZED");
  w.revoke();
  fail(w.model.inspect(), "LOCKED");
});
test("native challenge generation uses full random nonces; failure refuses rather than timestamp fallback", () => {
  const input = {
    shipmentId: context.shipmentId,
    legId: H("4"),
    giver: "key-seller",
    taker: "key-courier",
    receiptHead: null,
    issuedAt: 100,
    expiresAt: 200,
  };
  const a = val(createHandoffChallenge(input, profile)),
    b = val(createHandoffChallenge(input, profile));
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.challengeId, b.challengeId);
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  let buffer;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues(bytes) {
          buffer = bytes;
          bytes.fill(7);
          throw Error("PRIVATE");
        },
      },
    });
    fail(createHandoffChallenge(input, profile), "UNAVAILABLE");
    assert.ok(buffer.every((n) => n === 0));
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});
test("G32 response and resolve bounds preserve unknown physical custody after financial timeout; reminders are bounded", async () => {
  let at = 100;
  const f = fixture({ requiredSigners: () => ["key-courier", "key-buyer"] });
  const body = {
    caseId: H("a"),
    shipmentId: context.shipmentId,
    termsHash: context.termsHash,
    cause: "missingAck",
    openedAt: 100,
    responseBy: 3700,
    resolveBy: 10000,
    receiptHeads: [H("b")],
    outcome: "open",
  };
  const opened = val(
      await f.verifier.verify(
        "recovery",
        body,
        signs("key-courier", "key-buyer"),
      ),
    ),
    m = val(
      createRecoveryModel({
        verifier: f.verifier,
        opened,
        affectedParticipants: ["key-courier", "key-buyer"],
        nowSeconds: () => at,
      }),
    );
  for (let i = 0; i < 3; i++) val(m.remind(i));
  fail(m.remind(3), "LIMIT_EXCEEDED");
  at = 3700;
  assert.equal(val(m.tick(3)).phase, "cooperative-recovery");
  at = 10000;
  const timed = val(m.tick(4));
  assert.equal(timed.outcome, "unresolvedPhysical");
  assert.equal(timed.financialTimeoutDue, true);
  assert.equal(timed.economicAuthority, false);
  const late = val(
    await f.verifier.verify(
      "recovery",
      { ...body, outcome: "cooperativeReturn" },
      signs("key-courier", "key-buyer"),
    ),
  );
  assert.equal(val(m.agree(5, late)).outcome, "cooperativeReturn");
  assert.equal(
    val(m.inspect()).financialTimeoutDue,
    true,
    "later claim cannot reverse financial cutoff",
  );
});
test("route access grants only named fields for exact recipient/leg/consent/purpose; no private field values are returned", async () => {
  const f = fixture({ requiredSigners: () => ["key-seller"] }),
    body = {
      grantId: H("a"),
      shipmentAlias: H("b"),
      legId: H("4"),
      recipient: "key-courier",
      fields: ["pickup", "dropoff"],
      purpose: "assignment",
      expiresAt: 200,
      consentRevision: 4,
    };
  const grant = val(
      await f.verifier.verify("disclosure", body, signs("key-seller")),
    ),
    options = {
      verifier: f.verifier,
      grant,
      recipient: "key-courier",
      legId: H("4"),
      purpose: "assignment",
      consentRevision: 4,
      accepted: true,
      requested: ["pickup"],
      nowSeconds: 100,
    };
  assert.deepEqual(val(authorizeRouteFields(options)).fields, ["pickup"]);
  for (const changed of [
    { legId: H("5") },
    { consentRevision: 3 },
    { purpose: "recovery" },
    { recipient: "key-peer" },
    { accepted: false },
    { requested: ["recoveryContact"] },
  ])
    fail(authorizeRouteFields({ ...options, ...changed }), "UNAUTHORIZED");
  fail(authorizeRouteFields({ ...options, nowSeconds: 200 }), "EXPIRED");
});
test("swapped challenge nonce/head or untrusted local clock cannot authenticate a handoff, and a timed out recovery never rolls back", async () => {
  const w = world();
  await pickup(w);
  const r = await receipt(w);
  w.setTime(110);
  const changed = {
    challengeId: H("6"),
    shipmentId: context.shipmentId,
    legId: H("4"),
    giver: "key-seller",
    taker: "key-courier",
    receiptHead: null,
    nonce: H("8"),
    issuedAt: 100,
    expiresAt: 210,
  };
  const other = val(
    await w.verifier.verify(
      "challenge",
      changed,
      signs("key-seller", "key-courier"),
    ),
  );
  fail(w.model.recordReceipt(2, r.receipt, other), "UNAUTHORIZED");
  w.setTime(NaN);
  fail(w.model.recordReceipt(2, r.receipt, r.challenge), "CLOCK_UNCERTAIN");
  w.setTime(110);
  val(w.model.recordReceipt(2, r.receipt, r.challenge));
  let at = 10000;
  const f = fixture({ requiredSigners: () => ["key-courier", "key-buyer"] }),
    body = {
      caseId: H("a"),
      shipmentId: context.shipmentId,
      termsHash: context.termsHash,
      cause: "missingAck",
      openedAt: 100,
      responseBy: 3700,
      resolveBy: 10000,
      receiptHeads: [H("b")],
      outcome: "open",
    };
  const opened = val(
      await f.verifier.verify(
        "recovery",
        body,
        signs("key-courier", "key-buyer"),
      ),
    ),
    model = val(
      createRecoveryModel({
        verifier: f.verifier,
        opened,
        affectedParticipants: ["key-courier", "key-buyer"],
        nowSeconds: () => at,
      }),
    );
  assert.equal(val(model.tick(0)).financialTimeoutDue, true);
  at = 5000;
  fail(model.tick(1), "CLOCK_UNCERTAIN");
  assert.equal(val(model.inspect()).financialTimeoutDue, true);
});

test("audit regression: cooperation first observed at resolveBy records financial timeout without requiring a prior tick", async () => {
  const f = fixture({ requiredSigners: () => ["key-courier", "key-buyer"] }),
    body = {
      caseId: H("a"),
      shipmentId: context.shipmentId,
      termsHash: context.termsHash,
      cause: "missingAck",
      openedAt: 100,
      responseBy: 3700,
      resolveBy: 10000,
      receiptHeads: [H("b")],
      outcome: "open",
    };
  const opened = val(
      await f.verifier.verify(
        "recovery",
        body,
        signs("key-courier", "key-buyer"),
      ),
    ),
    model = val(
      createRecoveryModel({
        verifier: f.verifier,
        opened,
        affectedParticipants: ["key-courier", "key-buyer"],
        nowSeconds: () => 10000,
      }),
    ),
    late = val(
      await f.verifier.verify(
        "recovery",
        { ...body, outcome: "cooperativeReturn" },
        signs("key-courier", "key-buyer"),
      ),
    );
  const view = val(model.agree(0, late));
  assert.equal(view.phase, "timed-out");
  assert.equal(view.financialTimeoutDue, true);
  assert.equal(view.outcome, "cooperativeReturn");
  assert.equal(view.economicAuthority, false);
});
