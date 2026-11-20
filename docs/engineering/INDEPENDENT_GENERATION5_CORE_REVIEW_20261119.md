# Independent generation 5 core composition review

Date: November 19, 2026, America/Vancouver task date; executions occurred November 20 UTC.

## Verdict and exact source

**No open High or Medium finding in the reviewed core composition.** The independent affected suite passed **506/506**, the selected policy suite passed **38/38**, and three independently authored cross-feature probes passed **3/3**. These are actual executions on the frozen composition, not sums of earlier component results. The reviewer did not repeat the author's full repository suite or treat the component browser results as qualification of this new source.

| Reference | Exact identity |
| --- | --- |
| Published generation 2 base, PR #190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Reviewed composition | `de5bb8aadadd9b76099110262b2f7beb123f9421` |
| Reviewed composition tree | `ff1028ddc6c90119e38be7ca8fe3e007fb525b06` |
| Templates input including author report | `540bbba01a0d97d2481fc73fef4a6e0ba7046f7a` |
| Final tested templates source | `45a4905368bc3acb2c87d9f9c5d33fee4197e3e1`, tree `8cfb5b137a4797d5089ffa2204347f9e4358fe27` |
| Restore input including author report | `da931533df5f77b6eaa810ac35c18659b99374cc` |
| Final tested restore source | `6207d14bf83213847620b0dd1541f2c7d2e3b893`, tree `75d068cc66e3138c89542550d2d6909600f1f68a` |
| Published acknowledgment repair, PR #202 | `d753c0af23ff43743e34679e6b778b9ac0370da2` |
| Published favorites, PR #201 | `f5241c09f268a7a6841a5760ed0faa90b5b7f005` |

The independent worktree is `p2p-offramp-generation5-core-audit`, branch `codex/generation5-core-independent-20261119`. It started at the exact reviewed composition. The reviewer read the current coordination handoff/state and component reports before creating the worktree, copied physical pinned dependencies into that checkout, and did not modify the author's worktree or source. This report is the only tracked reviewer change after the tested source. No remote mutation, browser launch, deployment, release, credentials or funds operation was performed.

The review covers composition of the previously reviewed favorites/templates, immutable-copy/distribution tooling correction, Solana acknowledgment fixture correction and Solana restore lifecycle repair. The nine optional packages remain separate source PRs; they are not included by this core integration.

## Exact union and preserved gates

Independent Git comparisons established all of the following:

| Surface | Verified result |
| --- | --- |
| Non-shared template input paths | All **46** equal their template input bytes. |
| Non-shared restore input paths | All **11** equal their restore input bytes. |
| Changed-path union | Exactly **59** paths; only `package.json` and `vault-foundation.yml` overlap between inputs. No extra integration source path exists. |
| Commands and metadata | All **52** base commands and their values are preserved; the exact union contains **56**. All non-script package metadata and `package-lock.json` remain unchanged. |
| Foundation workflow | Removing the four exact additive browser blocks restores all **125** original physical lines byte for byte. Every new block retains its own Chromium environment; existing steps keep theirs. |
| Other workflows | All five other workflows remain byte-identical to the generation 2 base. |
| Native financial and data source | Contracts; chain-Solana; wallet, storage, security, domain and transport packages; and native personalization implementations are unchanged from the base. |
| Schema scope | Only the reviewed runtime IPC schema changes under `packages/schemas/src`; the native trade-draft, backup, signed terms and transaction schemas remain unchanged. |
| Solana application scope | Only the reviewed `SolanaLocalnetRoot.tsx` changes within `apps/web/src/solana-localnet`. Its client, controller, protocol and RPC remain unchanged. |
| Optional packages | All nine package subtrees remain identical to the base: proof-inputs, liquidity, arbitration, privacy-policy, courier, meetup, privacy-controls, stealth and proof-jobs. |
| Distribution authority | Production `stage.mjs`, maintained claims register and docs manifest are unchanged. No historical receipt is rebound. |
| Strict Solana observation | Send-evidence observer and browser fixture remain byte-identical; the completed-503 helper and associated fixture/early diagnostic equal published PR #202. |

