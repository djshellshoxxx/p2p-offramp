# Personalization recovery — November 19, 2026

## Source and scope

- Current integration base: `84814328f5534d6fceb2bbe74509fe37c5b48689`.
- Initial recovered source/test checkpoint: `ff226f704346d5a7f7e7b4ea1c9fdfdbec5e2e3c`.
- Returned-native-diagnostic regression checkpoint: `1420efc8dc8badefb363d53388b63abdb957efcb`; repaired source checkpoint: `38bfa82c6d21c9887a87b48676272b81863fe0d3`.
- Historical source: PR #81, `claude/vibrant-cray-ny4gum` at `a45e932a37153590bc329c1e9012cf18e37fe12c`; its selective #42 extraction preserves the personalization work from the historical #26/#42 lineage.
- Decision: `docs/adr/proposed/D7-optional-reference-packages.md` records accepted Option 2: personalization, claims and governance are in scope, while nine optional reference packages remain parked.
- Six recovered files: package index, two consumers, two test files and an updated README. No vault schema, journal, retention, runtime Worker, App, build profile, dependency or workflow changed.

This is recovery of two internal encrypted preference consumers, not completion of their user-facing application workflows. The package index exports their local APIs, but the current app/Worker does not import them. `ReleaseEnabled=0` remains unchanged.

## Behavior retained

Favorites store at most eight existing saved-review IDs in a dedicated versioned encrypted preference. Star/unstar requires the originally observed revision and a live native session lease. Foreign or malformed reserved rows are preserved. Opening an eventual favorite still needs the existing current-registry review path; the preference never makes terms valid.

Trade templates reuse the current schema and store at most eight bounded seven-field defaults. They exclude counterparty addresses, payment instructions, deadlines, salts, signatures and transaction authority. Changes require a single-use explicit preview, exact revision and acknowledgement of logical deletion limits. The constructor-owned monotonic clock expires previews after five minutes. Profile retirement, lock, stale CAS, cancellation and changed input refuse the operation without automatic retries. Durable writes retain their scalar receipt even after local retirement.

The tests use the real maintained encrypted vault and backup services. Their storage adapters exercise native CAS, cancellation and restoration behavior; they do not establish actual browser/IndexedDB device qualification.

## Duplicate retention work rejected

Current `packages/storage/src/retention-service.ts` differs from the historical source only by five `IntentV1` → `Intent` type widenings. A complete byte comparison after that exact type normalization equals the maintained source. Its test file and both trade-draft schema files are already identical. Replacing retention would narrow support for the newer intent union and add no runtime functionality. No retention source was copied.

## Executed verification

Node v24.22.3, npm 11.19.1. Fresh `npm ci --ignore-scripts` completed.

### Initial extraction

