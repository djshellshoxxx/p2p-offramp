# P2P G16 pre-allocation Claude proposal — UNEXECUTED

Private proposal for the sole P2P coordinator. No P2P files were written into GhostPay, no P2P commands/tests were run, and no test outcome is claimed.

Base commit: `673006c1a9cb1e8a1e6eb1a665738b5312f3edc2`; base tree: `8bea687ecee68c8680000269cb266a98b0eb3b36`. Input Library `libfile_1505c877c3708191bcacc035dabece07` version0, SHA256 `91a298757e45bc0ff77e7c365839e426a21ccd2a8679c7cdfae1c28931d675bc`.

Only two approved paths occur. The broker statically matched complete old hunk text against the byte-verified source blocks in memory, removed Claude’s explicitly withdrawn placeholder, and regenerated ordinary unified-diff headers using unchanged actual proposed code. No implementation logic was rewritten. This establishes patch provenance/context correspondence, not executable correctness.

Review notes: two sentinel tests should demonstrate RED on the base; boundary/type/surrogate tests are regression guards. The early length check changes oversized malformed string errors to LIMIT_EXCEEDED as the packet expressly requires. Existing bounded malformed inputs still use INVALID_INPUT. The coordinator must review fixtures and sequential TextEncoder spy isolation, apply TESTS FIRST, execute RED, then implementation/GREEN and affected checks.

## Exact source and patch hashes

```json
[
  {
    "path": "packages/domain/test/trade-terms.test.mjs",
    "base_sha256": "8b748874fb626e680ffd2957a6ccb0f7564754a6307bfee2e98db97b74ed6c4c",
    "proposed_sha256": "7d2ed7032b2c5db3c5a6f7c390ed2c4e9524895e4f70e4133c070bb461b5e117",
    "patch_sha256": "c7ab56f2551773c150f7450cfc226d8fb837b2b54d0b2d236668398a356c5af0",
    "patch": "P2P-G16-tests-017.patch"
  },
  {
    "path": "packages/domain/src/trade-terms.ts",
    "base_sha256": "7e29fa2011ca83a59dde45aed06afe814a5a0a280c9e88875c2c533276ba793d",
    "proposed_sha256": "e0d3733a996981f83351884d7f00ea51fae61b8ce49b09d5af546d1152bb1bd2",
    "patch_sha256": "e5e4b5c22bff980e5058cd1ae6dc1f1c232ae77f669123f5449e308891fabf0c",
    "patch": "P2P-G16-implementation-017.patch"
  }
]
```

## Request accounting

```json
{
  "tag": "p2p-g16-prealloc-017",
  "model": "claude-sonnet-5-5",
  "timestamp_utc": "2026-10-26T23:49:04.191396+00:00",
  "completed_at_utc": "2026-10-26T23:49:23.833540+00:00",
  "request_id": "req_011CgRk5c4hn9ntunsGVB6dD",
  "usage": {
    "input_tokens": 15378,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
    },
    "output_tokens": 3467,
    "output_tokens_details": {
      "thinking_tokens": 0
    },
    "service_tier": "standard",
    "inference_geo": "global",
    "speed": "standard"
  },
  "stop_reason": "end_turn",
  "estimated_cost_usd": "0.065426",
  "worst_case_reserved_usd": "2.09",
  "state": "completed"
}
```

## P2P-G16-tests-017.patch

