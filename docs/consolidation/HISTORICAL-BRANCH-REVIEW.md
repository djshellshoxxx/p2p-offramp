# Historical branch disposition audit

Pinned main: `9620890feba318d01493e713e1a79abfd733e0c7` (documentation #169 integrated). Original #170 comparison: `189f7b1ddfc1b53be7da84cc2a24c9a745d43585`. The full clone is not shallow. The supplied inventory contains 177 branch tips: **96 are ancestors of this main**, and 99 are ancestors of the original #170 candidate. These are different sets; candidate containment is not main incorporation. Later root integration is outside this dated snapshot.

## Verdict

The closed regression/history branches #66–80 and #91–93 are accounted for by source/ancestry evidence described below. **No historical omnibus should be merged wholesale.** Several original features still have unconsumed code, even after #166–170: signed asset updates, personalization/draft/backup/retention UI, old journey/retention composition, scriptless portal/distribution, and tooling/governance. Existing new controllers may cover portions of these behaviors; absent old paths alone do not prove feature absence.

**#154 is the safest additional development-tooling candidate after repair.** Its exact-head CI is green, but its strict owned-page manifest is stale against current main. #155 and #156 are real dependent successors, not three independent PRs. No A classification is issued from this history audit; repair and current-tree qualification are needed. Root has subsequently authorized an isolated repair of #154.

## Classification rules

Policy correction after independent review: the November 18 owner acceptance in
the gameplan's section 5 explicitly supersedes D7's earlier parking option, as
recorded in the accepted-decision index. Nine isolated optional successor PRs are
B pending their own source, integration, import-boundary and applicable D8 review;
optionality alone does not make them E. Default-build wiring remains separately
gated. The pinned source comparisons below retain their original snapshot.

| Class | Meaning |
| --- | --- |
| A | Direct merge candidate after current exact-head gates and independent review |
| B | Useful isolated candidate requiring integration repair/requalification |
| C | Selective extraction, or unresolved inherited branch envelope |
| D | Exact ancestor or demonstrated complete material content |
| E | Experimental research or historical process/evidence payload |
| F | Incompatible custodial architecture |

For cumulative branches, a stage's own feature can be present while its inherited backlog remains C. Closing a PR, finding a replacement branch, matching test names, or finding each line somewhere is not complete-content proof.

## Closed PRs: verified D, not inferred from closure

- **#68, #76, #77:** exact heads are main ancestors.
- **#67:** the entire audit-ledger blob equals main and original #170.
- **#66:** a sequence comparison preserves every original line in order; main inserts a 13-line historical banner and appends 24 lines, with no original deletion or replacement.
- **#78/#79/#80:** each sole changed test file is blob-identical to main and original #170. `git cherry -v <main> <head> <head>^` also returns `-` for all three. Files are `packages/domain/test/registry.test.mjs`, `scripts/tests/deployment-record.test.mjs`, and `packages/transport/test/http-driver.test.mjs` respectively.
- **#69–#75/#91–#93:** eight complete D9 domain test bodies and one wallet test body match main byte for byte. This verifies assertions and setup, not merely titles. The production `markSending` error maps to `BROADCAST_UNKNOWN` on main. #74 augments the pending-known-hash test, so ten PRs produce nine tests.

D9 covered cases: failed marker acknowledgment; encrypted fresh-key unknown-send restoration; terminal labels without canonical finality; historical prepared nonce hold; pending known-hash hold and conflicting hash; account case folding; network separation; account separation; competing restored-session reservations. Current main also contains later lifecycle/CAS hardening. Reapplying the old code would provide no missing coverage.

These are history-disposition findings, not a new end-to-end or live-chain qualification run.

## Original split stack: own-delta evidence and branch disposition

`equal / changed / absent` counts compare the PR's own scoped paths to pinned main. The original #170 candidate has the same absent-path counts for every old source row below; #170 therefore does not silently consume the backlog.

| PR | Head | Class | Own paths: equal / changed / absent | Disposition |
| --- | --- | --- | --- | --- |
| [#26](https://github.com/djshellshoxxx/p2p-offramp/pull/26) | `94554ecf9854` | C | 80/76/461 | Old omnibus: 617 paths vs merge base, including 461 paths absent from pinned main. Contains useful runtime/journey work plus optional packages and historical evidence; never replay wholesale. |
| [#28](https://github.com/djshellshoxxx/p2p-offramp/pull/28) | `b89a87a3f7dd` | C | 8/13/53 | Post-#26 repairs and evidence; 74 own-delta paths, 53 absent. Latest b89a87a changes documentation sourceCommit; source branch remains a quarry, not incorporated. |
| [#35](https://github.com/djshellshoxxx/p2p-offramp/pull/35) | `4c5d01c639d0` | C | 0/0/9 | All nine paths in the PR-specific journey repair delta are absent at both pinned main and original #170. Preserve F01/F03/F06 release-window, payout, delivery/retry and reconciliation ideas; adapt to current D9 rather than restoring v1 fixtures. |
| [#37](https://github.com/djshellshoxxx/p2p-offramp/pull/37) | `81a295d5cd39` | C | 9/11/0 | All 20 own-delta paths exist, 9 blob-identical, 11 evolved. Formal harness is now merged through #137; older formal classification, import boundaries, Sepolia hygiene and journal semantics are superseded. No missing path, but no whole-branch complete-content claim made. |
| [#38](https://github.com/djshellshoxxx/p2p-offramp/pull/38) | `71a56d10405b` | C | 35/7/0 | 35/42 own-delta paths blob-identical; remaining retention source has stronger chat completeness, own-data handling and Intent union; tests extended. Old HttpFetchPort facade export is absent. Broadly incorporated, but inherited tooling and API differences prevent blanket D. |
| [#39](https://github.com/djshellshoxxx/p2p-offramp/pull/39) | `404dc3daa8b1` | C | 7/4/0 | 7/11 own-delta paths identical; all added relay regression assertions present. Current pool replaces handler descriptor with inherited-handler safe lookup and rechecks retirement. Exchange fixture has evolved. C envelope; messaging capability is present. |
| [#40](https://github.com/djshellshoxxx/p2p-offramp/pull/40) | `7706859d2385` | C | 2/9/8 | 8/19 own-delta paths absent, including signed asset-update controller/store/HTTP tests and historical EIP-1271 local fixture/harness. Existing contract-acceptance source is present, but complete stage is not. |
| [#41](https://github.com/djshellshoxxx/p2p-offramp/pull/41) | `dd2a648140e7` | C | 36/4/0 | 36/40 own-delta paths identical; all catalog/en/runtime added lines present, with stricter warning visibility and locale selection. Own feature is superseded by current leaf/runtime; inherited #40 missing assets mean whole branch remains C. |
| [#42](https://github.com/djshellshoxxx/p2p-offramp/pull/42) | `58b3c876ae60` | C | 0/26/30 | 30/56 own-delta paths absent: personalization stores, draft controller/editor, backup verification, favorites/retention UI and qualification fixtures. Current runtime is different; selective extraction requires D9/DATA01 adaptation. |
| [#43](https://github.com/djshellshoxxx/p2p-offramp/pull/43) | `bc549f477f86` | C | 0/3/21 | 21/24 own-delta paths absent: journey state machine, native contracts, presentation, composition, native retention and browser fixtures. New #168/#170 controllers are not demonstrated complete equivalents. |
| [#44](https://github.com/djshellshoxxx/p2p-offramp/pull/44) | `f8a9aa143012` | C | 0/11/30 | 30/41 own-delta paths absent: portal/distribution and tooling/claims/lab/devcontainer. #154 covers tooling subset but remains unmerged. Preserve portal separately, without release/trust authority. |
| [#45](https://github.com/djshellshoxxx/p2p-offramp/pull/45) | `5a9997485b9d` | C | 0/1/27 | 27/28 own-delta paths absent. #155 is newer extraction for inert dependency/Semaphore evaluation; this historical stage is not incorporated. |
| [#46](https://github.com/djshellshoxxx/p2p-offramp/pull/46) | `0baa3c1ae5a7` | C | 0/2/134 | 134/136 own-delta paths absent. C for the cumulative branch envelope; isolated optional successor intake is accepted under the November 18 D7 supersession. Qualify each separately; default-build wiring requires its own gate. |
| [#47](https://github.com/djshellshoxxx/p2p-offramp/pull/47) | `14d7c5e26796` | C | 0/2/34 | 34/36 own-delta paths absent. Prefer #156 historical/inactive governance records and immutable evidence binding over old decision JSON; predecessor stack still unmerged. |
| [#48](https://github.com/djshellshoxxx/p2p-offramp/pull/48) | `494703e83789` | C | 0/5/185 | 185/190 own-delta paths absent, primarily historical execution/review evidence. E for evidence payload, C for cumulative branch envelope. Link the old SHA rather than bulk-import historical proof. |
| [#56](https://github.com/djshellshoxxx/p2p-offramp/pull/56) | `a45e932a3715` | C | 92/50/60 | Same head as #81; 60 own-delta paths absent. Sonar/formal/retention/locale work partially incorporated, but runtime/journey and update work remain. Preserve source and select current-compatible deltas. |
| [#81](https://github.com/djshellshoxxx/p2p-offramp/pull/81) | `a45e932a3715` | C | 47/42/60 | Same source head as #56, different base; 149 paths vs its merge base, 60 absent. Cannot treat already ported subsets as complete branch supersedence. |

### Remaining feature groups and safer sources

1. **Signed asset-update flow / EIP-1271 test harness:** #40 has eight absent paths, including `release-update.ts`, `release-update-store.ts`, `release-update-http.ts`, tests, and the historical local EIP-1271 fixture. Modern release-trust/contract-acceptance primitives do exist. Follow the quarry's F07/store and corrupt-envelope classification fixes; do not import an old trust root, auto-update authority, or superseded wallet implementation.
2. **Personalization and richer runtime/UI:** #42 retains 30 absent paths. The missing group includes `packages/personalization`, `draft-controller.ts`, `TradeDraftEditor.tsx`, `BackupVerificationForm.tsx`, `FavoriteSavedReviews.tsx`, `RetentionPanel.tsx`, related tests, and browser qualification scripts. Preserve current worker lifecycle and D9 behavior; historical immediate deletion is incompatible with accepted native retention proof requirements.
3. **Journey and native retention:** #43's 21 absent paths plus #35's nine absent repair paths include private-trade composition, presentation, native-retention, recovery/flow tests and browser harnesses. Review F01/F03/F06 against the modern #168/#170 controllers before extracting behavior. The quarry documents five old recovery fixtures that encode pre-D9 semantics; they must not weaken current provenance requirements.
4. **Portal/distribution:** still absent under `apps/portal`, `scripts/portal`, `scripts/distribution`; #154 intentionally excludes them. Keep this a separate source qualification task with explicit unapproved artifacts and existing ABI/source/recovery bindings.
5. **Tooling/intake/governance:** prefer #154 → #155 → #156 over raw #44/#45/#47. The successors already adapt manifest binding and mark governance records historical. Their old passing CI does not erase current integration requirements.
6. **Optional packages:** #46 remains C for its cumulative envelope. Successor PRs #144–148/#160–163 retain separate package proposals (proof-inputs, liquidity, courier, arbitration, privacy-policy, privacy-controls, stealth, proof-jobs, meetup). The November 18 acceptance supersedes D7 parking: isolated source intake is accepted, with each successor B pending its own integration, import-boundary and applicable D8 review. Default-build wiring requires a separate gate; none is enabled by this audit.
7. **Historical execution evidence:** #48 payload is E. Link immutable source `494703e837897d04bce1cb04134fa8be6b747377` for the 185 absent historical files instead of copying them into a modern proof packet. #26/#28/#56/#81 include mixtures of these groups and cannot be declared fully superseded.

## Tooling candidates and #142

| PR | Exact head | CI observed | Review submissions | Class / next step |
| --- | --- | --- | --- | --- |
| [#142](https://github.com/djshellshoxxx/p2p-offramp/pull/142) | `d8c56d7ddc44661f4fd86c8db6dff411d9e10d10` | 10/10 checks + Snyk success | 0 | C: selectively preserve safety helpers/tests; no retirement operation |
| [#154](https://github.com/djshellshoxxx/p2p-offramp/pull/154) | `3591dcbb84ff7280be3d93a27b5b160066074c06` | 11/11 checks + Snyk success | 0 | B: integrate on current main, preserve gates, regenerate current owned-page evidence |
| [#155](https://github.com/djshellshoxxx/p2p-offramp/pull/155) | `9f03e0e014bd999c266eee944e46e9be002bdcfc` | 11/11 checks + Snyk success | 0 | B: depends on #154; 28 files in its own incremental delta |
| [#156](https://github.com/djshellshoxxx/p2p-offramp/pull/156) | `7a60893c4c1ccdf4e66bb1cffc0f38d89ec5e19b` | 11/11 checks + Snyk success | 0 | B: depends on #155; 37 files in its own incremental delta |

The 11 checks for #154–156 include `docs-tooling`; all check records identify the exact heads above. Example [#154 docs-tooling job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44271724775/job/134689754515), [#155 docs-tooling job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44271750538/job/134689840275), [#156 docs-tooling job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44271777861/job/134689934308), and [#142 schemas job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44270217167/job/134684654943). No submitted GitHub review exists in the queried review collections; author-reported independent reviews remain distinct from that observation.

### Concrete #154 integration repair

`docs/wiki-source/docs-manifest.json` from #154 binds seven working-tree documents. At pinned main, **Home, Getting-Started, Codespaces-Test-Lab, and Security-and-Release** differ from the stored hashes. Two are formatting edits carried by #154 itself; Home and Security-and-Release additionally evolved on main. The validator checks `sha(text) === doc.sha256` and rejects drift as `DOCS_STALE`; it also binds a link-report digest. Therefore old head success cannot qualify an unchanged manifest after current-main integration.

Keep the current wiki text, reconcile the two formatting changes, and regenerate the strict owned-document/link manifest. Source evidence is separately bound to immutable `sourceCommit` `8649b7a1994ec21fe5557179d44e861b746bcda8`; drift of those non-owned rows intentionally reports stale without claiming current tested status. Rebinding must preserve that distinction. Reconcile additive `package.json` and workflow changes without replacing current test/build/gate configuration. The original PR description records a missing-journey/portal limitation. Subsequent source inspection found only foundation/journey command tables, and all four named journey scripts exist on current main. That old caveat is not a current blocker; the pinned development container still needs its own execution evidence.

#155 probe evaluations require their designated container uid/cgroup/mount; they are not root test coverage or approved active dependencies. #156 labels all twelve governance records historical with the accepted-decision pointer; 45 bound assurance rows use committed bytes, while 12 owned rows stay strict. Preserve these restrictions.

### #142 is not a complete-content oracle

Its new `lib.sh` fixes useful fail-open cases (unknown merge base, binary, rename, `++` content, grep error/SIGPIPE) and its exact head is green. However `lines_on_main` intentionally ignores deletions, leading whitespace, ordering and line multiplicity. A branch that deletes a guard or reorders checks can pass line membership without preserving behavior. Treat it only as a weak retirement aid, not the basis of class D. Its `agents.md` addition also treats an owner-closed-as-superseded PR as finished, which is insufficient for this audit's preservation requirement. Keep existing owner/branch controls; no tagging/deletion/force push was performed or recommended here.

## Custodial branch: F

`feat/custodial-ledger-foundation@52e6987e77d9ef6bc403c0129b3f52531986ade8` adds twelve absent paths: a payments-ledger workflow, PostgreSQL ledger/reconciliation/hold-guard migrations, Node ledger/hold services and integration tests. Its own [architecture document](https://github.com/djshellshoxxx/p2p-offramp/blob/52e6987e77d9ef6bc403c0129b3f52531986ade8/payments/ARCHITECTURE.md) explicitly defines an authoritative server/customer-balance model. This conflicts with the accepted static, client-side, noncustodial external-wallet design. Retain as separate historical research if desired; do not merge it into the product. No branch retirement was attempted.

## Inventory and audit limits

The companion JSON records all 177 tips with exact main/candidate ancestry flags. For detailed target PRs it records full SHAs, scope bases, and every equal/different/absent path. Original non-m0 split precursors remain C because their later m0 counterparts retain unconsumed work. Extra historical prompts/workflows are E; other partly imported history remains conservatively C until exact full-content comparison. Active #138, original product-source lanes and #166–172 are delegated to the parent's reviews, not silently classified by this report.

No fresh project test was run for this history disposition: the evidence consists of full-history ancestry, blob IDs, exact complete regression-body comparisons, patch equivalence, reviewed source differences, pinned manifest hashes, existing ledger/quarry context, and exact-head hosted check/review metadata. No remote or tracked file changed. The separate authorized #154 repair will produce its own tested tree and verdict.

Primary repository context: [living ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/9620890feba318d01493e713e1a79abfd733e0c7/docs/consolidation/LEDGER.md), [phase3 quarry](https://github.com/djshellshoxxx/p2p-offramp/blob/9620890feba318d01493e713e1a79abfd733e0c7/docs/consolidation/2026-11-18-phase3-quarry.md), [documentation reconciliation](https://github.com/djshellshoxxx/p2p-offramp/blob/9620890feba318d01493e713e1a79abfd733e0c7/docs/consolidation/2026-11-18-documentation-reconciliation.md). Historical statements in those documents were checked against the pinned source where this report claims incorporation.

## Exact source-head register

| PR | Full head SHA | Classification |
| --- | --- | --- |
| [#26](https://github.com/djshellshoxxx/p2p-offramp/pull/26) | `94554ecf9854e4604f9f56afe5bebedeee931994` | C |
| [#28](https://github.com/djshellshoxxx/p2p-offramp/pull/28) | `b89a87a3f7ddbd7d2e0fd155013dc6743cfaa501` | C |
| [#35](https://github.com/djshellshoxxx/p2p-offramp/pull/35) | `4c5d01c639d05c0ec6ecba9bf162d5fa2a9abf05` | C |
| [#37](https://github.com/djshellshoxxx/p2p-offramp/pull/37) | `81a295d5cd3936b88eded7e52b6f2a78989f6ea7` | C |
| [#38](https://github.com/djshellshoxxx/p2p-offramp/pull/38) | `71a56d10405bacc7ab39f29d1b63b4bde8a82504` | C |
| [#39](https://github.com/djshellshoxxx/p2p-offramp/pull/39) | `404dc3daa8b19904c7da29d71d49d8df0f5e03ba` | C |
| [#40](https://github.com/djshellshoxxx/p2p-offramp/pull/40) | `7706859d2385cae0f8e49615392de08dfee83f84` | C |
| [#41](https://github.com/djshellshoxxx/p2p-offramp/pull/41) | `dd2a648140e79b0c0148ffb2a6be87fdf1b3c330` | C |
| [#42](https://github.com/djshellshoxxx/p2p-offramp/pull/42) | `58b3c876ae6036114a195af6b2dcc4c9cc2a09ad` | C |
| [#43](https://github.com/djshellshoxxx/p2p-offramp/pull/43) | `bc549f477f86e27516f554c7f1923a7147b82ea4` | C |
| [#44](https://github.com/djshellshoxxx/p2p-offramp/pull/44) | `f8a9aa1430129fd57fd9217402577106bebeca7a` | C |
| [#45](https://github.com/djshellshoxxx/p2p-offramp/pull/45) | `5a9997485b9dbdc1c9bf8a23c3b372728515c295` | C |
| [#46](https://github.com/djshellshoxxx/p2p-offramp/pull/46) | `0baa3c1ae5a71e766df95217f6ff4d3db5b1cd03` | C |
| [#47](https://github.com/djshellshoxxx/p2p-offramp/pull/47) | `14d7c5e267962a68feb422e551b45ccbeba832bd` | C |
| [#48](https://github.com/djshellshoxxx/p2p-offramp/pull/48) | `494703e837897d04bce1cb04134fa8be6b747377` | C |
| [#56](https://github.com/djshellshoxxx/p2p-offramp/pull/56) | `a45e932a37153590bc329c1e9012cf18e37fe12c` | C |
| [#66](https://github.com/djshellshoxxx/p2p-offramp/pull/66) | `a1930a3596f76eff4c29a1ee2991d6acd7f35895` | D |
| [#67](https://github.com/djshellshoxxx/p2p-offramp/pull/67) | `353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab` | D |
| [#68](https://github.com/djshellshoxxx/p2p-offramp/pull/68) | `c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf` | D |
| [#69](https://github.com/djshellshoxxx/p2p-offramp/pull/69) | `44ca5fcf5e5d94893b5d7a0e3e15735506a76f52` | D |
| [#70](https://github.com/djshellshoxxx/p2p-offramp/pull/70) | `78af7214a1aab97eb3eb7722793bb536e7d6ff39` | D |
| [#71](https://github.com/djshellshoxxx/p2p-offramp/pull/71) | `06305ebaccd99fa8e2ce7a9d5eccc05d9fbde28f` | D |
| [#72](https://github.com/djshellshoxxx/p2p-offramp/pull/72) | `92cc054ce9a2ee21936e20d103757e374f4af296` | D |
| [#73](https://github.com/djshellshoxxx/p2p-offramp/pull/73) | `94778c3282a99110922aa260b5f4ea98dd34caf9` | D |
| [#74](https://github.com/djshellshoxxx/p2p-offramp/pull/74) | `146d06d81474445434070aff557ad56379ad24a3` | D |
| [#75](https://github.com/djshellshoxxx/p2p-offramp/pull/75) | `f393c365937cbadee4bb1a0a35f78c4c105cbcee` | D |
| [#76](https://github.com/djshellshoxxx/p2p-offramp/pull/76) | `2ba1a4e18f4673f006b195e822b5f984effb48e8` | D |
| [#77](https://github.com/djshellshoxxx/p2p-offramp/pull/77) | `08a9cf1e9abc0fb703b14964062a3da2234fdbb6` | D |
| [#78](https://github.com/djshellshoxxx/p2p-offramp/pull/78) | `a213166ea83a0c5ec0768f693ff583413e8e976b` | D |
| [#79](https://github.com/djshellshoxxx/p2p-offramp/pull/79) | `e0a9033158d1ae874c78de7f25d0be0aa3a13157` | D |
| [#80](https://github.com/djshellshoxxx/p2p-offramp/pull/80) | `5f2381ab42c27984dbb1cc872468dd3e09771690` | D |
| [#81](https://github.com/djshellshoxxx/p2p-offramp/pull/81) | `a45e932a37153590bc329c1e9012cf18e37fe12c` | C |
| [#91](https://github.com/djshellshoxxx/p2p-offramp/pull/91) | `dd5cf16da0c7e0c2f1613153ac746bd6390ec587` | D |
| [#92](https://github.com/djshellshoxxx/p2p-offramp/pull/92) | `b19ae4637538d7c364b4e55a2624b0b908d5cb7f` | D |
| [#93](https://github.com/djshellshoxxx/p2p-offramp/pull/93) | `e8afa6af3db9ac9575f57beaef61886e3b79683a` | D |
| [#142](https://github.com/djshellshoxxx/p2p-offramp/pull/142) | `d8c56d7ddc44661f4fd86c8db6dff411d9e10d10` | C |
| [#154](https://github.com/djshellshoxxx/p2p-offramp/pull/154) | `3591dcbb84ff7280be3d93a27b5b160066074c06` | B |
| [#155](https://github.com/djshellshoxxx/p2p-offramp/pull/155) | `9f03e0e014bd999c266eee944e46e9be002bdcfc` | B |
| [#156](https://github.com/djshellshoxxx/p2p-offramp/pull/156) | `7a60893c4c1ccdf4e66bb1cffc0f38d89ec5e19b` | B |
