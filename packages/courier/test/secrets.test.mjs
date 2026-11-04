import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { EncryptedVaultService } from "../../storage/index.ts";
import { createContainerSecrets } from "../src/secrets.ts";
import { commitContainerOpening } from "../src/commitment.ts";
import { fixture, H, context, signs } from "./support/fixtures.mjs";

const good = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const bad = (r, code) => {
  assert.equal(r.ok, false, "secret operation unexpectedly succeeded");
  if (code) assert.equal(r.code, code);
};
class Store {
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
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.();
    options?.assertCurrent?.();
    if (
      options?.signal?.aborted ||
      JSON.stringify(this.rows.get(expected.profileId)) !==
        JSON.stringify(expected)
    )
      throw Error("opaque local store refusal");
    this.rows.set(next.profileId, structuredClone(next));
    this.writes++;
    this.afterWrite?.();
  }
  subscribeInvalidation() {
    return () => {};
  }
}
async function setup(t, over = {}) {
  const store = new Store(),
    vault = new EncryptedVaultService(store, webcrypto, { lifecycle: false });
  const session = good(
    await vault.create("courier fixture only local passphrase"),
  );
  const f = fixture({ requiredSigners: () => ["key-seller"] }),
    state = { current: true, custody: false, published: true, now: 100 };
  const options = {
    vault,
    session,
    recordId: "a".repeat(32),
    verifier: f.verifier,
    containerId: H("5"),
    creator: "key-seller",
    generationFloor: 0,
    isOwnerCurrent: () => state.current,
    isInCustody: () => state.custody,
    nowSeconds: () => state.now,
    confirmPublished: () => state.published,
    ...over,
  };
  const service = good(createContainerSecrets(options));
  t.after(() => {
    service.close();
    f.verifier.close();
    vault.dispose();
  });
  const publication = async (view) =>
    good(
      await f.verifier.verify(
        "commitment",
        {
          version: 1,
          shipmentId: context.shipmentId,
          containerId: H("5"),
          generation: view.generation,
          commitment: view.commitment,
          creator: "key-seller",
          publishedAt: 100,
        },
        signs("key-seller"),
      ),
    );
  return { store, vault, session, f, state, service, options, publication };
}

test("native random secret is encrypted before publication and explicit reveal is logged before returning purpose-owned bytes", async (t) => {
  const s = await setup(t);
  assert.equal(good(await s.service.inspect()), null);
  const view = good(await s.service.provision(["key-courier"], 1000));
  assert.equal(view.generation, 1);
  assert.equal(view.state, "provisioned");
  assert.equal(view.physicalContentsVerified, false);
  const proof = await s.publication(view),
    writes = s.store.writes;
  bad(await s.service.reveal("key-buyer", proof), "UNAUTHORIZED");
  bad(await s.service.reveal("key-courier", { ...proof }), "UNAUTHORIZED");
  assert.equal(s.store.writes, writes);
  s.state.published = false;
  bad(await s.service.reveal("key-courier", proof), "MISSING_DEPENDENCY");
  s.state.published = true;
  const bytes = good(await s.service.reveal("key-courier", proof));
  assert.equal(bytes.byteLength, 32);
  assert.ok(bytes.some((v) => v !== 0));
  const secret = Buffer.from(bytes).toString("hex");
  assert.equal(
    good(
      await commitContainerOpening({
        shipmentId: context.shipmentId,
        containerId: H("5"),
        generation: 1,
        secret,
      }),
    ),
    view.commitment,
  );
  assert.equal(s.store.writes, writes + 1);
  const row = good(await s.vault.read(s.session.sessionId, s.options.recordId));
  const ledger = JSON.parse(Buffer.from(row.payload, "base64url"));
  assert.equal(ledger.entries[0].secret, secret);
  assert.equal(ledger.entries[0].state, "disclosed");
  assert.deepEqual(ledger.reveals, [
    { generation: 1, reader: "key-courier", at: 100 },
  ]);
  assert.ok(!JSON.stringify([...s.store.rows.values()]).includes(secret));
  assert.ok(!JSON.stringify([...s.store.rows.values()]).includes(row.payload));
  assert.ok(!JSON.stringify(view).includes(secret));
  s.service.release(bytes);
  assert.ok(bytes.every((v) => v === 0));
  const again = good(await s.service.reveal("key-courier", proof));
  s.vault.lock(s.session.sessionId);
  assert.ok(again.every((v) => v === 0));
  bad(await s.service.inspect(), "LOCKED");
});

