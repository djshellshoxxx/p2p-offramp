# T38-E build and operations audit

Fresh complete semantic read:56 production/config/data files (6020 initial lines), plus35 supporting inventory files. Start `7ff6e9faaf0ec4c1ffbc2fb28b3003396b485f4b` on `autonomous/completion-20261102`. UI/current WIP and T87 proof-jobs excluded.

Two P2 findings were found and repaired under the root-authorized T88 transfer; distinct independent review remains required.

- **T38-E-01:** private RPC query values copied into public endpoint paths bypassed the whole-query leak check. The bounded guard now checks individual raw/decoded/encoded values, including repeated and short values.
- **T38-E-02:** resumed uncertain sends could submit the same action again. Fixed per-kind fund/release/refund attempt history now persists before the send boundary and refuses repeats. Proven funding keeps its first distinct exit; prior release evidence does not block a first timeout refund. Unknown legacy evidence stays restrictive; terminal reconciliation stays read-only.

Fresh selected audit checks:130 passed with managed IPC. T88 changed-path checks:24 passed, zero failures/skips/cancellations; both repairs retained meaningful RED evidence. The restricted run showing only9 file wrappers is excluded from usable evidence.

All reputation lock139 entries passed the static exact-version/HTTPS-npm/SHA512/no-link/no-install-script checks and retained package/lock hashes. This is not a new network vulnerability audit.

Historical T57/T61/T63/T79/T86 execution receipts are reused only as scoped unchanged-file evidence. No new browser/native/Docker/full-suite, deployment, signing, production trust, funds enablement, paid resource, external publication/message, ledger edit or commit is claimed. Root owns final enrollment/hash refresh and exact-head consolidated verification.

[T88 frozen packet](../reviews/T88-cli-author.json) · [Exact inventory, per-file checks, hashes and limits](build-ops.json)

The packet is the committed copy of workspace-local `/workspace/work/t88-review-packet.json` (5,815 bytes, SHA-256 `ef8d90ea6b46ce0c6855f1a65f36a49aa1734c7ab2f7b639be5b0a2150d9d59f`, bound in [T89](../reviews/T89-author.json)). The original `/workspace/work/audit-build-ops.json` is workspace-local, not committed.

## Production file coverage

