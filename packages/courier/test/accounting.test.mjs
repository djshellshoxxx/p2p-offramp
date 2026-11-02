import test from "node:test";
import assert from "node:assert/strict";
import {
  createFeeModel,
  createStakeModel,
  projectCooperativeDeduction,
} from "../src/accounting.ts";
import { fixture, H, context, profile, signs } from "./support/fixtures.mjs";
const val = (r) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  },
  fail = (r, c) => {
    assert.equal(r.ok, false);
    if (c) assert.equal(r.code, c);
  };
const schedule = () => ({
  shipmentId: context.shipmentId,
  assetId: "fixture-token",
  payer: "key-payer",
  total: "100",
  pickupFee: "30",
  deliveryFee: "70",
  cancellationFee: "10",
  refundTo: "prebound-payer",
  payTo: "prebound-courier",
  policyHash: H("4"),
});
const allocation = (id, earned, refunded, pending) => ({
  allocationId: H(id),
  earned,
  refunded,
  pending,
  basis: "cooperative",
});
async function fee() {
  let time = 100,
    picked = false;
  const f = fixture({ requiredSigners: () => ["key-payer", "key-courier"] });
  const signed = signs("key-payer", "key-courier");
  const proof = val(
    await f.verifier.verify("fee-schedule", schedule(), signed),
  );
  const model = val(
    createFeeModel({
      verifier: f.verifier,
      schedule: proof,
      courier: "key-courier",
      resolveBy: 600,
      nowSeconds: () => time,
      isPickedUp: () => picked,
    }),
  );
  return {
    ...f,
    model,
    signed,
    setTime: (t) => (time = t),
    setPicked: (p) => (picked = p),
  };
}
test("fee consent, policy and one-time allocation preserve exact total and exclude trade principal", async () => {
  const f = await fee();
  const p = val(
    await f.verifier.verify(
      "fee-allocation",
      allocation("5", "30", "70", "0"),
      f.signed,
    ),
  );
  fail(
    f.model.allocate(0, H("4"), p),
    "UNAUTHORIZED",
    "pickup cancellation cannot charge30when signedcap10",
  );
  f.setPicked(true);
  const v = val(f.model.allocate(0, H("4"), p));
  assert.equal(v.earned, "30");
  assert.equal(v.refunded, "70");
  assert.equal(v.pending, "0");
  assert.equal(v.economicAuthority, false);
  fail(f.model.allocate(1, H("4"), p), "CONFLICT");
  fail(f.model.timeout(1), "EXPIRED");
  const excess = val(
    await f.verifier.verify(
      "fee-allocation",
      allocation("6", "101", "0", "0"),
      f.signed,
    ),
  );
  fail(f.model.allocate(1, H("4"), excess), "CONFLICT");
});
test("no-response financial timeout is a local projection, not guilt or physical settlement", async () => {
  const f = await fee();
  fail(f.model.timeout(0), "EXPIRED");
  f.setTime(600);
  const v = val(f.model.timeout(0));
  assert.equal(v.refunded, "100");
  assert.equal(v.basis, "timeoutRefund");
  assert.equal(v.physicalContentsVerified, false);
  fail(f.model.timeout(1), "CONFLICT");
});
test("untrusted/one-sided/revoked claims and changed policy cannot allocate fees", async () => {
  const f = await fee();
  const raw = allocation("5", "0", "100", "0");
  fail(
    f.model.allocate(0, H("4"), { kind: "fee-allocation", body: raw }),
    "UNAUTHORIZED",
  );
  const one = val(
    await f.verifier.verify("fee-allocation", raw, signs("key-payer")),
  );
  fail(f.model.allocate(0, H("4"), one), "UNAUTHORIZED");
  const both = val(await f.verifier.verify("fee-allocation", raw, f.signed));
  fail(f.model.allocate(0, H("6"), both), "UNAUTHORIZED");
  f.revoke();
  fail(f.model.allocate(0, H("4"), both), "LOCKED");
});
const position = () => ({
  vaultId: "optional-fixture-vault",
  courier: "key-courier",
  assetId: "test",
  deposited: "100",
  reserved: "0",
  unbonding: "0",
  withdrawable: "100",
});
const reservation = (id, amount = "70") => ({
  reservationId: H(id),
  shipmentId: context.shipmentId,
  amount,
  policyHash: H("4"),
  resolveBy: 600,
  state: "active",
});
test("stake local revisions make two70from100reservations and duplicate release fail without creating solvency proof", () => {
  const m = val(createStakeModel(position(), profile));
  const first = val(m.reserve(0, reservation("5")));
  assert.equal(first.reserved, "70");
  assert.equal(first.withdrawable, "30");
  assert.equal(first.economicAuthority, false);
  fail(m.reserve(0, reservation("6")), "STALE_REVISION");
  fail(m.reserve(1, reservation("6")), "CONFLICT");
  fail(m.beginUnbond(1, "31"), "CONFLICT");
  fail(m.release(1, H("5"), 599), "EXPIRED");
  const released = val(m.release(1, H("5"), 600));
  assert.equal(released.withdrawable, "100");
  fail(m.release(2, H("5"), 600), "CONFLICT");
  const unbonded = val(m.beginUnbond(2, "100"));
  assert.equal(unbonded.unbonding, "100");
  assert.equal(
    BigInt(unbonded.reserved) +
      BigInt(unbonded.unbonding) +
      BigInt(unbonded.withdrawable),
    BigInt(unbonded.deposited),
  );
  fail(
    createStakeModel({ ...position(), deposited: "90" }, profile),
    "CONFLICT",
  );
});
test("checked78digit arithmetic cannot wrap; missing actualreservationrecords never imply an available balance", () => {
  fail(
    createStakeModel(
      { ...position(), reserved: "1", withdrawable: "99" },
      profile,
    ),
    "MISSING_DEPENDENCY",
  );
  const max = "9".repeat(78),
    m = val(
      createStakeModel(
        { ...position(), deposited: max, withdrawable: max },
        profile,
      ),
    );
  val(m.reserve(0, reservation("5", max)));
  fail(m.reserve(1, reservation("6", "1")), "CONFLICT");
  fail(
    createStakeModel(
      { ...position(), deposited: "1" + "0".repeat(78) },
      profile,
    ),
    "MALFORMED",
  );
});
test("cooperative deduction quote enforces signers, immutable policy/beneficiary, appeal and reserve bounds; tribunal stays disabled", async () => {
  const f = fixture({ requiredSigners: () => ["key-payer", "key-courier"] }),
    d = {
      decisionId: H("7"),
      reservationId: H("5"),
      policyHash: H("4"),
      amount: "20",
      beneficiary: "prebound-beneficiary",
      basis: "cooperative",
      evidenceRoot: H("8"),
      issuedAt: 100,
      appealUntil: 200,
      finalAfter: 300,
    };
  const evaluate = async (value) =>
    projectCooperativeDeduction({
      verifier: f.verifier,
      decision: val(
        await f.verifier.verify(
          "deduction",
          value,
          signs("key-payer", "key-courier"),
        ),
      ),
      courier: "key-courier",
      payer: "key-payer",
      reservation: reservation("5", "50"),
      beneficiary: "prebound-beneficiary",
      nowSeconds: 300,
    });
  const projected = val(await evaluate(d));
  assert.equal(projected.deducted, "20");
  assert.equal(projected.remaining, "30");
  assert.equal(projected.nativeExecutionAllowed, false);
  fail(await evaluate({ ...d, basis: "optInTribunal" }), "UNAUTHORIZED");
  fail(await evaluate({ ...d, amount: "51" }), "CONFLICT");
  fail(await evaluate({ ...d, beneficiary: "attacker" }), "UNAUTHORIZED");
  fail(await evaluate({ ...d, finalAfter: 301 }), "EXPIRED");
});

test("audit regression: reservation Proxy callbacks cannot reenter any stake method or consume the outer revision", () => {
  const model = val(
    createStakeModel(
      {
        vaultId: "fixture",
        courier: "key-courier",
        assetId: "native",
        deposited: "100",
        reserved: "0",
        unbonding: "0",
        withdrawable: "100",
      },
      profile,
    ),
  );
  const raw = {
    reservationId: H("4"),
    shipmentId: context.shipmentId,
    amount: "70",
    policyHash: H("3"),
    resolveBy: 600,
    state: "active",
  };
  let nested,
    once = false;
  const proxy = new Proxy(raw, {
    ownKeys(target) {
      if (!once) {
        once = true;
        nested = [
          model.beginUnbond(0, "10"),
          model.reserve(0, raw),
          model.release(0, H("4"), 600),
          model.inspect(),
        ];
      }
      return Reflect.ownKeys(target);
    },
  });
  const result = val(model.reserve(0, proxy));
  for (const refused of nested) fail(refused, "CONFLICT");
  assert.equal(result.revision, 1);
  assert.equal(result.reserved, "70");
  assert.equal(result.withdrawable, "30");
  assert.equal(result.unbonding, "0");
});
