import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { EncryptedVaultService } from "../../../storage/index.ts";
export const H = (c) => c.repeat(64),
  good = (r) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  },
  bad = (r, code) => {
    assert.equal(r.ok, false);
    if (code) assert.equal(r.error.code, code);
  };
export const scope = {
  binding: {
    chain: "evm",
    networkId: "local",
    deploymentId: "optional-meetup-fixture",
    tradeId: H("1"),
  },
  tradeHash: H("1"),
  termsHash: H("2"),
  accountKey: H("3"),
  peerKey: H("4"),
};
export class Store {
  rows = new Map();
  beforeWrite;
  afterWrite;
  writes = 0;
  async get(id) {
    return structuredClone(this.rows.get(id));
  }
  async add(row, options) {
    options?.assertCurrent?.();
    this.rows.set(row.profileId, structuredClone(row));
    this.writes++;
  }
  async compareAndSwap(old, next, options) {
    await this.beforeWrite?.();
    options?.assertCurrent?.();
    if (
      options?.signal?.aborted ||
      JSON.stringify(this.rows.get(old.profileId)) !== JSON.stringify(old)
    )
      throw Error("fixture encrypted store refused");
    this.rows.set(next.profileId, structuredClone(next));
    this.writes++;
    this.afterWrite?.();
  }
  subscribeInvalidation() {
    return () => {};
  }
}
export async function vaultFixture(t) {
  const store = new Store(),
    vault = new EncryptedVaultService(store, webcrypto, { lifecycle: false }),
    session = good(await vault.create("meetup local synthetic policy fixture")),
    state = { current: true, now: 1700000000000, checked: 1700000000000 },
    persistence = {
      vault,
      session,
      recordId: "a".repeat(32),
      isStorageCurrent: () => state.current,
    };
  t.after(() => vault.dispose());
  return { store, vault, session, state, persistence };
}