The four added foundation steps are the acknowledgment diagnostic, restore diagnostic, favorites browser flow and templates browser flow. None has a skip, conditional success substitute or `continue-on-error`. Existing checkout pins, full-history source binding, permissions, triggers and concurrency settings are unchanged.

Reversing only the two reviewed synchronization edits restores the original complete Solana financial browser harness byte for byte: its idle predicate now waits for `aria-busy === 'false'`, and the profile-lock path explicitly waits for that acknowledgment. Signature uniqueness, send counts, durable marker checks, cancellation and replacement authorization, original-profile provenance, exact principal and actual fee assertions, fixture errors and real refund waits are retained. The native workflow still has its 150-minute job limit and separate 50/60-minute validator/browser limits. It still requires both real 1,800-second refund minima.

The 503 change is confined to a deliberate fixture withholding an acknowledgment after marker observation and before forwarding. Production RPC behavior and transaction retry policy are unchanged. The short diagnostic does not establish a general no-retransmission guarantee for arbitrary transport resets.

## Interaction review and independent probes

The relevant shared authority is the encrypted profile revision. Favorites uses a short-lived native consumer, while templates retains the same native preview store across preview and commit. Both remain inside the single private Worker endpoint, with existing physical admission, selected profile/session lease, request deadline, generation and post-await checks. Template preview disposal is part of selection clearing. An acknowledgment suppressed by cancellation or lock does not reverse a durable native write, and neither UI introduces automatic write retry.

The review inspected the runtime schema, pending metadata, AppRuntime profile command handling, Worker dispatch and selection retirement, AppServices facade, draft/review controllers, App lifecycle effects and the Solana component. Pending metadata remains primitive operation/generation/profile data. Template application retains only the seven accepted defaults, clears transient parties/instructions/deadlines and the owned prior review, and uses the maintained builder and current registry for a fresh session-only draft. The saved-review parser still does not accept `local-draft` as a persisted file/sample source. Favorites' completed-load-generation fence remains intact; an old accepted route cannot substitute for a failed fresh registry review.

Solana recovery remains a separate client/controller and Worker composition. Its pending command epoch distinguishes immediate redaction from final acknowledgment, and its input epoch owns late file reads. Immediate null-profile clearing remains unconditional. Restore submission detaches the retained document byte view, invokes the unchanged synchronous posting client, and clears the document view after cloning. Older command completions cannot retire a newer lock, and obsolete file reads cannot install a selected backup. The independently reviewed component's source is preserved exactly here.

Three new scratch probes exercised the shared-profile composition through the actual `createVaultWorkerEndpoint`, encrypted vault/backup services, real cryptography and an in-memory compare-and-swap store:

1. **Favorite write after template preview:** saving a favorite increments revision 1 to 2. Committing the prior template preview returns `CONFLICT`, with unchanged encrypted rows and zero extra writes. Explicit reload and a new preview then save the template at revision 3 without losing the favorite.
2. **Template write after favorites load:** committing the template increments revision 1 to 2. A favorite mutation using the older observed revision returns `CONFLICT`, again without a write. Explicit reload permits the change at revision 3 while retaining the template.
3. **Combined encrypted restore:** a profile containing the saved-review record and both preference records exports and restores through the actual backup service into a different profile and fresh key. The source encrypted row remains unchanged. The restored favorites and template library both load at revision zero, with all three records present and no implicit read-side write. The observed stored envelopes contain no plaintext field names from the synthetic payload.

These probes passed **3/3** and are additional to the 506 maintained affected tests. They test actual in-process endpoint/cryptographic behavior, not native browser Workers, IndexedDB durability, real counterparties or financial execution. The portable probe source is included below; its scratch execution digest is recorded separately.

## Actual emitted artifacts

The reviewer independently built the default and demo application on the frozen core source. All **13 default files** and **14 demo files**, including `local-build-evidence.json`, are byte-identical to the preserved templates author artifacts. The emitted private Worker graphs contain exactly:

- `packages/personalization/favorites.ts`
- `packages/personalization/src/favorites.ts`
- `packages/personalization/templates.ts`
- `packages/personalization/src/trade-draft-store.ts`

