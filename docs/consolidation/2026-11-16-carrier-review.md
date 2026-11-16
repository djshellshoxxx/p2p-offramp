# Consolidation and peer-carrier review — 2026-11-16

Candidate branch: `codex/review-consolidate-20261116`. Local functional checkpoint (not a hosted commit ID): `f366c30a8900653104c19dc749fa31f7f4ec2867`.

## Integrated source

| Source | Exact source head | Result |
|---|---|---|
| Peer acceptance, encrypted replay and completion baseline | `b3f508420e63329ab30e1b646f61337020a1ebad` | Base of this candidate; PR #124 source preserved |
| Latest development ledger | `174308d61e6a7771227f7b1d0825d94eda64cbd2` | Merged by ancestry without replacing D1 work |
| Remaining Wiki-source qualification notes | `c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf` | Merged remaining two-file delta; live Wiki not published |

Local commit `f415cee` adds the private bounded EOA carrier and browser qualification fixture. Local commit `f366c30` adds independent Solidity/EVM vector checks. Publication uses the connected GitHub Git-data API because native Git push has no credentials in this host. The published commit preserves all three source heads as parents and must have the exact tested local tree. Local commit identifiers above are work-log checkpoints, not hosted links. The escrow implementation and its ABI are unchanged. Main and release settings are unchanged. No branch was deleted or force-pushed.

## Implementation and evidence

- Candidate v2 carrier has exact own-data fields, duplicate-key refusal, a 24,576-byte aggregate cap, 16,384-byte decoded terms cap, two fixed 65-byte signatures, immutable parsed data and strict version separation from v1.
- Offline carrier verification binds the locally authenticated conversation, selected advertisement, locally reviewed order/revision, local registry domain, sender/recipient keys and a maximum 3,600-second message lifetime. It returns no economic authority.
- Four fixed seller/buyer × native/ERC-20 vectors now also pass independent Solidity ABI encoding and EVM ecrecover. Checks reject substitution of terms/binding signatures and changes to role, key direction, expiry or domain. This is independent implementation evidence, not an independent human review.
- Added `npm run test:peer:browser` and its CI step. It tests real encrypted IndexedDB CAS across tabs, full page reload, stale duplicate refusal, portable fresh-profile tombstone restore, lock and the old-backup limitation.
- Local browser execution is BLOCKED before assertions: Chromium exits at `process_singleton_posix.cc` because `socket()` returns `Operation not permitted`. The fixture bundles successfully. Hosted browser execution remains pending. No browser pass is claimed.

| Check | Observed result |
|---|---|
| Node 24.22.1, locked dependency install | Pass, lockfile unchanged |
| Full package/UI suite with Foundry/cast available | 1,324 pass, 0 fail, 0 skip |
| New carrier tests | 8/8 pass (included above) |
| Combined Foundry CI profile, 1.5.1 / solc 0.8.30 | 86/86 pass; 4,096 fuzz runs and 256 × 100 invariant settings |
| New Solidity peer vector tests | 4/4 pass |
| Canonical viem native differential checks | 32/32 pass; unit suite 9/9 |
| Encrypted local EVM exchange | 12/12 checks pass |
| Portable recovery | 15/15 unit tests and 6/6 native scenarios pass |
| TypeScript / import boundaries | Pass; 129 source files, 64 core modules |
| Artifact/build policy | 28/28 pass |
| Default production build | Pass; 9 files, 468,307 bytes; release acceptance false |
| Python specification tests / audit | 20/20 pass; 173 documents; zero broken links |
| Browser / physical devices / public testnet / independent review | Browser locally blocked; others not performed |

## Work still open

1. Review candidate fields and carrier before protocol adoption. Native account classification, both-statement ERC-1271 verification, delegated-account policy and action-time rechecks remain incomplete.
2. Wire authenticated NIP-17 receive, offer/accept state transitions and cancel/reject tombstones to the live session. The new private carrier intentionally does not claim this integration. v1 remains negotiation only.
3. Define old-backup freshness and identity rotation. A backup exported before cancellation cannot learn later tombstones offline; the browser fixture explicitly tests this limitation with economic authority still false.
4. Finish localnet browser trading composition and two independent wallet prompts; qualify crash, reload, account/chain changes, rejection and physical mobile/QR flows.
5. Review and qualify the separate Solana source, payment-proof integrations, disputes and remaining locale/accessibility work. D7 optional modules remain deferred until core gates and per-feature intake.
6. Exact final-head CI, independent security/contract review, owner trust roots, approved testnet deployments and real two-party acceptance are still required before release. `ReleaseEnabled=0`.

## Historical branch intake

