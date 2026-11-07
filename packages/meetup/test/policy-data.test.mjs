import test from "node:test";
import assert from "node:assert/strict";
import { createPolicyOwner, policyCopy } from "../src/policy-data.ts";
import { scope, bad } from "./support/policy-fixtures.mjs";
test("local owner final callback closure, nested work and cancelled/hung ports cannot publish or accumulate retained jobs", async () => {
  let owner,
    armed = false,
    calls = 0;
  owner = createPolicyOwner(
    scope,
    () => {
      if (armed) owner.close();
      return true;
    },
    20,
  );
  bad(
    await owner.run(async () => {
      armed = true;
      return 1;
    }),
    "LOCKED",
  );
  const live = createPolicyOwner(scope, () => true, 20),
    bytes = new Uint8Array([1, 2, 3]);
  let borrowed, late;
  const result = await live.run(async () => {
    calls++;
    borrowed = live.own(bytes);
    return new Promise((done) => {
      late = done;
    });
  });
  bad(result, "TIMEOUT");
  assert.ok(borrowed.every((v) => v === 0));
  bad(
    await live.run(async () => {
      calls++;
      return 2;
    }),
    "LOCKED",
  );
  late(3);
  await Promise.resolve();
  assert.equal(calls, 1);
  const cancelled = createPolicyOwner(scope, () => true);
  const pending = cancelled.run(async () => new Promise(() => {}));
  await Promise.resolve();
  cancelled.close();
  bad(await pending, "LOCKED");
});
test("untrusted byte subclasses/accessors cannot substitute slices or shared backing storage", () => {
  const input = new Uint8Array([1, 2]);
  Object.defineProperty(input, "slice", {
    value() {
      throw Error("private accessor");
    },
  });
  Object.defineProperty(input, "byteLength", {
    get() {
      throw Error("private accessor");
    },
  });
  assert.deepEqual(policyCopy(input, 2), new Uint8Array([1, 2]));
  assert.throws(() => policyCopy(new Proxy(input, {}), 2));
  assert.throws(() => policyCopy(new Uint8Array(new SharedArrayBuffer(1)), 2));
});
test("a newly allocated owned copy is wiped when its ownership callback closes synchronously", async () => {
  let owner,
    armed = false;
  owner = createPolicyOwner(scope, () => {
    if (armed) owner.close();
    return true;
  });
  const bytes = new Uint8Array([9, 8, 7]);
  bad(
    await owner.run(async () => {
      armed = true;
      owner.own(bytes);
      return 1;
    }),
    "LOCKED",
  );
  assert.ok(bytes.every((v) => v === 0));
});