test("lock during a pending reveal commit suppresses plaintext, aborts the owner and never reports disclosure success", async (t) => {
  const s = await setup(t),
    view = good(await s.service.provision(["key-courier"], 1000)),
    proof = await s.publication(view);
  let resume, entered;
  const ready = new Promise((done) => {
    entered = done;
  });
  s.store.beforeWrite = () => {
    entered();
    return new Promise((done) => {
      resume = done;
    });
  };
  const pending = s.service.reveal("key-courier", proof);
  await ready;
  s.vault.lockAll();
  resume();
  bad(await pending);
  assert.equal(s.store.writes, 2);
  bad(await s.service.reveal("key-courier", proof), "LOCKED");
});

test("generation floor, canonical owner, custody and history bounds prevent silent stale or active replacement", async (t) => {
  const s = await setup(t),
    first = good(await s.service.provision(["key-courier"], 1000));
  bad(await s.service.provision(["key-courier"], 1000), "CONFLICT");
  const stale = good(
    createContainerSecrets({ ...s.options, generationFloor: 2 }),
  );
  bad(await stale.inspect(), "CONFLICT");
  stale.close();
  const missing = good(
    createContainerSecrets({
      ...s.options,
      recordId: "b".repeat(32),
      generationFloor: 1,
    }),
  );
  bad(await missing.inspect(), "MISSING_DEPENDENCY");
  missing.close();
  good(await s.service.reportCompromise());
  bad(
    await s.service.reveal("key-courier", await s.publication(first)),
    "UNAVAILABLE",
  );
  good(await s.service.retire());
  s.state.custody = true;
  bad(await s.service.provision(["key-courier"], 1000), "CONFLICT");
  s.state.custody = false;
  for (let generation = 2; generation <= 16; generation++) {
    assert.equal(
      good(await s.service.provision(["key-courier"], 1000)).generation,
      generation,
    );
    good(await s.service.retire());
  }
  bad(await s.service.provision(["key-courier"], 1000), "LIMIT_EXCEEDED");
  const row = good(await s.vault.read(s.session.sessionId, s.options.recordId)),
    ledger = JSON.parse(Buffer.from(row.payload, "base64url"));
  assert.equal(ledger.entries.length, 16);
  assert.ok(
    ledger.entries.every((e) => e.secret === null && e.state === "retired"),
  );
  s.state.current = false;
  bad(await s.service.inspect(), "LOCKED");
  s.state.current = true;
  bad(await s.service.inspect(), "LOCKED");
});

test("unavailable entropy writes nothing; expiry, compromise and closing zero all retained reveal buffers", async (t) => {
  const s = await setup(t),
    descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto"),
    writes = s.store.writes;
  try {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues() {
          throw Error("private RNG diagnostic");
        },
      },
      configurable: true,
    });
    bad(await s.service.provision(["key-courier"], 1000), "UNAVAILABLE");
    assert.equal(s.store.writes, writes);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
  const view = good(
      await s.service.provision(["key-courier", "key-buyer"], 101),
    ),
    proof = await s.publication(view);
  const one = good(await s.service.reveal("key-courier", proof)),
    two = good(await s.service.reveal("key-buyer", proof));
  s.state.now = 101;
  bad(await s.service.reveal("key-courier", proof), "EXPIRED");
  assert.ok(one.every((v) => v === 0) && two.every((v) => v === 0));
  s.state.now = 102;
  good(await s.service.reportCompromise());
  assert.equal(good(await s.service.inspect()).state, "compromised");
});

test("owner callback reentry cannot start a second vault operation and revocation cannot return a secret", async (t) => {
  let service, attempt;
  const s = await setup(t, {
    isOwnerCurrent: () => {
      if (service && !attempt) attempt = service.inspect();
      return true;
    },
  });
  service = s.service;
  good(await service.provision(["key-courier"], 1000));
  bad(await attempt, "CONFLICT");
  const view = good(await service.inspect()),
    proof = await s.publication(view),
    buffer = good(await service.reveal("key-courier", proof));
  service.close();
  assert.ok(buffer.every((v) => v === 0));
  bad(await service.reveal("key-courier", proof), "LOCKED");
});