Document and QR graphs contain no personalization module. None of the nine optional packages appears in any inspected emitted graph. The four-module QR graph and decoder asset retain their exact bytes. Both default/demo artifacts retain `ReleaseEnabled:0`, no external connection origins, false signed-release/release-acceptance/framing-attestation flags, and false physical-device qualification.

The reviewer also invoked only `buildSolanaRestoreArtifact` on this combined source, without invoking its browser runner, to check the shared-schema/style composition. The actual eleven-asset artifact passed its component/client/controller graph checks, contains zero personalization modules in either graph, and retains disabled release authority. Its asset-list SHA-256 is:

`ba257e8b5178c52014e4eb4c00a3047cb71cb63d33ed395add6dc7754497a7a4`

This is the **combined-source** digest. It differs from standalone restore digest `54937986…`; the earlier artifact identity must not be attributed to this core composition. Neither build is a browser execution claim.

## Independently executed verification

Environment: Node 24.22.3 with physical in-checkout pinned dependencies. Pinned Foundry/SOLC paths were supplied for the affected suite; dependency versions were not changed.

| Check | Actual result |
| --- | --- |
| Combined maintained affected suite | **506/506 passed**, zero failures/skips/cancellations/todo; 26,811.412019 ms. |
| Selected artifact/QR/import policy suite | **38/38 passed**, zero failures/skips/cancellations/todo; 5,411.874335 ms. |
| New cross-feature probes | **3/3 passed**, zero failures/skips/cancellations/todo; 1,598.083602 ms. |
| Static source boundaries | Passed: 238 production files, 142 core entry modules. |
| Actual default and demo builds | Both passed; byte equality and graph assertions passed. |
| Actual Solana artifact-only build | Passed; eleven assets and source-bound digest above; browser not invoked. |
| Independent exact-union/security-gate comparisons | Passed, with assertions and source identities retained in the preservation log. |
| Source/report whitespace and tracked-change scope | Checked before report commit. |

The affected suite includes the existing Solana, favorite, template, schema, native store, domain builder and shared AppRuntime/AppServices tests. It does not represent the full repository suite. Author full-suite/typecheck/tooling results belong to the separate generation 5 composition report and their frozen source, not to this reviewer's execution totals.

Reproduction from the source checkout:

```sh
FOUNDRY_BIN=<pinned-toolchain> FOUNDRY_SOLC=<pinned-solc-0.8.30> \
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 \
  packages/chain-solana/test/*.test.mjs apps/web/test/solana-*.test.mjs \
  packages/schemas/test/runtime*.test.mjs packages/schemas/test/trade-drafts.test.mjs \
  packages/domain/test/trade-draft.test.mjs packages/personalization/test/*.test.mjs \
  apps/web/test/saved-review-favorites-*.test.mjs apps/web/test/saved-reviews-controller.test.mjs \
  apps/web/test/trade-templates-*.test.mjs apps/web/test/app-services.test.mjs \
  apps/web/test/app-runtime.test.mjs apps/web/test/pending-metadata.test.mjs
node --test apps/web/scripts/artifact-policy.test.mjs \
  apps/web/scripts/qr-build-policy.test.mjs scripts/tests/import-boundaries.test.mjs
node scripts/check-import-boundaries.mjs
node apps/web/scripts/build.mjs
node apps/web/scripts/build.mjs demo
```

## Remaining qualification and scope

No new source defect was found in this review. Earlier separately reproduced findings and their RED/GREEN evidence remain in the component reports: the favorites stale-route defect, template publication-retirement defect and workflow environment correction, immutable copy binding/distribution admission, acknowledgment fixture, and restore command/file-read ownership. This review does not erase the failing older hosted jobs or replace their evidence with a later local pass.

Actual current unsigned distribution remains refused while immutable locale/copy evidence is stale. The corrected tooling's positive historical-client fixture is explicitly dirty and cannot qualify distribution of this new App. No semantic or release approval is manufactured by source/test consistency.

