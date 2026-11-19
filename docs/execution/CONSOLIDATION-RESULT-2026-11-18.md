# Consolidation, security repair, and qualification result — 2026-11-18

## Outcome

Four qualified PRs were merged into main. Three historical PRs were closed with complete per-file supersedence evidence. The remaining core EVM, Solana, encrypted recovery, and localnet browser implementation is preserved in three draft integration PRs. The final combined production source passed 1,922 tests with zero failures or skips, all configured TypeScript projects, 32 specification tests, 50 build-policy cases, default/demo builds, and 12 real Anvil/relay controller checks.

**The requested MVP is not complete or testnet-qualified.** Actual browser execution, the combined real Solana validator run, Solana browser/exchange integration, ERC-20 browser parity, physical wallets, public-testnet acceptance, and some interrupted negotiation flows remain unfinished. The final dependency scan also confirms an unpatched build-tool advisory. `ReleaseEnabled=0` remains in force.

No release, public deployment, mainnet enablement, real-funds transaction, branch deletion, force-push, history rewrite, or protection bypass was performed. Native chains and signing keys used disposable or published local development fixtures. The Node test wallet/relay servers are test infrastructure, not a new application-owned backend.

## Repository and exact-source record

| Checkpoint | SHA / evidence |
| --- | --- |
| Starting main | `97ce6a41805ab4d8fc6fccbcfb9dd79463deebd7` |
| Final main observed in this execution | `f9bc66e70003fe5550d9817c639d80d98a73d04a` |
| Final combined production source tested locally | `9f3ba5de1c202ef8b94d875c14cfcbc7af7ef7a0` |
| Its complete tested tree | `1d0b2a3ef9a7661bcc04aabbccf18c1186fde5fb` |
| Published identical source checkpoint in PR #168 | `b981ebed7e1e0d85f69210df7f444bacc91bf55a` |
| Final evidence branch | `integration/browser-mvp-20261118`; later commits add documentation and evidence only |

Git fetch was available, while direct Git push had no write credential. The authorized GitHub connector published commit trees and advanced work branches without force. Connector commit identities differ from local identities; each published tree was compared with the corresponding local tree after fetching. Fully integrated original PR heads remain merge ancestors. PR #159 is explicitly only a partial extraction.

The initial inventory covered **45 open PRs and 170 active remote refs**. After four merges, three supersedence closures and three new drafts, **41 PRs remain open**. A final remote-ref read found **173 branches**, including the three new integration branches. The inventory distinguishes complete semantic reviews from path, dependency, and CI inventory; it does not claim a line-by-line security audit of every optional or historical branch. The final inventory and full changed-path/CI data are linked in the evidence index below. Native parallel agents performed the EVM, Solana, inventory, and independent review work. The specifically requested Claude model was not available in this environment; no execution by that model is claimed.

## Consolidation dispositions

### Merged into main

