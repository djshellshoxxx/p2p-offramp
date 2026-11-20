import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCourierVerifier } from "../../src/verification.ts";
export const H = (n) => n.repeat(64);
export const profile = {
  id: "synthetic-unqualified-profile",
  parseKey: (v) => {
    if (!/^key-[a-z]+$/.test(v)) throw Error("PRIVATE");
    return v;
  },
  parseSignature: (v) => {
    if (!/^sig-[a-z]+$/.test(v)) throw Error("PRIVATE");
    return v;
  },
};
export const context = {
  binding: {
    chain: "evm",
    networkId: "local",
    deploymentId: "optional-courier-fixture",
    tradeId: H("1"),
  },
  shipmentId: H("2"),
  termsHash: H("3"),
};
export const handshake = () => ({
  shipmentId: context.shipmentId,
  termsHash: context.termsHash,
  revision: 0,
  seller: "key-seller",
  buyer: "key-buyer",
  courier: "key-courier",
  state: "proposed",
  pickupBy: 200,
  deliveryBy: 400,
  resolveBy: 600,
  receiptHead: null,
});
const val = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
export function fixture(over = {}) {
  let current = true;
  const buffers = [];
  const options = {
    profile,
    context,
    isCurrent: () => current,
    digest: async (r) => {
      buffers.push(r.canonicalPayload);
      return createHash("sha256").update(r.canonicalPayload).digest("hex");
    },
    verify: async (r) => {
      buffers.push(r.canonicalPayload);
      return r.signature === "sig-valid";
    },
    requiredSigners: () => ["key-seller", "key-buyer", "key-courier"],
    ...over,
  };
  return {
    verifier: val(createCourierVerifier(options)),
    buffers,
    revoke() {
      current = false;
    },
  };
}
export const signs = (...keys) =>
  keys.map((signer) => ({ signer, signature: "sig-valid" }));