The exact final published head and actual tested merge tree still need their applicable hosted browser and native financial qualification. In particular, the new favorites/templates/restore browser journeys and complete Solana validator/financial browser flows must execute on the composed source. Prior PR #202 acknowledgment results and failed/running ancestor jobs are separate evidence. Local Chromium was not launched because the environment blocks its required socket behavior; no bypass was attempted.

The separate nine-package PR policy, disabled releases, current noncustodial boundaries and owner-controlled trust inputs remain in force. Main merge eligibility belongs to the coordinator's exact-head gate assessment, not to this local review alone.

## Evidence digests

The following session evidence binds the independent results to the frozen source. SHA-256 values are file digests; they are not signatures or remote execution claims.

| Evidence file | SHA-256 |
| --- | --- |
| `generation5-independent-affected.log` | `a129eb138adf2f6ef1cfde66a57158b18b60df949474518d132f9f7c558757f5` |
| `generation5-independent-policy.log` | `0fd6de05b2b7e4643cf2368a76aaf23738004723144b77abe79b575068039bea` |
| `generation5-independent-boundaries.log` | `5254263f82db056f8b7b8e5b03552f31bd0bf37901f9955cd5d5dff27709cc2d` |
| `generation5-independent-build.log` | `68f4a4484c61d7910ed785a287eb9d239d87f55b36caa9253b78abc650bf8c4d` |
| `generation5-independent-demo-build.log` | `dfbfb71e768e7c2bccdaa078ea9246939e166099bb13a92b9e974299d5c2e45b` |
| `generation5-independent-preservation.py` | `eff7d4d4eaea8a3920893246d3989404d3e1d92e181f1c97553abfa407a57e10` |
| `generation5-independent-preservation.json` | `7fb64b9ef882c63502779d55af19b8fdf983cacd96f65ecb71d4843df17b93a3` |
| `generation5-independent-interleaving.mjs` | `5060859cc6e473c49af70f7576517a2ccf8ac7064a039130b44c5c0cac7efe10` |
| `generation5-independent-interleaving.log` | `66dc0f5df16ed6301bae7f220ff6d48c43a1f81b1c7cf00fc3888f237dd012d0` |
| `generation5-independent-artifact-evidence.json` | `9087bc4243e3a8dc9d20eefe935a75cd78c067fe2fae1cc1ef97993b2e7798a8` |
| `generation5-independent-solana-artifact.log` | `67fb091cf77eefb8da9f3ddc93c6ca03ff62a0b6964a8c4473912aef3a486766` |

## Reproduce the independent cross-feature probes

Save the following as a temporary `independent-generation5-probe.mjs` at the repository root and run `node --import ./scripts/test-support/register-tsx.mjs --test independent-generation5-probe.mjs`. Only the two source import paths are adapted from the original sibling-worktree scratch script; assertions and test logic are identical. Remove the temporary file afterward. No browser, network, wallet or funded transaction is used.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from './packages/storage/index.ts';
import { createVaultWorkerEndpoint } from './apps/web/src/runtime/worker-endpoint.ts';

