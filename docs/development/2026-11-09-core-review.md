# Difficult-core continuation — 2026-11-09

This is a source-pinned development handoff, not release approval. The source review, local execution and hosted results below have different scopes. No deployment, funded trade, production key, paid agent workflow dispatch or merge was performed.

## Ref and ownership refresh

| Ref | Observed SHA | Disposition |
| --- | --- | --- |
| main | `300287dcde818a9d10ae301265d00bc7c0877bbb` | Unchanged from the supplied handoff |
| #54, Codex core continuation | `edc66f6a503176302bd17dd1ca073947273f7d9a` | Open; 11 unresolved review threads; #56 contains proposed fixes |
| #56, Claude review repairs | `07b1b9b043e2614d434fa6263db5ee423f20cfa6` | Open draft; base of RQ00 and the isolated lifecycle repair |
| #50, Solana program | `26bf00bef107673734212738d90160385285c81e` | Open draft; independent native program lane |
| #35, journey repairs | `4c5d01c639d05c0ec6ecba9bf162d5fa2a9abf05` | Open draft; does not implement the D9 persisted marker |
| #40, wallet/release stage | `7706859d2385cae0f8e49615392de08dfee83f84` | Open cumulative stage; no contract-wallet transaction adapter |
| #29 / #49 decisions | `89d0a928e9e1127a4c8911f9437359260bd06ab6` / `8fb081b492ccf9ecef4dc47525c753cac670dacb` | Decision records are not ancestors of #56 |

No newer assignment was found in the inspected PR metadata/comments. Existing contributor branches were preserved. New work owns `codex/rq00-evidence-20261109`, `codex/post-send-reconcile-20261109` and `codex/solana-payout-docs-20261109` only.

## Published focused repairs