test("an authenticated private slot with a substituted opening is rejected instead of disclosing bytes for a different commitment", async (t) => {
  const s = await setup(t),
    view = good(await s.service.provision(["key-courier"], 1000)),
    proof = await s.publication(view),
    row = good(await s.vault.read(s.session.sessionId, s.options.recordId));
  const ledger = JSON.parse(Buffer.from(row.payload, "base64url"));
  ledger.entries[0].secret = "0".repeat(64);
  const lease = good(s.vault.captureSession(s.session, () => {})),
    revision = lease.current().revision;
  lease.dispose();
  good(
    await s.vault.commit(s.session.sessionId, revision, [
      {
        op: "put",
        record: {
          ...row,
          payload: Buffer.from(JSON.stringify(ledger)).toString("base64url"),
        },
      },
    ]),
  );
  bad(await s.service.reveal("key-courier", proof), "CONFLICT");
});

test("closing the selected verifier synchronously retires borrowed secret access even while the underlying vault remains unlocked", async (t) => {
  const s = await setup(t),
    view = good(await s.service.provision(["key-courier"], 1000)),
    proof = await s.publication(view),
    bytes = good(await s.service.reveal("key-courier", proof));
  s.f.verifier.close();
  assert.ok(bytes.every((v) => v === 0));
  bad(await s.service.inspect(), "LOCKED");
  assert.equal(good(await s.vault.list(s.session.sessionId)).length, 1);
});

test("audit regression: expiry reached during actual encrypted reveal commit suppresses new bytes and wipes earlier borrows", async (t) => {
  const s = await setup(t),
    view = good(await s.service.provision(["key-courier"], 1000)),
    proof = await s.publication(view),
    previous = good(await s.service.reveal("key-courier", proof)),
    writes = s.store.writes;
  s.store.beforeWrite = () => {
    s.state.now = 1000;
  };
  bad(await s.service.reveal("key-courier", proof), "EXPIRED");
  assert.ok(previous.every((v) => v === 0));
  assert.equal(s.store.writes, writes + 1);
  const row = good(await s.vault.read(s.session.sessionId, s.options.recordId)),
    ledger = JSON.parse(Buffer.from(row.payload, "base64url"));
  assert.equal(
    ledger.reveals.length,
    2,
    "durable disclosure-attempt log may remain without returning bytes",
  );
});

test("audit regression: custody beginning during actual provisioning write prevents a replacement generation commit", async (t) => {
  const s = await setup(t);
  good(await s.service.provision(["key-courier"], 1000));
  good(await s.service.retire());
  const writes = s.store.writes;
  s.store.beforeWrite = () => {
    s.state.custody = true;
  };
  bad(await s.service.provision(["key-courier"], 1000));
  assert.equal(s.store.writes, writes);
  const row = good(await s.vault.read(s.session.sessionId, s.options.recordId)),
    ledger = JSON.parse(Buffer.from(row.payload, "base64url"));
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].state, "retired");
});

test("audit regression: expiry advanced by publication observation refuses before logging an invalid reveal", async (t) => {
  let state;
  const s = await setup(t, {
    confirmPublished: () => {
      state.now = 1000;
      return true;
    },
  });
  state = s.state;
  const view = good(await s.service.provision(["key-courier"], 1000)),
    proof = await s.publication(view),
    writes = s.store.writes;
  bad(await s.service.reveal("key-courier", proof), "EXPIRED");
  assert.equal(s.store.writes, writes);
  assert.equal(good(await s.service.inspect()).revealCount, 0);
});

test("audit regression: custody first observed after a committed generation reports uncertainty and cannot silently retry", async (t) => {
  const s = await setup(t);
  good(await s.service.provision(["key-courier"], 1000));
  good(await s.service.retire());
  const writes = s.store.writes;
  s.store.afterWrite = () => {
    s.state.custody = true;
  };
  bad(await s.service.provision(["key-courier"], 1000), "CONFLICT");
  assert.equal(s.store.writes, writes + 1);
  const row = good(await s.vault.read(s.session.sessionId, s.options.recordId)),
    ledger = JSON.parse(Buffer.from(row.payload, "base64url"));
  assert.equal(ledger.entries.length, 2);
  s.state.custody = false;
  s.store.afterWrite = undefined;
  bad(await s.service.inspect(), "CONFLICT");
  bad(await s.service.provision(["key-courier"], 1000), "CONFLICT");
  assert.equal(s.store.writes, writes + 1);
});