const passphrase = 'independent generation five encrypted profile fixture';
const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const clone = value => structuredClone(value);
class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); assert.equal(this.rows.has(row.profileId), false); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw Object.assign(new Error('CONFLICT'), { code: 'CONFLICT' });
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}
async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const backup = new EncryptedBackupService(store), messages = [];
  const endpoint = createVaultWorkerEndpoint(message => messages.push(clone(message)), { createServices: () => ({ vault, backup }) });
  t.after(() => { endpoint.dispose(); vault.dispose(); backup.dispose(); });
  let requestId = 0, generation = 0, profileId;
  const send = async (operation, fields = {}) => {
    await endpoint.dispatch({ version: 1, requestId: ++requestId, generation, operation, ...fields });
    const reply = messages.at(-1); assert.equal(reply.requestId, requestId); return reply.result;
  };
  const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
  const command = async (operation, fields = {}) => ok(await send(operation, fields));
  ok(await send('init', { config: { version: 1, ReleaseEnabled: 0, connectOrigins: [] } }));
  const created = await command('create', { passphrase }); profileId = created.handle.profileId;
  const scoped = (operation, fields = {}) => send(operation, { profileId, ...fields });
  const value = async (operation, fields = {}) => ok(await scoped(operation, fields));
  const recordId = (await value('saveTermsReview', { source: 'file', bytes: new TextEncoder().encode('{"independent-review":1}') })).recordId;
  const plan = revision => value('previewTradeTemplateChange', { expectedRevision: revision, change: { kind: 'put-template', slot: 0, defaults } });
  const commit = preview => scoped('commitTradeTemplateChange', { expectedRevision: preview.revision, previewId: preview.previewId, consent });
  const favorite = revision => scoped('setReviewFavorite', { recordId, favorite: true, expectedRevision: revision });
  const verifyBoth = async revision => {
    assert.deepEqual(await value('listFavoriteReviews'), { revision, recordIds: [recordId] });
    const templates = await value('loadTradeTemplates'); assert.equal(templates.revision, revision);
    assert.deepEqual(templates.library.templates, [{ slot: 0, defaults }]);
    assert.equal(templates.library.repeatDefaultSlot, null);
  };
  return { store, vault, backup, send, command, scoped, value, ok, plan, commit, favorite, recordId, verifyBoth,
    profile: () => profileId,
    lock: async () => { generation++; return command('lock'); },
    select: async (id, password) => { profileId = id; return value('unlock', { passphrase: password }); },
  };
}

test('a favorite write invalidates a held template preview without overwriting either preference', async t => {
  const s = await setup(t), loaded = await s.value('loadTradeTemplates'); assert.equal(loaded.revision, 1);
  const preview = await s.plan(loaded.revision); assert.equal(s.ok(await s.favorite(1)).revision, 2);
  const before = clone(s.store.rows), writes = s.store.writes;
  const refused = await s.commit(preview); assert.equal(refused.ok, false); assert.equal(refused.error.code, 'CONFLICT');
  assert.equal(s.store.writes, writes); assert.deepEqual(s.store.rows, before);
  assert.deepEqual((await s.value('listFavoriteReviews')).recordIds, [s.recordId]);
  const current = await s.value('loadTradeTemplates'); assert.deepEqual(current.library.templates, []); assert.equal(current.revision, 2);
  assert.equal(s.ok(await s.commit(await s.plan(current.revision))).revision, 3);
  await s.verifyBoth(3);
});

test('a template write invalidates a stale favorites revision and explicit reload preserves both records', async t => {
  const s = await setup(t), loaded = await s.value('listFavoriteReviews'); assert.equal(loaded.revision, 1);
  assert.equal(s.ok(await s.commit(await s.plan(1))).revision, 2);
  const before = clone(s.store.rows), writes = s.store.writes;
  const refused = await s.favorite(loaded.revision); assert.equal(refused.ok, false); assert.equal(refused.error.code, 'CONFLICT');
  assert.equal(s.store.writes, writes); assert.deepEqual(s.store.rows, before);
  const current = await s.value('listFavoriteReviews'); assert.deepEqual(current.recordIds, []); assert.equal(current.revision, 2);
  assert.equal(s.ok(await s.favorite(current.revision)).revision, 3);
  await s.verifyBoth(3);
});

test('one actual encrypted backup restores templates and favorite references together at revision zero', async t => {
  const s = await setup(t); s.ok(await s.favorite(1)); s.ok(await s.commit(await s.plan(2))); await s.verifyBoth(3);
  const originalId = s.profile(), original = clone(s.store.rows.get(originalId));
  const exported = await s.value('exportEncrypted'); assert.ok(exported.bytes instanceof Uint8Array);
  await s.lock();
  const destinationPassphrase = 'different fresh key passphrase for independent restore';
  const restored = await s.command('restore', { bytes: exported.bytes, sourcePassphrase: passphrase, destinationPassphrase });
  assert.notEqual(restored.newProfileId, originalId); assert.equal(restored.records, 3);
  assert.deepEqual(s.store.rows.get(originalId), original); assert.equal(s.store.rows.size, 2);
  await s.select(restored.newProfileId, destinationPassphrase);
  const writes = s.store.writes; await s.verifyBoth(0); assert.equal(s.store.writes, writes);
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), /fiatCurrency|amountBaseUnits|independent-review/);
});
```