```diff
--- a/packages/domain/test/trade-terms.test.mjs
+++ b/packages/domain/test/trade-terms.test.mjs
@@ -79,3 +79,79 @@
   rejects(() => checkFundingWindow('1000', String(500 + 1799), '500')); rejects(() => checkFundingWindow('1000', String(500 + 604801), '500'));
   rejects(() => checkFundingWindow('1000', '400', '500')); rejects(() => checkFundingWindow('1000', '5000', '-1'));
 });
+
+/** Observe TextEncoder.encode receiving a specific oversized sentinel; delegate every other call natively. */
+function withEncodeSpy(sentinel, work) {
+  const original = TextEncoder.prototype.encode;
+  const seen = [];
+  TextEncoder.prototype.encode = function (value) {
+    if (value === sentinel) { seen.push(value.length); throw new Error('oversized sentinel reached TextEncoder'); }
+    return original.call(this, value);
+  };
+  try { work(); } finally { TextEncoder.prototype.encode = original; }
+  return seen;
+}
+const limitCode = error => error?.code === 'LIMIT_EXCEEDED';
+
+test('G16 oversized instructions are refused before being passed to TextEncoder', () => {
+  const base = vectors.privateAgreements[0].input;
+  for (const sentinel of ['x'.repeat(4097), 'x'.repeat(100_000), '\u20ac'.repeat(4097), '\u{1F600}'.repeat(2049)]) {
+    let thrown;
+    const seen = withEncodeSpy(sentinel, () => {
+      try { encodePrivateAgreement({ ...base, paymentInstructions: sentinel }); } catch (error) { thrown = error; }
+    });
+    assert.equal(seen.length, 0, 'oversized instruction string must not reach TextEncoder');
+    assert.equal(limitCode(thrown), true, 'fixed LIMIT_EXCEEDED code');
+    assert.equal(String(thrown?.message).includes('xxxx'), false, 'no payload in diagnostics');
+  }
+});
+
+test('G16 oversized capability id and version are refused before being passed to TextEncoder', () => {
+  const base = vectors.privateAgreements[1].input;
+  const cap = base.capabilities[0];
+  const sentinels = [
+    { id: 'a'.repeat(65), version: cap.version, key: 'id' },
+    { id: 'a'.repeat(5000), version: cap.version, key: 'id' },
+    { id: cap.id, version: 'v'.repeat(33), key: 'version' },
+    { id: cap.id, version: 'v'.repeat(5000), key: 'version' },
+  ];
+  for (const item of sentinels) {
+    const sentinel = item[item.key];
+    let thrown;
+    const seen = withEncodeSpy(sentinel, () => {
+      try { encodePrivateAgreement({ ...base, capabilities: [{ ...cap, id: item.id, version: item.version }] }); } catch (error) { thrown = error; }
+    });
+    assert.equal(seen.length, 0, 'oversized capability string must not reach TextEncoder');
+    assert.equal(limitCode(thrown), true);
+  }
+});
+
+test('G16 exact instruction byte boundaries stay valid and over-byte-cap strings still fail', () => {
+  const base = vectors.privateAgreements[0].input;
+  const ok = value => encodePrivateAgreement({ ...base, paymentInstructions: value });
+  assert.equal(ok('x'.repeat(4096)).byteLength > 4096, true);
+  const euro = '\u20ac'.repeat(1365) + 'x'; // 3*1365 + 1 = 4096 bytes, 1366 code units
+  assert.equal(new TextEncoder().encode(euro).byteLength, 4096);
+  assert.equal(ok(euro).byteLength > 4096, true);
+  const emoji = '\u{1F600}'.repeat(1024); // 4096 bytes, 2048 code units
+  assert.equal(new TextEncoder().encode(emoji).byteLength, 4096);
+  assert.equal(ok(emoji).byteLength > 4096, true);
+  // Code-unit count fits (<= 4096) but UTF-8 byte count exceeds the cap.
+  const tooManyBytes = '\u20ac'.repeat(1366);
+  assert.equal(tooManyBytes.length <= 4096, true);
+  rejects(() => ok(tooManyBytes), 'LIMIT_EXCEEDED');
+  rejects(() => ok('\u{1F600}'.repeat(1025)), 'LIMIT_EXCEEDED');
+  rejects(() => ok('x'.repeat(4097)), 'LIMIT_EXCEEDED');
+});
+
+test('G16 bounded lone surrogates fail INVALID_INPUT and nonstrings are rejected without coercion', () => {
+  const base = vectors.privateAgreements[0].input;
+  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: 'ab\uD800cd' }));
+  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: '\uDC00' }));
+  let coerced = 0;
+  const evil = { toString() { coerced++; return 'x'; }, valueOf() { coerced++; return 'x'; } };
+  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: evil }));
+  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: 5 }));
+  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: new String('x') }));
+  assert.equal(coerced, 0);
+});
```

## P2P-G16-implementation-017.patch

```diff
--- a/packages/domain/src/trade-terms.ts
+++ b/packages/domain/src/trade-terms.ts
@@ -89,7 +89,10 @@
 const utf8 = new TextEncoder();
 /** Exact UTF-8 of an already-valid JS string; lone surrogates are rejected rather than replaced. */
 function text(input: unknown, minimum: number, maximum: number, ascii = false): Uint8Array {
-  if (typeof input !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input)) return fail();
+  if (typeof input !== 'string') return fail();
+  // UTF-8 needs at least one byte per UTF-16 code unit, so a longer string can never fit: refuse before regex/encode allocation.
+  if (input.length > maximum) return fail('LIMIT_EXCEEDED');
+  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input)) return fail();
   if (ascii && !/^[\x21-\x7e]*$/.test(input)) return fail();
   const bytes = utf8.encode(input);
   if (bytes.byteLength < minimum) return fail();
```

## Unexecuted reproduction commands

Run in the P2P coordinator checkout after verifying the exact base and applying tests only.

```text
node --test packages/domain/test/trade-terms.test.mjs
# Apply implementation only after recording genuine focused RED.
node --test packages/domain/test/trade-terms.test.mjs packages/wallet/test/evm-terms.test.mjs packages/wallet/test/evm-agreement.test.mjs
P2P_CHROMIUM=/usr/bin/chromium node scripts/test-g16-browser.mjs
npm test
npm run build
npm run check:boundaries
npm run test:build-policy
```

All commands remain UNEXECUTED by the broker. Runtime inclusion, financial/trust policy, dependencies and other files are outside this proposal.
