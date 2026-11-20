# Independent personalization extraction review

## Verdict and exact checkpoints

**Qualified for the scoped source integration after the returned-error repair. No further blocking finding was identified.** This review covers the encrypted preference consumers and their native service contracts. It does not qualify a future application workflow or browser/IndexedDB deployment.

| Checkpoint | Commit |
| --- | --- |
| Recovery base | `84814328f5534d6fceb2bbe74509fe37c5b48689` |
| Initial six-file extraction | `ff226f704346d5a7f7e7b4ea1c9fdfdbec5e2e3c` |
| Final diagnostic regression, observed RED | `1420efc8dc8badefb363d53388b63abdb957efcb` |
| Repaired implementation, observed GREEN | `38bfa82c6d21c9887a87b48676272b81863fe0d3` |

The reviewer used a separate physical worktree with installed dependencies and detached exact commits for execution. The implementation worker owned the repair. This review commit changes documentation only and can be integrated independently.

## Scope and source review

Accepted D7 Option 2 covers personalization, governance and claims. The recovered personalization package adds an index, two consumers, their two tests and a README. Before the diagnostic repair, all five index/implementation/test files byte-matched historical `a45e932a37153590bc329c1e9012cf18e37fe12c`; an independent diff confirmed that equivalence. The repair changes only the template consumer's returned-error normalization and its focused regression. There is no application, Worker, vault schema, journal, retention, dependency, build-profile or workflow change in this package extraction.

Static searches found no production application/Worker import of the package. Its index exposes internal consumer APIs; source recovery does not enable a favorites or template editor. The maintained runtime boundary check remains at 228 production files and 140 core modules.

### Saved-review favorites

The consumer stores at most eight existing saved-review IDs in its reserved encrypted preference. A malformed, future or foreign reserved row is refused and preserved. The compatibility reader does not rewrite legacy saved-review rows. Membership alone does not validate terms; future opening must use current saved-review validation.

Operations capture a native session lease and check current selection, cancellation and revision around asynchronous work. Empty native commits establish persisted freshness before sensitive reads; mutation commits use the caller's observed revision without a hidden retry. A held native operation retains admission after logical cancellation. Lock or observed selection retirement permanently revokes the old consumer. A completed native mutation returns a scalar durable receipt, with `sessionCurrent:false` if local authority retired before delivery.

The existing tests use the maintained encrypted vault and backup services, check ciphertext boundaries, preserve unrelated preferences, exercise another native service's stale CAS, and restore into a fresh-key destination without altering the original profile. Retention conservatively preserves unknown preference dependencies; this extraction did not replace the newer retained intent union.

### Trade templates

The consumer reuses the existing exact schema: eight slots containing seven reusable defaults and an optional repeat-default selection. Schema parsing excludes counterparty, signature, payment-instruction, deadline and transaction-authority fields from the stored template. A template can supply future form defaults only; application composition must still obtain current agreement and transaction authorization.

Planning creates one current preview with a constructor-owned monotonic five-minute lifetime. Commit consumes that preview, validates exact consent, checks the caller's revision, re-reads the current reserved row, compares it with the reviewed original, and rechecks expiry across freshness work and at the native write guard. Changed, incompatible or stale state is refused. Reentrant clock cancellation cannot authorize a write. Cancelled or ignored native work retains admission until physical completion; completed native writes keep their scalar receipt after retirement.

## Reproduced diagnostic finding and repair

The initial `trade-draft-store.ts` helper accessed `result.error.code` directly. A supplied vault adapter could execute a getter or supply an inherited error code. An independent small probe observed one getter execution and a `CONFLICT` result. This differed from the favorites consumer's existing bounded own-data error handling. The integration owner required the same diagnostic boundary before integration.

This boundary is a trusted executable composition port. The maintained native vault's `list`, `captureSession` and `commit` paths reconstruct plain own-data errors through their existing recognized-exception whitelist. Neither this reviewer nor a second read-only source reviewer identified a current imported-data path to the accessor. The finding is a concrete defensive result-handling inconsistency, with no demonstrated transaction-authority bypass.

The repair reads the error wrapper and code through own data descriptors and a fixed whitelist. Accessors, inherited values, unknown/non-string codes and reflection failures yield the fixed fallback. Known own-data codes remain usable. The helper is also reused by the existing recognized thrown-error normalization. The successful result path, preview guard, native `guardFailure` mapping, durable receipt behavior and application wiring are unchanged.

The final regression covers nine diagnostic scenarios and its parent test. At the RED checkpoint, five scenarios fail: code accessor, wrapper accessor, inherited code, inherited wrapper and wrapper descriptor trap. The parent test also fails, yielding four passes and six failures. At the repaired checkpoint all ten pass. Successful subsequent loads and unchanged write counts verify admission release and absence of mutation after each diagnostic refusal.

## Independent execution

Node `v24.22.3`, npm `11.19.1`. No symlinked dependency root was used.

| Check | Observed result |
| --- | --- |
| Initial extraction: personalization, trade-draft schema and retention tests | 55/55 pass; zero failed, skipped or cancelled |
| Final diagnostic test group at `1420efc8dc8badefb363d53388b63abdb957efcb` | RED: 4 pass, 6 fail; five failing scenarios plus parent |
| Same diagnostic group at `38bfa82c6d21c9887a87b48676272b81863fe0d3` | GREEN: 10/10 pass; zero skipped or cancelled |
| Full affected suite at repaired source | 65/65 pass; zero failed, skipped or cancelled |
| `npm run typecheck` at repaired source | All four TypeScript projects pass |
| `npm run check:boundaries` at repaired source | Pass: 228 production files; 140 core modules |
| `git diff --check` and source worktree status | Pass; clean before this review document |

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  --test-name-pattern='returned native failures' \
  packages/personalization/test/trade-draft-store.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/personalization/test/*.test.mjs \
  packages/schemas/test/trade-drafts.test.mjs \
  packages/storage/test/retention-service.test.mjs
npm run typecheck
npm run check:boundaries
```

## Evidence digests

The coordinating workspace retains the following execution logs under `verification`. These digests identify the exact observations, not any later combined source.

| Log | SHA-256 |
| --- | --- |
| `personalization-independent-targeted.tap` | `804d335c38677cfd0fae68455635275b5ef1246519af9f5a2d8914410c2330f9` |
| `personalization-independent-final-diagnostics-red.tap` | `cc98faeb220cc8aa467bad5fcff593fb8071f56a7d8a3cc92bb9915d0fd90b47` |
| `personalization-independent-diagnostics-green.tap` | `a30c63287b31d62a487dac0595b029191a349545d4b0353755d8afc099902107` |
| `personalization-independent-final-targeted.tap` | `96fbf07d45e769c7a91dc7696ad7452e77b4816cda634bac534c6e3b70f1176a` |
| `personalization-independent-final-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `personalization-independent-final-boundaries.log` | `d1a048ee08fb1b83af20b94d47e2b5af27b4fa84ddd02b969e7fa6878011649e` |

## Follow-through

The integration owner should run combined-source gates after applying this reviewed source. Future UI/Worker work must provide narrow profile/epoch-bound commands, clear private projections on retirement, freshly revalidate saved-review references and require new explicit authorization when applying defaults. No application feature activation, native-browser/IndexedDB qualification, remote mutation or release action was performed by this review.