| Command | Result |
|---|---|
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/personalization/test/*.test.mjs packages/schemas/test/trade-drafts.test.mjs packages/storage/test/retention-service.test.mjs` | 55/55 passed, zero failed/skipped |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | 228 production files; existing core graph remains 140 modules |
| `npm run test:build-policy` | 54/54 passed, zero failed/skipped |
| `npm run build` | Passed: ordinary offline static artifact |
| Actual emitted document/vault/QR graphs | No personalization source module present |
| `git diff --check` | Passed |

The initial extraction preserved all five implementation/test/index files verbatim. Its existing suite covers encryption, eight-entry bounds, incompatible rows, stale revisions, two-service CAS, lock/profile retirement, reentrant callbacks, held cancelled writes, durable receipts, fresh-key restore, preview expiry, and thrown hostile diagnostics. Independent review then identified the returned-native-error gap documented below.

### Independent-review diagnostic repair

The original template consumer directly read `result.error.code`. A supplied vault adapter could therefore invoke an accessor or supply an inherited code. The maintained native vault emits fixed own-data failures; the demonstrated defect is at the supplied-adapter diagnostic boundary. No app or remote exploit path was demonstrated.

The repair applies the favorites consumer's existing bounded own-data pattern: read the returned `error` wrapper and its `code` through own property descriptors, preserve only whitelisted string data values, and return fixed `STORAGE_UNAVAILABLE` for accessors, inherited data, unknown/non-string codes or reflection failures. The recognized thrown-error branch reuses the same bounded code reader. Successful native results, revision/lease guards, cancellation, durability and module wiring remain unchanged.

The new regression covers nine cases: code accessor, wrapper accessor, inherited code, inherited wrapper, unknown code, non-string code, code descriptor trap, wrapper descriptor trap and a valid own-data code. Every case verifies that no diagnostic getter/coercion runs, no private diagnostic escapes, no storage write occurs, and a following successful load can acquire the released physical slot.

| Check | Result |
|---|---|
| RED at `1420efc8dc8badefb363d53388b63abdb957efcb`: `node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern='returned native failures' packages/personalization/test/trade-draft-store.test.mjs` | Exit 1; 4 passed, 6 failed. Five failing scenarios plus their parent group; both accessor scenarios observed one getter invocation |
| Same focused command at repaired source `38bfa82c6d21c9887a87b48676272b81863fe0d3` | 10/10 passed, zero failed/skipped |
| Full personalization + trade-draft schema + retention command above, at repaired source | 65/65 passed, zero failed/skipped |
| `npm run typecheck`, at repaired source | All four TypeScript projects passed |
| `npm run check:boundaries`, at repaired source | 228 production files; core entry graph remains 140 modules |
| `git diff --check` | Passed |

## Exact source blobs

At initial checkpoint `ff226f704346d5a7f7e7b4ea1c9fdfdbec5e2e3c`, all five implementation/test/index files byte-match historical `a45e932a37153590bc329c1e9012cf18e37fe12c`:

| File | Git blob |
|---|---|
| `packages/personalization/index.ts` | `81a5dd414f630da6a7a52a5a3f3e4041d382e4c1` |
| `packages/personalization/src/favorites.ts` | `6ef9762d7c66228e96da56da1072e159e5a3c0cd` |
| `packages/personalization/src/trade-draft-store.ts` | `c6d74668dce6bfa2943fb98e60107dae5a76f093` |
| `packages/personalization/test/favorites.test.mjs` | `cc895b9e8e71f06e7c77982d3e7365596bcdcff3` |
| `packages/personalization/test/trade-draft-store.test.mjs` | `f6e6e0bec34b9ea385923ff334a9bb1bcc97d7ae` |

The diagnostic repair changes only the template consumer and its regression file. Their blobs at repaired checkpoint `38bfa82c6d21c9887a87b48676272b81863fe0d3` are:

| File | Git blob |
|---|---|
| `packages/personalization/src/trade-draft-store.ts` | `b8da187c0141294ac99948abfb78bfdbc507f163` |
| `packages/personalization/test/trade-draft-store.test.mjs` | `8988dbc000c32707924ec76e77097c63e8c4ff33` |

## Execution evidence hashes

Logs are transient execution evidence in the coordinating workspace; this report preserves commands, counts and digests. No log should be treated as an assertion of a newer source checkpoint.

| Log | SHA-256 |
|---|---|
| `personalization-install.log` | `af42599a6e87b7d787659cd620c24b868c9778afb742045bb6550fc0e14fe8ca` |
| `personalization-baseline.log` | `868fc187783c40b9e4095e23046dd842b4998b935ad5278c1687b5c509794a3b` |
| `personalization-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `personalization-boundaries.log` | `d1a048ee08fb1b83af20b94d47e2b5af27b4fa84ddd02b969e7fa6878011649e` |
| `personalization-policy.log` | `87cb9c43e1bca607f700b7a5684d45d7b4d76d780f934619c1660ac3e7a16f8e` |
| `personalization-build.log` | `2a572918220e307406ef1a2f15b0aff000def273c3f6ec98b65294c00109d04c` |

Diagnostic repair evidence:

| Log | SHA-256 |
|---|---|
| `personalization-native-errors-red.log` | `c3a9efb2d0a48ae461e4570774162c077ce53aea7bea8c4064b881f71a99b63d` |
| `personalization-native-errors-green.log` | `28bad38ffbc72a61068895f78dbd1b845d8409c45338f32946e591cf0ee2ddd0` |
| `personalization-native-errors-suite.log` | `363ab51d8ad15c8025f85b681d447e6caefd9ccec7598d46c47e396210bd8551` |
| `personalization-native-errors-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `personalization-native-errors-boundaries.log` | `d1a048ee08fb1b83af20b94d47e2b5af27b4fa84ddd02b969e7fa6878011649e` |

## Next action

Independently review this narrow package extraction and run affected combined checks before source integration. Future application composition needs narrow profile/epoch-bound commands, private projection cleanup, current saved-review validation and explicit fresh trade authorization when applying a template. Historical UI/Worker files must not replace newer current runtime logic. Real browser/device evidence and hosted checks remain separate.