| PR | Scope | Original head | Merge commit | Qualification |
| --- | --- | --- | --- | --- |
| [#141](https://github.com/djshellshoxxx/p2p-offramp/pull/141) | Artifact verifier requires the caller's explicit build mode | `87af4088a2fde86ed7485fdc7d229b7c04a2be87` | `d6344b66b5537b146b6aad06b542a246c18cc497` | Independent reproduction/review; 7 focused and 36 policy cases; 10 successful source-head hosted checks and Snyk; fetched merge-tree equality |
| [#149](https://github.com/djshellshoxxx/p2p-offramp/pull/149) | Unknown-broadcast recovery-reference characterization | `90b9b85715f1e04522b828ecdbc4858e92a1b88e` | `f3fb73921c75ec6aa1075ab2ca516e6c5fe3a3dc` | Four current-main focused cases; 10 successful source-head hosted checks and Snyk; fetched merge-tree equality |
| [#151](https://github.com/djshellshoxxx/p2p-offramp/pull/151) | Native Solana consent verification and replay primitives | `236f815e79a852643d8dfa61d6d4895c8a93f54a` | `2c49117ea14f7f0cae062e955b55116bb5fd48a1` | Independently reviewed byte-identical consent source; current-main combination `1ebf9da1` passed 1,735 tests and all local gates; 11 hosted checks and Snyk; tree equality |
| [#143](https://github.com/djshellshoxxx/p2p-offramp/pull/143) | Canonical block-hash-bound EVM reader state | `579b02f3775323ba273dfe2bc624b5860897431e` | `f9bc66e70003fe5550d9817c639d80d98a73d04a` | Root and EVM review; current-main combination `78afa7c0` passed 1,740 tests, with its sole cast-oracle skip subsequently passing separately; all other local gates; 10 hosted checks and Snyk; tree equality |

These are qualified scoped merges. Source-head CI is distinct from a later main push: the final main push's hosted jobs were still queued at the final check. #151 remains `candidateOnly` with `economicPreparationAllowed:false`; its merge does not create Solana browser signing authority. #143 does not by itself include the downstream payment/recovery/finality repairs in #166.

### Closed as superseded

- **#38:** 35 of 42 changed paths are byte-identical to main. Seven inspected differences are equivalent export organization, Intent v2 and stricter retention behavior, additional backup/IDB/retention tests, stronger transport assertions, and the intentional exclusion of the internal type-only `HttpFetchPort` facade export. Its internal HTTP implementation is already identical. Evidence was posted against main `2c49117e` before closure.
- **#39:** 7 of 11 paths are identical; the other four retain the stage's behavior and add verifier-lifetime checks, safe inherited handlers, delayed-close failover bounds, and stronger exchange tests. Evidence was posted against `f3fb7392`.
- **#41:** 36 of 40 paths are identical; remaining differences are an equivalent local display type, stronger warning-visibility validation, selector labels, and immutable bundled-locale enumeration. Evidence was posted against `f3fb7392`.

The exact heads were revalidated before closure. Their branches remain available. These proofs do not establish supersedence of #26 or the other split-stack PRs.

### Implemented and preserved, awaiting qualification

| PR | Base | Published source checkpoint | Scope and remaining gate |
| --- | --- | --- | --- |
| [#166](https://github.com/djshellshoxxx/p2p-offramp/pull/166) | main | `0ae7e82baf1bab949934b93906676423aaed8af0` | Downstream EVM anchored reads/finality, external peer signer, physical prompt/session guards, isolated localnet build admission. Exact-head hosted checks queued. |
| [#167](https://github.com/djshellshoxxx/p2p-offramp/pull/167) | #166 branch | `abff77440f81a35b9f4eba91b7db2429e8f1f314` | Consolidated #152/#157/#158/#153, native encrypted journal, offline recovery hints, independent repairs, and real-validator CI gate. Hosted checks queued; actual validator unqualified. |
| [#168](https://github.com/djshellshoxxx/p2p-offramp/pull/168) | #167 branch | `b981ebed7e1e0d85f69210df7f444bacc91bf55a` | Built localnet browser composition, explicit reviews, encrypted chat/recovery, independent repairs, native and browser harnesses. Hosted browser and integrated checks required. Later head adds this evidence packet only. |

Merge #166 first when qualified, retarget #167 to current main and qualify it there, then retarget and qualify #168. A merge into a temporary stack base is not completion on main. Original #152/#157/#158/#153 remain open until their replacement is actually merged and a final exact diff proves closure appropriate. #159 remains partially extracted: its signer/build profile were reused, but its older alternate exchange was not imported over current D1.

All optional package PRs #144–#148 and #160–#163 remain isolated. Formal tooling #137 and governance/intake #154–#156 remain preserved. Historical #26/#28/#35/#37/#40/#42–#48/#56/#81 still contain distinct work or evidence; they were not blanket-closed. Documentation PRs #136/#139/#164/#165 require coordinated reconciliation. #139 moved during execution to `708d937df7e4799e4ad212b3293bec923f619940`; its fresh docs delta was reviewed and its new checks remained queued.

## Core feature completion estimates

These are deliberately coarse engineering ranges for the full requested capability, including integration and qualification. They are not test coverage, a security probability, or measured percentages of code. Mature libraries can score well while their application composition remains incomplete. There is no meaningful aggregate average across these differently sized tasks.

| Feature | Complete, approximate | Remaining, approximate | Current state and evidence |
| --- | ---: | ---: | --- |
| Encrypted local profiles, backup, fresh-key restore | 85–95% | 5–15% | Mature main foundations; combined real-service regressions and native recovery pass. New localnet DOM/IndexedDB path still needs hosted browser execution. |
| Canonical terms and peer acceptance | 75–85% | 15–25% | Current EVM D1 works in the native two-party composition; Solana consent primitives merged. Solana carrier/UI and interrupted unfunded negotiation resumption remain. |
| EVM native-asset escrow lifecycle | 70–80% | 20–30% | Contracts and real native/controller flows pass; reader hardening merged. Broader repairs/UI await stack CI, physical wallets and public testnet. |
| EVM ERC-20 application parity | 40–50% | 50–60% | Contract, approval and recovery evidence exists; new browser slice supports the native asset only. |
| Solana core and full Phase 2 parity | 50–60% | 40–50% | Reader/planner/wallet/lifecycle/recovery plus encrypted journal implemented and reviewed. Actual validator, carrier and browser composition remain. |
| External-wallet application integration | 50–60% | 40–50% | EVM fixture signing and exact-request guards tested; native Solana sign-only boundary tested. Physical wallets, Wallet Standard discovery and app flows remain. |
| Relay discovery and encrypted communications | 75–85% | 15–25% | Real Nostr relay/cryptography and durable chat in controller tests; component failover/hostile-relay tests retained. Built UI reconnect matrix and public endpoints remain. |
| Durable transaction recovery | 75–85% | 15–25% | Unknown markers, fresh-key origin preservation, native history and offline hints tested. Solana browser recovery, full restart/sleep matrix and unfunded D1 resumption remain. |
| Release, cancellation and refund | 70–80% | 20–30% | EVM controller proves release/refund and abandoned-review handling; Solana native/LiteSVM cases pass. Combined browser and actual validator gates remain. |
| Privacy controls and metadata minimization | 65–75% | 25–35% | Encrypted storage/private traffic, explicit destinations, no mandatory telemetry, profile revocation and artifact isolation tested. Deployment/network/device qualification remains. |
| Security verification | 60–70% | 30–40% | Bounded independent reviews and RED/GREEN repairs completed; contract fuzz/invariants pass. Unpatched dev dependency, missing tools, hosted checks and external audit remain. |
| Built-browser acceptance | 35–45% | 55–65% | Actual application and harness implemented; artifact and controller gates pass. Chromium did not execute successfully in this environment. |
| Testnet and release qualification | 20–30% | 70–80% | No public testnet or physical-wallet acceptance, approved live bootstrap, release authorization or deployment. `ReleaseEnabled=0`. |

## Confirmed findings and repairs

The following severities describe the reviewed development components and actual consequences demonstrated. They do not imply that the default deployed browser previously exposed the unpublished localnet paths. Detailed RED/GREEN logs and exact repair SHAs are in the linked component reports.

| Finding | Severity / effect | Repair and regression evidence | Residual limit |
| --- | --- | --- | --- |
| Artifact verifier implicitly accepted a lenient artifact mode | Low; policy-selection error | #141 requires caller-selected mode; baseline accepted and repaired source refused both mismatches | Artifact validation is not release authorization |
| EVM state read by number could belong to another honest backend's fork | Medium; wrong state attributed to an anchor | #143 and #166 use canonical EIP-1898 block-hash selectors; adversarial fork tests and real oracle pass | A consistently dishonest RPC can still lie |
| Unknown-broadcast finality discarded a known finalized hash | Medium; premature terminal classification | Pass expected finalized hash into the native lifecycle reader; before/after regression | No light-client proof or full ancestry walk |
| EVM silent wallet identity changes during a prompt | Medium; stale-session signature result | Reread account and chain after validation; signer tests | Physical-wallet interoperability remains untested |
| Overlapping EVM signing and premature physical-slot release | Medium; concurrent authorization prompts | One slot shared by both signing methods, held until provider settlement | A settled promise still requires consumer lifetime checks |
| Final async signer continuation could publish after cancellation | Medium; session-safety failure | Four independent RED cases; final owned-continuation guard; 32 signing tests GREEN | No cancellation of already delivered values |
| Funded Solana exits were gated by later admission-policy changes | Medium availability; valid funded exit hidden | Apply freeze-authority permits before funding; retain full custody/account checks for exits | An actually frozen token vault still blocks movement |
| Solana disposal after marker scheduling could still dispatch | Medium; send after invalidation | Guard inside the physical RPC continuation; reproduced one send becomes zero | Possibly committed marker remains uncertain |
| Solana wrong-genesis terminal evidence could settle an intent | Medium; incorrect dropped/failed outcome and poisoned floor | Genesis checks bracket observation; floor updates follow final identity check | RPC honesty remains an assumption |
| Recovery rejected valid uppercase/dotted registry IDs | Low compatibility/availability | Use the registry grammar; independent round-trip regressions | Invalid/traversal identifiers remain refused |
| Recovery exit display accepted another trade at the same PDA | Low display correctness | Require full finalized trade/network/deployment binding | Planning already independently rejects substituted terms |
| Solana RPC getter could revoke the vault before invocation | Medium; physical send after lease revocation | Capture method then recheck lease; actual encrypted-vault regression | Injected providers remain untrusted boundaries |
| Solana wallet descriptor trap could prompt after revocation | Medium; prompt after vault lock | Recheck lease after feature/input capture; pending physical operation remains held | Same-trade serialization is not a global wallet scheduler |
| Offline native hints accepted duplicate keys/program index zero | Low presentation/strictness | Pure bounded structural checks; two RED→GREEN cases | Hints remain unverified and nonauthoritative |
| Browser client retained or republished private views after lock | Medium privacy/session integrity | Immediate blank projection, epochs, stale-result rejection and reserved lock capacity; independent regressions | JavaScript strings cannot promise forensic erasure |
| Wallet bridge accepted an unapproved method or a revoked getter result | Medium authorization boundary | Runtime method allowlist, exact ordered request match and final generation guard | Fixture wallet evidence is not physical-wallet qualification |
| Reconciliation reapplied lost ephemeral D1 funding admission | Low recovery availability | Keep fresh D1 checks at reservation/marking; canonical reconciliation remains independent | Restored unfunded negotiations still require a new explicit flow |
| Browser wall clock hid refunds and exposed expired release preparation | Low availability/rejected-transaction risk | Use canonical snapshot time and reject expired release reservation; skewed-clock native regressions | Current state is revalidated before action |
| Buyer/repeated negotiation display selection was incorrect | Low functionality | Separate private display choice from seller intake pinning; native repeated-negotiation case | No spending authority derives from UI selection |
| A delayed backup-file read could unlock after lock | Medium privacy/session integrity | Register UI operation before reading; check epoch/client/profile before dispatch; explicit and Worker-lock RED→GREEN cases | Browser DOM/IndexedDB run remains pending |
| Localnet build emitted two workers or omitted worker licenses | Low artifact correctness | Split compile-time entry roots; require one intended worker and collect emitted worker attribution; 50 policy cases | Build checks do not prove runtime isolation |
| picomatch repeated-extglob denial of service | High upstream dependency advisory; confirmed build-tool issue | Bounded reproduction and dependency/runtime reachability assessment; five audit package entries stem from one advisory | **Unresolved upstream: no patched release listed. No identified emitted-browser input path; full npm audit remains nonzero.** |

The harness completion-wait repair is separately recorded as a source-confirmed test sequencing issue, not a Chromium-reproduced vulnerability. The viem receipt wait and outdated EIP-1898 test expectation were integration reliability corrections, not additional contract vulnerabilities. No new escrow-contract vulnerability was confirmed in the scoped review. No claim of a comprehensive external audit or an entirely clean dependency scan is made.

The dependency advisory is [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), reviewed/updated November 17. It covers picomatch through 4.0.7 and lists no patched versions. The locked dependency is used by the Vite build chain. The current newer Vite release still depends on the affected range. Pins and audit output were not suppressed or changed merely to obtain a green result.

## Privacy assessment

The application retains external wallet custody. The Worker owns the vault lease, messaging secret and private trade state; page outputs are purpose-specific. Native Solana history is encrypted in the existing vault and preserved by backup without a lossy shared-intent conversion. Restored provenance does not grant resubmission or local-cancellation authority.

Public discovery advertisements necessarily expose their signed public fields, timing and persistent advertisement/messaging identifiers. Relay operators can observe connection IPs, timing, destinations and ciphertext sizes. Counterparties receive the terms, wallet identity and payment instructions required for their trade. RPC providers observe queried addresses/accounts, contract/program calls, timing and the requester's network metadata. Public chains expose settlement activity and associated addresses; encryption does not make that activity anonymous.

Website hosts observe delivery requests. The final static artifact has no mandatory application-owned backend or telemetry service, but the host and browser remain part of the trust boundary. Extensions or a compromised unlocked device can observe page content or interfere with wallet interaction. Lock revokes capabilities and removes current/queued private projections; it is not a claim that the JavaScript engine erased every prior string copy. Backups remain sensitive encrypted material subject to passphrase strength and local-device protection.

Manual fiat confirmation is explicit. Chat, a buyer's payment claim, and encrypted messages do not prove receipt, bank authenticity or irreversibility. Seller confirmation authorizes the reviewed on-chain release; the application cannot independently verify an ordinary bank transfer. Advanced privacy transports, stealth, proof jobs, arbitration and courier/meetup modules remain optional and unmerged. No anonymity or fiat-payment guarantee is claimed.

## Test evidence

### Final combined source

At `9f3ba5de1c202ef8b94d875c14cfcbc7af7ef7a0`, with Node 24.22.1, npm 11.9, Python 3.12.14, pinned Foundry 1.5.1 and solc 0.8.30:

| Command / gate | Result |
| --- | --- |
| `npm run typecheck` | All four projects passed |
| `npm test` | **1,922 passed; 0 failed, cancelled, skipped or todo** |
| `npm run test:specs` | **32 passed** |
| `npm run check:specs` | Passed |
| `npm run check:boundaries` | Passed: 196 production files, 112 modules in the core entry graph |
| `npm run test:build-policy` | **50 passed; zero failures/skips** |
| `npm run build` / `npm run build:demo` | Both passed |
| `npm run test:localnet:controller` | **12 real native checks**, 12 typed-data signatures, 4 sends, 4 prior durable markers |
| Real-fixture localnet `buildWeb` | **11 assets**, one correct Worker, complete licenses, no fixture signing keys emitted; zero startup wallet actions |
| `node --check scripts/test-localnet-browser.mjs` | Passed syntax checking only |
| `npm audit --json` | Exit 1: 5 high package entries, 0 critical, one underlying build-tool advisory |
| `npm audit --omit=dev` | No reported production dependency vulnerabilities; this does not clear the full audit |

The native controller proves real encrypted negotiation, both-side consent, chat without fiat authority, cancelled review, funding/release, repeated negotiation, lost-response backup/restore without resend, abandoned preparation reconciliation, chain-clock expiry and restored refund. It explicitly reports `browserQualification:false`.

### Additional native and independent evidence

- EVM source `9e7a9b4`: viem 9 unit + 32 native oracle checks; payment preflight 6 unit + 7 native; reconciliation 5 native including interruption; recovery 18 unit + 6 portable + 6 rotation; exchange 12 real + 6 D1 checks; **92 Foundry tests** including fuzzing and invariants. These are source-scoped results, not reruns of every command on the final combined tree.
- Solana source `b1dbd00`: **250 client tests**, **48 Rust/LiteSVM tests** (8 adversarial, 20 native, 15 SPL, 5 vectors), SBF build, formatting, Clippy, generated IDL match, 7 JavaScript and 4 Python vector tests. SBF SHA-256: `eed3a49072900a761756117514d0596b418ff33e6f9fe7d7b2f962471f6064c0`.
- Independent browser source `b74cf599`: 42 focused cases and 11 native checks rerun in a separate worktree; later selection, backup-file and harness-wait deltas independently reviewed. The final browser owner ran 45 focused cases and 12 native checks before root's full combined run.
- Independent native vault source `d4f7a661`: four new regressions fail on the original source; **54 focused tests**, typecheck and boundaries pass after repair. The real encrypted service and native journal are exercised with a deterministic transactional store.

### Unavailable or blocked gates

Chromium cannot create its required AF_UNIX sockets in this host. Automatic approval review rejected the requested execution escalation under the configured sandbox policy; no workaround was attempted. `test:browser`, `test:web:browser`, and the new `test:localnet:browser` therefore have no successful local execution claim for the combined source. Hosted checks must execute the actual built application.

The pinned Solana validator panics before RPC startup because io_uring is denied with EPERM; its admin socket is also refused. SBF/LiteSVM success does not establish real-validator success. The workflow now runs the real client driver with the full contract refund wait and no debug refund skip. Slither was unavailable and was not run. Public networks, physical wallets and external security auditors were not exercised.

## Remaining work and acceptance criteria

| Priority | Work | Dependency / acceptance criterion |
| --- | --- | --- |
| P0 | Execute pending hosted gates on the exact integration heads | Available runners and supported Chromium/validator host. Resolve every real failure; record exact SHA, artifact and complete results before merging. |
| P0 | Finish native Solana browser/exchange composition | Wallet Standard discovery and exact off-chain signing; Solana carrier and authenticated replay/cancel paths; explicit transaction/fiat review; real encrypted journal; successful two-party built-UI fund/release/refund/recovery flow. |
| P0 | Complete built-browser acceptance | Two independent contexts and IndexedDB profiles, actual Worker and external fixture wallets; release/refund, unknown broadcast, fresh-key restore, wrong chain, cancellation, lock/sleep/restart, relay failure and no duplicate sends. Physical wallets require a separate matrix. |
| P1 | Restore an unfunded negotiation safely | Explicit same-terms D1 reacceptance after restart; no authority from imported labels; native reconciliation and approved same-nonce successor; prove no duplicated funding. |
| P1 | Add ERC-20 browser parity | Exact asset/approval review, bounded allowance, nonstandard/fee token refusal, recovery/payout behavior and combined browser tests. Native-asset success does not qualify this. |
| P1 | Resolve build-tool dependency advisory | Compatible patched release or independently reviewed upstream fix, pinned integrity, bounded regression, full audit and affected build gates. No currently released compatible patch was identified. |
| P1 | Qualify approved public testnet and physical wallets | Owner-approved trust/bootstrap, deployment identities, supported RPCs and test-only wallets. This assignment did not authorize public deployment or real funds. |
| P1 | Merge qualified stack into main | #166, then retarget/qualify #167, then #168; verify resulting main trees/checks. Only then close source PRs with final supersedence proof. |
| P2 | Reconcile remaining historical core extractions and docs | Preserve newer D1/D9 behavior; audit unique paths in the full inventory; coordinate #139/#164/#165 instead of overwriting concurrent documentation. |
| Release gate | Independent external security/release review | Dependency disposition, browser/device matrix, honest RPC/privacy limitations, approved trust roots, and separate owner authorization. Keep `ReleaseEnabled=0`. |

Some remaining items are unfinished engineering, not external blockers. The browser/validator host restrictions, queued hosted execution, upstream dependency patch and owner-controlled live trust/deployment decisions are distinct external dependencies. The execution stops with exact source checkpoints and reviewable PRs; it does not claim unattended continuation beyond this session.

## Evidence index

- [All 45 original PR dispositions and three new integration PRs](CONSOLIDATION-INVENTORY-2026-11-18.md)
- [Complete PR metadata, paths, CI and closure evidence](CONSOLIDATION-INVENTORY-2026-11-18.json)
- [Initial 170-branch coverage](INITIAL-BRANCH-COVERAGE-2026-11-18.json)
- [Final 173-branch source snapshot](FINAL-REMOTE-REFS-2026-11-18.json)
- [Confirmed unpatched dependency and emitted-runtime assessment](PICOMATCH-ADVISORY-ASSESSMENT-2026-11-18.md)
- [Core consolidation provenance](CORE-CONSOLIDATION-2026-11-18.md)
- [EVM anchored-read repairs](EVM-ANCHOR-REMEDIATION-2026-11-18.md)
- [Independent core review and RED/GREEN logs](INDEPENDENT-CORE-REVIEW-2026-11-18.md)
- [Independent native vault/recovery review](INDEPENDENT-NATIVE-VAULT-REVIEW-2026-11-18.md)
- [Localnet composition, exact source and limits](LOCALNET-BROWSER-COMPOSITION-2026-11-18.md)
- [Independent browser review](INDEPENDENT-BROWSER-REVIEW-2026-11-18.md)
- [Independent browser selection follow-up](INDEPENDENT-BROWSER-SELECTION-REVIEW-2026-11-18.md)
- [Solana native qualification and validator blocker](../../packages/chain-solana/docs/integration-qualification-20261118.md)
- [Final combined command results](final-gate-evidence-2026-11-18/results.json)

The final PR inventory, initial branch-ref coverage, dependency assessment and raw final-gate logs are committed alongside this report. Current branch-head metadata may advance; use the explicit source SHAs above when interpreting historical test results.