| File | Semantic review |
|---|---|
| `.devcontainer/Dockerfile` | Immutable Node image digest, checksum-bound Foundry/solc downloads, fixed extraction, unprivileged final user. No key, deploy command or public RPC service. |
| `.devcontainer/devcontainer.json` | Only frontend3000 forwarded; other auto-forwarding ignored, visibility unverified; npm ci --ignore-scripts and fixed fake-funds foundation recipe. |
| `.github/workflows/evm-escrow.yml` | Read-only token, immutable action references, Foundry1.5.1 and active ABI/native/journey checks; no publication/deploy. Node24/Chromium stable remain observed moving CI tools, not reproducibility witnesses. |
| `.github/workflows/specifications.yml` | Read-only token, immutable checkout/Python actions, catalog audit and committed-inventory diff remain required; no generated approval. |
| `.github/workflows/vault-foundation.yml` | Read-only token, immutable actions, full history for immutable evidence, active type/package/CLI/policy/docs/distribution/browser gates. Root owns later final enrollment deltas. |
| `apps/web/scripts/artifact-policy.mjs` | Conservative token sink/network checks handle escapes/templates/regex without evaluation. Final artifact path/count/size/resource/map/private-key checks complement browser evidence; no complete XSS claim. |
| `apps/web/scripts/build.mjs` | Default/demo/testnet separation enforced from final bytes/actual graph; Worker/license/graph assets required. Fixture trust-pin seam needs explicit library paths and cannot be selected through CLI/env. Unsigned funds-disabled evidence. |
| `apps/web/scripts/source-locale.mjs` | Maintained English source supplies shell strings; exact one-time placeholders and HTML escaping; no runtime locale fetch or imported translation authority. |
| `apps/web/scripts/static-build-plugin.mjs` | Actual document/Worker graphs exclude external/test/signing/unreviewed-dependency modules and hash/token-check owned sources. CSP precedes resources; header recipe does not attest hosting. |
| `apps/web/scripts/testnet-trust.mjs` | Null maintained pin refuses before reads; exact signer fingerprint/signature/registry/Sepolia identity and accepted sequence/digest checks. Adjacent labels and programmatic fixture overrides do not supply default/CLI trust. |
| `packages/claims/index.ts` | Exports bounded descriptions and explicit maintained verification seam; no default trusted/tested claim. |
| `packages/claims/src/claims.ts` | Descriptor-safe exact detached records, strict JSON/UTF-8/calendar/list/path bounds, duplicate refusal. Tested copy requires current full-claim/source/evidence/profile verification before/after trusted callback; editorial projection confers no approval. |
| `packages/diagnostics/index.ts` | Local allowlisted diagnostics only; fixed enums, no vault/network/upload port. |
| `packages/diagnostics/src/diagnostics.ts` | No raw errors/URLs/identities; branded live release/schema/clock gate;500 events/1MiB/seven-day pruning. Identity/epoch/ring/byte-bound final export; revocation purges disposable metadata, failed erase consumes old leases. |
| `packages/extensions/index.ts` | Optional offline registry facade absent from default app; no terms/wallet/network/spend capability. |
| `packages/extensions/src/manifest.ts` | Descriptor snapshots reject getters/proxies/sparse/custom arrays. Exact version/capability/hash limits;64KiB/depth16/node4096 proposal budget before trusted parser. |
| `packages/extensions/src/registry.ts` | Exact registered capability/schema sets negotiate atomically. Detached scoped reads and validated proposals retain core authority. Generation/cancel revoke before cleanup; physical initialization drains. Bundled code is not a same-origin sandbox. |
| `packages/governance/index.ts` | Inert records/assurance only; status/reviewer/legal strings do not authorize execution/release. |
| `packages/governance/src/assurance.ts` | Exact bounded descriptor-safe role/jurisdiction/attack/incident inputs, real calendar dates,<=90-day claimed review windows. Revision changes invalidate bindings; packets deny legal/release/custody/evidence authority. |
| `packages/governance/src/records.ts` | Exact bounded decisions/proposals, path/hash/version/duplicate refusal; createCoreError independently allowlists codes. Explicit compatibility tables always deny economic preparation. |
| `packages/security/index.ts` | Facade omits proof registration writer, updater trust configuration, signing/storage/network/install authority. Acceptance result is consistency only. |
| `packages/security/release-context.ts` | Narrow lease revalidation entry excludes verifier/internal proof writer from read-only consumers. |
| `packages/security/src/acceptance-gates.ts` | Detached bounded exact record/candidate graph; source/digest/target/role/freshness checks, acyclic supersession and mandatory/advertised target coverage. Only separately injected trusted exact-scope review verifier authenticates review; reports deny promotion/runtime/release. |
| `packages/security/src/content-policy.ts` | Bounded exact UTF-8/UTF-16/plaintext controls and bidi checks; explicit HTTPS link rejects credentials/query/fragment. Offline CSP allows no external connections and cannot attest deployed framing protection. |
| `packages/security/src/crypto-inventory.ts` | Own-data/byte snapshots precede async hashes; bounded exact graph/vector/browser-profile metadata checks. Candidate/test review cannot silently qualify production; metadata releaseEligible remains narrower than product approval. |
| `packages/security/src/release-locator.ts` | Canonical narrow CIDv1/4096-byte locator; same live branded manifest/signer/channel/sequence/time/digest bindings. Optional256MiB archive is hash-checked only; no extraction/install authority. |
| `packages/security/src/release-manifest.ts` | Canonical wire/signature domain/P256 key fingerprint and scalar ranges; complete raw assets with path/case/count/size bounds; sequence+digest rollback. Sticky proof rechecks every await/lookup; clones and unresolved nonempty deployment schema refuse. |
| `packages/security/src/release-proof.ts` | Private WeakMap result identity, register once, live lease revalidation; writer omitted from facade. Explicitly not a sandbox against same-origin executable replacement. |
| `packages/security/src/release-update-http.ts` | G05 permit/capture with exact HTTPS/no redirect/credentials/referrer, bounded declaration/chunks/native bytes. Single physical admission survives logical cancellation; reader/scopes dispose and chunks wipe. |
| `packages/security/src/release-update-store.ts` | Separate public origin-local rollback IndexedDB; exact channel/key/sequence/digest, strict durability/CAS and native transaction cancellation/owned close; never vault data. |
| `packages/security/src/release-update.ts` | Absent compiled trust refuses without other ports. CID-specific HTTPS origin, monotonic sequence floor, verified assets/locator/schema, opaque candidate identity, explicit gesture/current backup/quiescence/lock before navigation. Physical job ownership survives cancellation; release remains disabled. |
| `scripts/acceptance-report.mjs` | Bounded nonblocking/no-follow file reads, JSON depth/duplicate refusal, fixed error identity. No CLI review callback or executable policy loading; imported records cannot self-approve. |
| `scripts/distribution/manifest.mjs` | Exact allowlisted public asset/source byte/hash inventories and tool/lock/source identities. All approval flags false; explicit missing trust/witness/host/deployment evidence. |
| `scripts/distribution/stage.mjs` | Stable bounded no-follow reads and strict directories/files. Sanitized offline children, two actual byte-equal builds, source/graph/tool rechecks, new output only and inode-owned temp cleanup. No signer/extractor/publication/deploy action. |
| `scripts/docs/generate.py` | Fixed seven local wiki pages and proposed/unsupported canonical claims. Real source/copy hashes bind immutable HEAD; reviewer/release/publication authority remains empty. |
| `scripts/docs/validate.mjs` | Bounded stable no-follow source and git-show byte equality. Canonical claims/copy mapping and closed Markdown/link/anchor/hash grammar reject stale evidence; consistency is not semantic approval. |
| `scripts/formal/evm.mjs` | Pinned tool artifact/version/source/ABI, finite compiler/query/solver/output budgets, owned process-group termination. Source-span/AST/native deferred-credit results narrowly classified; unknown compiler/whole-contract results remain unknown. T86 runner unchanged. |
| `scripts/governance/check-all.mjs` | Finite directory/packet enumeration, canonical checker, no executable evidence or imported reviewer trust. |
| `scripts/governance/check.mjs` | Root-contained paths, stable descriptor/name identity, nonblocking/no-follow bounded reads and aggregate cap. Required artifact hashes match actual bytes; inert statuses and no file execution. |
| `scripts/lab/command.mjs` | No shell; finite logs/timeout/cancel and only detached child-owned process-group signaling, including successful-parent descendants. Existing T86 test observation repair was not reimplemented. |
| `scripts/lab/recipe.mjs` | Exact local Node/npm/Foundry/solc and effective recipe; fixed container/lock/fixture hashes with bounded symlink-safe reads. Environment excludes keys/RPC/publication credentials; visibility unknown, Solana/physical/production unsupported. |
| `scripts/lab/run.mjs` | Only fixed foundation/journey commands under clean environment; local0600 logs/reports with failure/bound/cancel classification. No deploy/publication/provisioning command. |
| `scripts/lib/chromium-path.mjs` | Explicit operator/browser-fixture executable selector and known path patterns; no download or production browser qualification. |
| `scripts/lib/is-main.mjs` | Canonical realpath entry detection supports symlinks and refuses eval/print/query/hash preload aliases; imports do not launch tools. |
| `scripts/portal/build.mjs` | Fixed real public source references, stable bounded no-follow reads, closed scriptless grammar/CSP/local links. New directory, exact retained artifact/report check and null-key policy; no authenticated executable/wallet/deployment proof. |
| `scripts/portal/policy.mjs` | Scripts/connect/workers/forms/objects/frames denied; host recipe adds frame-ancestors/X-Frame-Options. Generated recipe is not actual hosting evidence. |
| `scripts/reputation/evaluation-remediated/package.json` | Private isolated experimental Node-only graph, exact direct versions and five explicit transitive overrides; no root/app provider install or vendor compatibility approval inferred. |
| `scripts/reputation/semaphore-v4-evaluation.mjs` | Public synthetic probe only. Pin/tree/artifact/source bounds before unprivileged read-only no-network/cap-drop Docker execution with CPU/memory/PID/time/output caps. Single admission and confirmed owned cleanup/sticky retirement. Application/issuer/score/browser/release qualifications remain false. |
| `scripts/reputation/semaphore-v4.pins.json` | Read all artifact/package/source/license/registry-signature/tool/limit/qualification rows. Exact SDK4.14.5/artifact4.13.0 separation and override graph hashes; affected original project remains passive history. Registry assertions/math proof are not issuer/root/score authority. |
| `scripts/sepolia/deploy.mjs` | Public endpoint/leak/chain/genesis/source/toolchain guards before CREATE. Exclusive fsynced account/nonce unknown-attempt guard before Forge; native matching reconciliation required to clear uncertainty. No actual deploy during audit. |
| `scripts/sepolia/lib.mjs` | Sanitized Forge environment/effective pinned compiler recipe, bounded RPC and fixed diagnostics. T38-E-01 query-value disclosure found and repaired under T88; author delta awaits separate independent review. |
| `scripts/sepolia/owner-release.mjs` | Explicit owner-only keygen/sign, P256 canonical domain/fingerprint, private0600/no-overwrite key output, Sepolia/record/finality checks. Registry-only manifest is not canonical recovery ABI/bootstrap/production trust. No signing performed. |
| `scripts/sepolia/record-deployment.mjs` | Native exact CREATE address/input/runtime/allowlist/chain/genesis/receipt/header inclusion and optional crosscheck. Finality read natively; unknown cleanup requires finalized matching account/nonce and unchanged guard. releaseEnabled0. |
| `scripts/sepolia/send.mjs` | One Forge call, gas cap, isolated broadcast records, exact requested sender/to/data/value/gas and bounded receipt reads. Raw diagnostics withheld, owned cache/temp cleanup. T38-E-02 repaired in caller using before-send fixed kind history; no change here. |
| `scripts/sepolia/trade.mjs` | Read full native/terms/signature/amount/party/deployment/reorg/exit flow. T38-E-02 found: missing before-send history allowed resumed resubmission. T88 adds fund/release/refund maxone-each history, conservative legacy migration, durable before-boundary save, repeated-kind refusal, first distinct timeout exit and read-only terminal reconciliation; author delta awaits independent review. |
| `scripts/sepolia/verify-release.mjs` | Same null-pin G15/Sepolia checks and live guarded registry as build; explicit accepted sequence/digest action. Library fixture options/imported metadata are not default production trust. |