- [#57](https://github.com/djshellshoxxx/p2p-offramp/pull/57), `7e8d571ae350190e9ba0fdf50a7b9184a4730ad9`, stacked on #50: correct Solana documentation. Failed combined release/payout execution rolls back release too; the seller can commit release separately before the deadline. Existing `tests/native.rs:127–142` and `tests/spl.rs:130–145` already express that behavior. Documentation only; no native rerun claimed.
- [#58](https://github.com/djshellshoxxx/p2p-offramp/pull/58), `af0e1789889790c2050142ed508b5042ef5bcc85`, stacked on #56: remove the lifecycle coordinator's post-send 4001 shortcut. A wallet that broadcasts then throws 4001 must leave `broadcast-unknown`; no fresh attempt is authorized before native reconciliation. Pre-marker cancellation remains unchanged. This is a narrow D9 safety requirement, not full D9 implementation or app integration.

The #58 regression failed on original #56: after simulated nonce-0 broadcast and 4001, a fresh nonce-1 funding intent was accepted. It passes after the repair. Combined journal/lifecycle/execution/wallet-adapter tests: **71/71**, zero skips; full #58 `npm test`: **1,211 pass, 0 fail, 1 Foundry skip**; typecheck and diff whitespace checks pass. Independent source review found no blocking issue. These tests use simulated providers/chains/stores; restart recreates objects over the existing store, not a browser process or IndexedDB crash.

## RQ00 implementation and receipt

Branch `codex/rq00-evidence-20261109` contains the implementation in the commit containing this handoff, stacked on exact #56. `scripts/research/receipts/schema.json` is the structural format; `receipt.mjs` adds canonical-wire, source, status, redaction and independent-policy checks; `cli.mjs` admits records without executing their argv. Node built-ins and existing Git are used; no dependencies or signing keys were added. The public RFC8032 test key appears only in synthetic unit tests and is not an operational trust root.

PASS claims require a valid independently trusted signature plus executed, successful, nonempty checks with no skipped/mocked/unavailable/unverified results. A signature establishes attribution, not execution truth. Every result retains `executionVerified:false` and `releaseAuthorized:false`. The tool validates only explicitly listed source bytes and cannot prove the completeness of a dependency closure or absence of every possible encoded secret.

The 17 adversarial tests pass. Final RQ00 branch `npm test`: **1,226 pass, 0 fail, 1 Foundry-dependent skip** (1,227 total). Before implementation, the test entry failed because the module was missing; this is an implementation-absence baseline, not evidence of a prior product defect. Independent review subsequently reproduced three real tooling defects and drove fixes: quoted/contextual credentials escaped detection, UTF-8 BOM bytes violated the unique encoding profile, and escaped quotes leaked the suffix of a JSON secret. The credential and escaped-quote regressions were observed failing before repair; independent final reproductions now redact/reject them. All 17 cases run from normal `npm test` and the dedicated `npm run test:research:receipts` command.

[The baseline receipt](../evidence/RQ00-20261109/baseline-07b1b9b.json) records the actual #56 unit run with 1,209 passes and one Foundry skip. It is deliberately **UNKNOWN / UNAUTHENTICATED_RECORD**. It includes eight pinned runner/lockfile/fixture/notice files and the existing EIP-712/NIP-44 vector provenance. NIP-44 vector licensing remains explicitly unresolved. This is not a new independent interoperability experiment or a complete fixture inventory.

The receipt was admitted against a separate clean checkout of `07b1b9b043e2614d434fa6263db5ee423f20cfa6` using:

```sh
node scripts/research/receipts/cli.mjs verify \
  --receipt docs/evidence/RQ00-20261109/baseline-07b1b9b.json \
  --root /path/to/07b1b9b-checkout \
  --repository https://github.com/djshellshoxxx/p2p-offramp \
  --commit 07b1b9b043e2614d434fa6263db5ee423f20cfa6
```

The CLI returned UNKNOWN, UNAUTHENTICATED_RECORD, null signer, executionVerified=false and releaseAuthorized=false. Missing external attestation is not silently promoted into a pass.

## Corrected D9 and journey inventory

At #35 and #56, `packages/schemas/src/intent.ts`, `packages/domain/src/intent-journal.ts`, and the original `tx-lifecycle.ts` have identical blobs. There is no `sendMarkedAt` implementation in #35's packages/apps/scripts. The earlier status claim that D9 was implemented there was incorrect.

The accepted Option A packet at #29/#49, `docs/adr/proposed/D9-durable-send-marker.md`, requires atomic write-once marker persistence, dual exact parsers, conservative legacy/imported-snapshot treatment and explicit old-build behavior. It reserves the persisted version number for the owner. Lines 24, 30 and 50 already reject the post-marker 4001 shortcut addressed by #58. Full D9 remains blocked on the version/migration/provenance contract and funded restart qualification.

Current browser storage already has encrypted revision CAS and strict IndexedDB commit durability; that is not durable historical proof that a restored record was never sent. `backup-service.ts` restores journal records without such provenance. The separate Sepolia CLI attempt ledger and file lock are not browser D9 evidence.

Do not copy #35 wholesale: its F01 changes add a 300-second release refusal, whereas #31's stated acceptance requires release before actual expiry. F02 depends on full D9. F03 deferred payout and F06 same-material negotiation retry are later focused candidates. F04 relay dedupe and generic-reader F05 decoded HTTP bounds already have newer repairs in #56; directory replacement would regress them.

## Corrected #40 inventory

The read-only EIP-1271 verifier is already in #54/#56 and returns test-only evidence with economic preparation disabled. #40's remaining `evm-execution.ts` change hardens generic provider cancellation/admission; it contains no contract-wallet transaction execution. `scripts/test-eip1271-local.mjs` deliberately separates fixture-account sends from verifier reads (`adapterSendsOrSigns:0`). Contract-wallet transaction execution remains unimplemented/unqualified.

Small extraction candidates, each requiring its own tests/review:

1. Generic execution hardening and its tests. Preserve #54's additional EIP-1271 calldata/negative tests.
2. Native read-only EIP-1271 fixture script and Solidity mock; this qualifies verification only.
3. Internal signed **asset** update controller, HTTP reader, floor store and tests. Its manifest accepts empty deployments only and reports `deploymentsVerified:false` / `releaseEnabled:false`.

The update controller misclassifies strict JSON/UTF-8/duplicate-key envelope failures as `unreachable/UNAVAILABLE`. Repair the parse boundaries to return an untrusted result while preserving actual transport errors, and assert zero storage/navigation. The reviewed files remain identical through #48; later stages do not fix this. #40's README browser commands refer to files introduced in #42 and rely on missing runtime/Worker APIs, so they cannot be treated as reproducible #40 browser evidence.

D1 Option B and D9 Option A are accepted on the decision branches; D2/D3 remain proposed. D1 still reserves exact acceptance version/fields, byte budget, restore lifecycle and contract-wallet policy. D3 still reserves deployment identity/ABI binding, historical archive retention and predecessor/rotation policy. Asset updates do not resolve those choices.

## Solana qualification limits

Reviewed fund/settle/payout sources bind parties, asset, amount, nonce, program/genesis, deadline, PDA/ATA and payout recipient; no new program defect is claimed from this bounded review. There is still no Wallet Standard/client journal/recovery adapter in the reviewed tree and only a synthetic localnet profile.

The successful [Solana program run](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/41808111021) checked out merge SHA `deb471ee1a90b6fa02fd19c07c061cb02eebc66c`, not #50 head alone. Its logs report vector, build, LiteSVM and IDL success; its artifact list is empty. The [CodeQL run](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/41808104877) still has a JavaScript/TypeScript failure at result upload; accessible logs do not establish the cause. No native Solana toolchain was run here.

Source review confirmed committed Cargo/toolchain/IDL pins. The reviewer compared Agave 4.1.2 and Anchor 1.2.2 publisher release digests with workflow pins. Target platform-tools archive/target compiler provenance and a retained hosted SBF digest remain unqualified. The documented path-dependent build and target-cluster feature requirements remain open. A historical localnet fixture or local simulator run does not establish devnet/mainnet compatibility.

## Hosted checks and concrete Sonar findings

On #56 head `07b1b9b`, GitHub reports seven successful workflow checks: inventory, specs, schemas-and-crypto, browser, local-evm, local-trade and forge. CodeRabbit is skipped because the PR is draft. SonarCloud check `128298692341` fails. Its GitHub annotations identify:

| Path | Annotation | Issue |
| --- | --- | --- |
| `scripts/sepolia/trade.mjs:112` | Path Traversal via faulty LLM-supplied CLI arguments | `AaG0MbzxZh2DBWnle6tc` |
| `.github/workflows/openai-agents.yml:50` | Omitting `--ignore-scripts` allows lifecycle scripts during package installation | `AaG0Ln1hWrHHQUT4UY6d` |

The annotations were retrieved from GitHub's public API; the connector rejected that subresource and the Sonar issues API returned HTTP 403. Rule keys/full taint traces remain unavailable. The lock-path question requires reconciling the deliberately supported operator-selected state path with the intended filesystem confinement boundary. Neither suppression nor a speculative path restriction was applied. The lifecycle-install warning needs a pinned CLI installation smoke check before changing the workflow. No gate is represented as fixed or green.

## Local baseline at #56

Node `24.22.1`, npm lockfile installation with lifecycle scripts disabled; CPython `3.12.14` with the repository's hash-pinned cryptography `50.0.0`, cffi `2.1.1`, pycparser `3.0` closure. No dependency versions or lockfiles changed.

| Exact command | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Installed successfully |
| `npm test` | 1,209 pass, 0 fail, **1 skip**: `cast calldata` comparison requires Foundry |
| `npm run typecheck` | All four projects pass |
| `npm run check:boundaries` | 126 production files / 64 graph modules; pass |
| `npm run check:specs` | 173 documents, zero broken links/unindexed; not semantic approval |
| `npm run test:build-policy` | 26/26 pass |
| `PATH="<venv>/bin:$PATH" npm run test:specs` | 15/15 pass with the pinned CPython closure |
| `npm run build` | Static build passes; signedRelease=false, releaseAcceptance=false |
| `P2P_CHROMIUM=/usr/bin/chromium npm run test:browser` | **BLOCKED at launch**: Chromium `socket() failed: Operation not permitted`; no browser assertion completed |

Foundry/Anvil native runs, Solana native runs, physical/mobile wallets, live relays/RPCs and public testnet trades were not performed. Browser launch was attempted rather than assumed unavailable. These limits do not invalidate the narrower unit results or qualify the missing environments.

## Next actions

1. Review RQ00 receipt tooling and the separate #57/#58 changes; resolve #56's concrete Sonar findings using the full rule context and intended output-path policy. Owner review remains required for Tier C integration.
2. Resolve D9 persisted version/compatibility/import provenance, then implement the actual marker and full funded-restart boundary matrix. Do not count #58 as full D9 or browser completion.
3. Extract the small #40 slices above, repair envelope classification, and qualify browser composition separately. Preserve funds-disabled trust defaults.
4. Reconcile D1's reserved acceptance contract before implementing signed peer acceptance; build independent vectors and downgrade/tombstone tests.
5. Use receipts for independent Nostr/relay experiments and source-qualified Solana builds. Record hosted merge SHAs, actual artifact hashes, skips and unknowns; no mock-to-live promotion.

`ReleaseEnabled=0`, unapproved allowlists and original escrow exit rights remain unchanged. All new PRs are drafts; no merge authorization is inferred from passing local tests.