Inspected 138 actual remote branch tips (symbolic HEAD excluded). 79 are ancestors of this candidate. The table records provenance, not a claim to have reviewed every historical line. An unmatched commit may be an adapted or partially extracted change; it is not automatically a missing feature. Counts exclude merge commits and use Git patch equivalence.

The old split stacks combine superseded core implementations, optional packages and historical evidence. Blindly merging their complete trees would reintroduce old behavior. Solana remains a separate native program/adapter qualification track; the historical custodial-ledger prototype conflicts with the current noncustodial architecture. These were inventoried and retained, not silently enabled.

| Branch | Head | Intake |
|---|---|---|
| `autonomous/completion-20261031` | `b3519180eb56` | Included by ancestry |
| `autonomous/completion-20261102` | `94554ecf9854` | 68 unmatched commits; review/adapt before integration |
| `autonomous/continuation-20261031` | `320fc4bcc900` | Included by ancestry |
| `autonomous/guidance-20261101` | `c8494b05e36c` | Included by ancestry |
| `autonomous/journey-20261101` | `3947074c95fa` | Included by ancestry |
| `chatgpt/zero-codex-continuation-spec-20261109` | `62c6c14539cc` | 1 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/acceptance-cli-input-bounds-20261110` | `2ba1a4e18f46` | Included by ancestry |
| `chatgpt/zero-codex/acceptance-review-boolean-20261110` | `08a9cf1e9abc` | Included by ancestry |
| `chatgpt/zero-codex/audit-evm-schema-20261110` | `353b3d18eee6` | 30 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-cross-deployment-nonce-20261111` | `c153a99dd5c8` | 1 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-marker-failure-20261110` | `44ca5fcf5e5d` | 2 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restore-regression-20261110` | `78af7214a1aa` | 3 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-account-isolation-20261111` | `b19ae4637538` | 13 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-casefold-20261110` | `f393c365937c` | 9 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-cross-network-nonce-20261111` | `dd5cf16da0c7` | 11 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-hash-conflict-20261110` | `146d06d81474` | 8 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-pending-20261110` | `94778c3282a9` | 7 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-prepared-20261110` | `92cc054ce9a2` | 5 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-race-20261111` | `e8afa6af3db9` | 14 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/d9-restored-terminal-20261110` | `06305ebaccd9` | 4 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/docs-static-offers-status-20261116` | `30efa0e158c6` | Included by ancestry |
| `chatgpt/zero-codex/docs-wiki-20261110` | `c14cfd07a440` | Included by ancestry |
| `chatgpt/zero-codex/g05-transport-path-binding-20261111` | `053056975ed0` | Included by ancestry |
| `chatgpt/zero-codex/g12-erc20-withdraw-binding-20261111` | `9786b221552f` | Included by ancestry |
| `chatgpt/zero-codex/g12-native-withdraw-recipient-20261111` | `84bb67f6e438` | Included by ancestry |
| `chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111` | `619fc7413fa6` | Included by ancestry |
| `chatgpt/zero-codex/g16-bilateral-replay-20261111` | `969d02aecf86` | Included by ancestry |
| `chatgpt/zero-codex/g18-final-chain-recheck-20261111` | `921f06776918` | Included by ancestry |
| `chatgpt/zero-codex/g18-receipt-own-data-20261111` | `c16e7617f0c5` | Included by ancestry |
| `chatgpt/zero-codex/g20-chat-scope-regression-20261111` | `a5c74990f0f5` | Included by ancestry |
| `chatgpt/zero-codex/g25-public-endpoint-regression-20261110` | `e0a9033158d1` | Non-merge patches equivalent; branch history retained |
| `chatgpt/zero-codex/g26-clear-reentrancy-20261111` | `548495515c83` | Included by ancestry |
| `chatgpt/zero-codex/http-buffer-lifecycle-20261110` | `5f2381ab42c2` | Non-merge patches equivalent; branch history retained |
| `chatgpt/zero-codex/qualify-pr61-20261110` | `a1930a3596f7` | 30 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/recovery-reference-identity-20261115` | `85849f7b267d` | 1 unmatched commits; review/adapt before integration |
| `chatgpt/zero-codex/registry-concurrency-20261110` | `a213166ea83a` | Non-merge patches equivalent; branch history retained |
| `claude/adoring-wozniak-850ue6` | `81c2dc889fa2` | Included by ancestry |
| `claude/compassionate-gauss-uyhfih` | `970ac80f08c0` | 1 unmatched commits; review/adapt before integration |
| `claude/confident-fermi-g6wjp3` | `174308d61e6a` | Included by ancestry |
| `claude/docs-screenshots` | `c1e31918ed5e` | Included by ancestry |
| `claude/friendly-dijkstra-nsi310` | `bd26833555e1` | 4 unmatched commits; review/adapt before integration |
| `claude/gifted-faraday-73kydc` | `8fb081b492cc` | Included by ancestry |
| `claude/loving-einstein-xgzvdy` | `e82f1b5f9629` | 92 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-decisions` | `89d0a928e9e1` | Included by ancestry |
| `claude/loving-einstein-xgzvdy-journey` | `4c5d01c639d0` | 100 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s01-tooling` | `81a295d5cd39` | 3 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s02-core-contracts-storage` | `71a56d10405b` | 5 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s03-core-messaging` | `404dc3daa8b1` | 7 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s04-wallet-release` | `7706859d2385` | 8 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s05-web-locale-leaf` | `dd2a648140e7` | 10 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s06-web-runtime-ui` | `58b3c876ae60` | 13 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s07-native-journey` | `bc549f477f86` | 16 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s08-portal-lab-docs` | `f8a9aa143012` | 19 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s09-intake` | `5a9997485b9d` | 21 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s10-optional-packages` | `0baa3c1ae5a7` | 24 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s11-governance-ci` | `14d7c5e26796` | 27 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-m0-s12-evidence` | `494703e83789` | 28 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s00-ci-triggers` | `a88560741e60` | Included by ancestry |
| `claude/loving-einstein-xgzvdy-s01-tooling` | `4e319013ea61` | 1 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s02-core-contracts-storage` | `01344cbd6655` | 2 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s03-core-messaging` | `5a747ded358e` | 3 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s04-wallet-release` | `4ebe660f0514` | 4 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s05-web-locale-leaf` | `72bdf9f521db` | 5 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s06-web-runtime-ui` | `14be5a1c1ec6` | 6 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s07-native-journey` | `8f0e5e245ee8` | 7 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s08-portal-lab-docs` | `c950dad4b387` | 8 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s09-intake` | `389c0ea69e24` | 9 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s10-optional-packages` | `c696c02b94eb` | 10 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s11-governance-ci` | `789b2b2c2644` | 11 unmatched commits; review/adapt before integration |
| `claude/loving-einstein-xgzvdy-s12-evidence` | `001c31cc868b` | 12 unmatched commits; review/adapt before integration |
| `claude/p2p-offramp-evm-escrow-vc7stk` | `edc8a6971819` | Included by ancestry |
| `claude/p2p-offramp-integration-aan57u` | `48074e750cf6` | Included by ancestry |
| `claude/p2p-offramp-prompt-lqcgno` | `25a01987385b` | 3 unmatched commits; review/adapt before integration |
| `claude/post-merge-followups` | `ec65012dbb94` | Included by ancestry |
| `claude/quirky-knuth-3s6ysy` | `2f839b127687` | 1 unmatched commits; review/adapt before integration |
| `claude/recovery-consolidation` | `7586b5fd0a9d` | Included by ancestry |
| `claude/sleepy-fermat-4s6ocx` | `e2e25cf0f5aa` | 13 unmatched commits; review/adapt before integration |
| `claude/sweet-noether-arf6ne` | `391653eaba94` | Included by ancestry |
| `claude/sweet-shannon-grykla` | `7165626c17d8` | Included by ancestry |
| `claude/tender-goodall-db3cot` | `8783636e7a17` | Included by ancestry |
| `claude/trade-review-integration` | `1450c537dead` | Included by ancestry |
| `claude/vibrant-cray-ny4gum` | `a45e932a3715` | 13 unmatched commits; review/adapt before integration |
| `codex/completion-20261116` | `88f9e40bbf8e` | Included by ancestry |
| `codex/consolidation-20261116` | `274d4fe533f4` | Included by ancestry |
| `codex/consolidation-ledger-20261104` | `d5b959b5ed73` | Included by ancestry |
| `codex/continue-completion-20261116` | `e7506c22e6b0` | Included by ancestry |
| `codex/core-continuation-20261104` | `edc66f6a5031` | Included by ancestry |
| `codex/d9-migration-20261116` | `c1f8e750beb7` | Included by ancestry |
| `codex/foundation-gates-20261104` | `77fb7c52dcdd` | Included by ancestry |
| `codex/peer-acceptance-20261116` | `b3f508420e63` | Included by ancestry |
| `codex/post-send-reconcile-20261109` | `af0e17898897` | Included by ancestry |
| `codex/rq00-evidence-20261109` | `a13690972104` | Included by ancestry |
| `codex/setup-autonomous-agent-20261104` | `54e632f8f472` | 2 unmatched commits; review/adapt before integration |
| `codex/solana-payout-docs-20261109` | `7e8d571ae350` | 7 unmatched commits; review/adapt before integration |
| `docs/lean-release-handoff-2026-10-24` | `474f0505a409` | Included by ancestry |
| `docs/offramp-research-tools-execution-plan-20261106` | `0f1792f589a2` | 2 unmatched commits; review/adapt before integration |
| `docs/security-spec-expansion-20261021` | `0ea82ded188e` | Included by ancestry |
| `docs/spec-readiness-and-foundations` | `6b6004bdf35b` | Included by ancestry |
| `feat/custodial-ledger-foundation` | `52e6987e77d9` | 16 unmatched commits; review/adapt before integration |
| `fix/remediation-09f20d73-9524c0` | `9f5201dd44a8` | Included by ancestry |
| `fix/remediation-f84468d6-0a97ed` | `dba5072d7a67` | Included by ancestry |
| `gpt/p2p-beta-spec-20261109` | `c4fb7b590639` | Included by ancestry |
| `integration/all-compatible-work` | `dce515996f3e` | Included by ancestry |
| `integration/m2a-safe-fixes-20261114` | `c0bbfe629518` | Included by ancestry |
| `integration/p2p-consolidated-20261109` | `f2950cf29a69` | Included by ancestry |
| `integration/pages-beta-qualification-20261112` | `4dcddf2b4bcc` | Included by ancestry |
| `integration/pages-offline-recovery-20261112` | `9550d4b18280` | Included by ancestry |
| `integration/privacy-endpoint-disclosures-20261109` | `07b3b2abfc54` | Included by ancestry |
| `main` | `cdde998cf1d0` | Included by ancestry |
| `parallel/accessibility-recovery-panels-20261113` | `db38fba65be8` | Included by ancestry |
| `parallel/browser-cold-nonce-20261113` | `2cacd1d5219a` | Included by ancestry |
| `parallel/browser-cold-recovery-20261113` | `65efc3428ff0` | Included by ancestry |
| `parallel/browser-peer-offer-20261113` | `d6d65a47b99e` | Included by ancestry |
| `parallel/browser-runtime-engines-20261113` | `378fdf92c0b9` | Included by ancestry |
| `parallel/cli-argument-regression-20261113` | `605bcd24ef3d` | Included by ancestry |
| `parallel/diagnostics-20261113` | `330fa1ede8b7` | Included by ancestry |
| `parallel/docs-web-profile-recovery-20261113` | `3524096c0ff1` | Included by ancestry |
| `parallel/locale-20261113` | `c4b13ddccc5b` | Included by ancestry |
| `parallel/localization-blank-warning-20261113` | `718208880b65` | 11 unmatched commits; review/adapt before integration |
| `parallel/portable-recovery-guide-20261113` | `05794e754c8b` | Included by ancestry |
| `parallel/recovery-builder-help-20261113` | `4f75e00d0c8e` | Included by ancestry |
| `parallel/spec-tool-20261113` | `6d48c9b0695c` | Included by ancestry |
| `parallel/tooling-source-correspondence-20261113` | `32a405216355` | Included by ancestry |
| `research/code-reuse-2026-11-03` | `5fec2c6db018` | 1 unmatched commits; review/adapt before integration |
| `research/remaining-gaps-20261103` | `922a391e429d` | Included by ancestry |
| `research/security-addendum-20261103` | `3a523a11a87d` | Included by ancestry |
| `research/upstream-reuse-20261103` | `977b36654bab` | 1 unmatched commits; review/adapt before integration |
| `review/codebase-security-20261104-94554ec` | `6e9c0c5ea888` | 2 unmatched commits; review/adapt before integration |
| `work/noncustodial-reconstruction-2026-10-24` | `bc996aac828c` | Included by ancestry |
| `work/p2p-client-shell-2026-10-24` | `8a88d11d8e41` | Included by ancestry |
| `work/p2p-consolidated-20261030` | `68fb46920431` | Included by ancestry |
| `work/p2p-exchange-close-20261030` | `2d3135b646bf` | Included by ancestry |
| `work/p2p-exchange-test-repair-20261030` | `adfbec52f964` | Included by ancestry |
| `work/p2p-gate-reconciliation-20261030` | `e762e6496004` | Included by ancestry |
| `work/p2p-independent-branch-review-20261030` | `9f80c9b27b94` | Included by ancestry |
| `work/p2p-pr14-finish-handoff-20261030` | `8c8911e2dd3c` | Included by ancestry |
| `work/p2p-relay-lifetime-20261030` | `e0961edc8cb6` | Included by ancestry |
| `work/p2p-validation-20261030` | `11ce9e42bea9` | Included by ancestry |
