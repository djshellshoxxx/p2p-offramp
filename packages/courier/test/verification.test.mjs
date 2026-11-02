import test from "node:test";
import assert from "node:assert/strict";
import { fixture, H, handshake, signs } from "./support/fixtures.mjs";
const val = (r) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  },
  fail = (r, c) => {
    assert.equal(r.ok, false);
    assert.equal(r.code, c);
  };
test("selected trusted ports authenticate exact detached data; no imported signature/result grants profile authority", async () => {
  const f = fixture(),
    raw = handshake(),
    e = val(
      await f.verifier.verify(
        "handshake",
        raw,
        signs("key-seller", "key-buyer", "key-courier"),
      ),
    );
  raw.seller = "key-attacker";
  assert.equal(e.classification, "attributed-mutual-claim");
  assert.equal(e.physicalContentsVerified, false);
  assert.equal(e.economicAuthority, false);
  assert.ok(f.buffers.every((b) => b.every((v) => v === 0)));
  fail(
    await f.verifier.verify(
      "handshake",
      { ...handshake(), shipmentId: H("4") },
      signs("key-seller"),
    ),
    "UNAUTHORIZED",
  );
  fail(
    await f.verifier.verify("handshake", handshake(), signs("key-attacker")),
    "UNAUTHORIZED",
  );
  fail(
    await f.verifier.verify("handshake", handshake(), [
      { signer: "key-seller", signature: "sig-invalid" },
    ]),
    "UNAUTHORIZED",
  );
  const one = val(
    await f.verifier.verify("handshake", handshake(), signs("key-seller")),
  );
  assert.equal(one.classification, "one-sided-claim");
});
test("owner revocation while verification is pending refuses late success and clears owned copies", async () => {
  let resume;
  const f = fixture({
    verify: () =>
      new Promise((done) => {
        resume = done;
      }),
  });
  const pending = f.verifier.verify(
    "handshake",
    handshake(),
    signs("key-seller"),
  );
  while (!resume) await new Promise((done) => setTimeout(done, 0));
  f.revoke();
  resume(true);
  fail(await pending, "LOCKED");
  assert.ok(f.buffers.every((b) => b.every((v) => v === 0)));
  fail(
    await f.verifier.verify("handshake", handshake(), signs("key-seller")),
    "LOCKED",
  );
});
test("explicit close cancels a never-settling trusted port and immediately clears retained canonical bytes", async () => {
  let request, entered;
  const ready = new Promise((done) => {
    entered = done;
  });
  const f = fixture({
    verify: (r) => {
      request = r;
      entered();
      return new Promise(() => {});
    },
  });
  const pending = f.verifier.verify(
    "handshake",
    handshake(),
    signs("key-seller"),
  );
  await ready;
  assert.equal(request.signal.aborted, false);
  f.verifier.close();
  assert.equal(request.signal.aborted, true);
  assert.ok(request.canonicalPayload.every((v) => v === 0));
  fail(await pending, "LOCKED");
});
test("a non-settling profile hash has a finite local operation budget and aborts its owned request", async () => {
  let request,
    resolvePort,
    calls = 0;
  const f = fixture({
      digest: (r) => {
        calls++;
        request = r;
        return new Promise((done) => {
          resolvePort = done;
        });
      },
    }),
    start = Date.now();
  fail(
    await f.verifier.verify("handshake", handshake(), signs("key-seller")),
    "UNAVAILABLE",
  );
  assert.ok(Date.now() - start < 8000);
  assert.equal(request.signal.aborted, true);
  assert.ok(request.canonicalPayload.every((v) => v === 0));
  fail(
    await f.verifier.verify("handshake", handshake(), signs("key-seller")),
    "LOCKED",
  );
  assert.equal(
    calls,
    1,
    "timeout cannot admit a backlog behind an uncooperative port",
  );
  resolvePort(H("1"));
  await Promise.resolve();
  fail(
    await f.verifier.verify("handshake", handshake(), signs("key-seller")),
    "LOCKED",
  );
  f.verifier.close();
});

test("audit regression: a current-owner callback cannot close the verifier and still mint evidence", async () => {
  let verifier,
    armed = false;
  const f = fixture({
    isCurrent: () => {
      if (armed) verifier.close();
      return true;
    },
    verify: async () => {
      armed = true;
      return true;
    },
  });
  verifier = f.verifier;
  fail(
    await verifier.verify("handshake", handshake(), signs("key-seller")),
    "LOCKED",
  );
  assert.ok(f.buffers.every((b) => b.every((v) => v === 0)));
});
