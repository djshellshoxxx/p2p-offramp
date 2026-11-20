# Independent combined-core review — generation 10

## Result and exact source

**No open High or Medium integration finding was identified.** The source is the exact nonoverlapping union of five reviewed followups on corrected207. This independent reviewer reconstructed the entire tracked tree and its ordered parents, then executed **54/54 focused maintained tests**, with zero failures, skips, cancellations or todos. The author separately executed **2,309/2,309** full tests. These scopes are not added together.

| Identity | Exact value |
| --- | --- |
| Input handoff PR200 | `b01aa60a7eb893d0359449f335f1862864eec179` / tree `86c7f44cd323601ffa9817defdbcabb2ed241054` |
| Local handoff, same tree | `ac87d6f305e513237b3cefa6b25c1ee35bdecfee` |
| Fixed comparison base207 | `df10fe26a308407237f9ccbc636c8bb61f55b84f` / tree `4b694124197ae8ce271f14307d12abc43c719406` |
| **Reviewed and executed source** | **`49bcb0f2c63b20ac7878ba4aebd6bc433d44925f`** |
| **Reviewed tree** | **`81845317f8c1cfe7c76846aa54403fb49cc141b0`** |
| Reviewer branch | `review/generation10-core-independent-20261120` |

The worktree is `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation10-core-independent`. Root worker40 is independent of author worker39. The generation9 handoff/reports, accepted D7/D8 and relevant component interfaces were read before review. No author source, remote ref or external-owner worktree was changed. The sole review commit adds this report directly after the tested source. Both standards and specification axes were assessed within this assigned scope without further workers.

## Standards

No documented-standard violation or actionable integration smell was found. Every changed file equals its reviewed component source; the composition introduces no new implementation abstraction or replacement feature. Existing runtime command/response conventions, strict parsers and profile-bound pending metadata remain. No standalone coding-standards or issue-tracker file was present in the reviewed tree; accepted decisions and component contracts provide the relevant requirements. Automated formatting/type rules are covered by the recorded author checks.

The captured comparison is `git diff df10fe26a308407237f9ccbc636c8bb61f55b84f...49bcb0f2c63b20ac7878ba4aebd6bc433d44925f`. The stated base is the actual merge base. Each original input tree was compared independently with 207. Overlaying their disjoint deltas reproduces the entire combined tree, including modes and blob IDs.

| Input | Exact head | Changed paths versus207 |
| --- | --- | ---: |
| PR206 | `825a85a55a1e0a43d6f416696fabee94913a2f18` | 7 |
| PR208 | `0e148564743b1ee353abdbdf8931fec464f09870` | 17 |
| PR209 | `c8695278c3b85ac75fc2ad3318830aa8a08f4d50` | 4 |
| PR210 | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265` | 6 |
| PR211 | `e7397f45f68f18fae8857ea31b58a04e248df404` | 3 |

The **37-path union contains26 additions and 11 modifications**. All 2,449 untouched base entries remain exact; the base has 2,460 entries and the result2,486. Four merges start at210 and incorporate206,208,209 and 211 in that order. Each has the preceding combined source first and its original component head second. All five input heads remain ancestors. There are no overlapping component paths or new hunk resolutions.

All **56 npm commands**, other manifest fields, the npm lock and all **six workflows** remain byte-identical to 207. The four earlier repairs remain exact: portal cleanup directory identity, initiating-route ownership, pending accepted-release open cancellation and finalized Solana reconciliation context, including their maintained regression files. The financial harness and both real refund waits are unchanged.

The Cargo lock has 412 package records. Only the ctutils version/checksum changes, from 0.4.2 to 0.4.4; all 411 other records and the remaining ctutils fields are unchanged. The new checksum is `12218662ccac37d9714f2191252553d67585b97df8c839cbe49e0bde278dc865`. **The known crypto-bigint0.5.5 advisory remains.** This review supplies no waiver, SBPF reachability conclusion or new Cargo execution;209's earlier150 upstream library tests retain their separate attribution.

## Specification and interaction boundaries

No missing requirement or unrequested behavior was found in the integration delta. The most relevant interaction is complete-backup verification with recovered personalization and profile lifecycle. The new operations retain generation/selection-bound replies, strict typed receipts and a Worker-owned revision fact. The existing VaultService authenticates the complete file and checks the persisted envelope. Read-only personalization may retain that fact; mutation attempts retire it, and lock/reopen, cancellation or revision changes cannot publish a stale receipt. Pending document metadata retains neither file bytes nor passphrases. Owned message copies are cleared at the posting and dispatch boundaries. Focused tests used actual in-memory VaultService/WorkerEndpoint components and separate document-port fixtures; this is not native-browser isolation proof.

Public QR backup fingerprints remain separate from private complete-file verification. QR review retains `authority: none`; the public fingerprint path neither decrypts nor restores a vault. The211 clock change refreshes injected UTC seconds after hash/verifier awaits and clamps observed time within a decode. Signature/hash bytes, chain policy, controller cancellation and confirmation-time admission remain unchanged. Focused controller cases exercised late results, context changes, expiry and public fingerprint review on this combined source.

Relay206 retains integer clock/capacity bounds and imports none of the other new features. Transport210 retains all per-trial call/fetch/physical-POST/complete503/error assertions, actual prior socket warmth and teardown ownership. Only an invariant-clean cold trial allows another bounded sample; assertion, execution and teardown errors abort. No application retry is introduced. No signed-update UI, trust root, external origin, optional default wiring or financial authority is activated. The screened historical updater-browser source is excluded.

Accepted D8 still requires applicable exact-source checks and independent review. The owner's current source-integration authorization does not waive those gates. Optional packages remain absent from this core and retain accepted D7's one-package boundaries, applicable standalone named-review condition and separate default-composition gate.

## Checks executed by this reviewer

| Own action | Actual result |
| --- | --- |
| Independent complete Git-object reconstruction and ordered-parent checks | Passed; exact 37-path union and all protected entries |
| Cargo record comparison | Only one of 412 records changes; exact 209 resolution retained |
| Focused maintained selection, eight files | **54/54**, zero failure/skip/cancel/todo; **12.295397 seconds** |
| Source whitespace check | Passed |
| Independent author-log verification | All 12 logs match their byte lengths and SHA-256; raw full/tooling/policy totals parsed |
| Actual emitted files and module-source checks | All 27 files and 256 module hash records checked |

The focused execution used Node24.22.3 and the repository's pinned loader. It covers backup runtime/publication/personalization interactions, QR lifecycle/expiry, relay input guards and strict transport qualification controls. These are maintained local fixtures, not new exploit inputs or native financial activity. No runtime/test file was authored or modified.

The root coordinator moved the matching physical dependency cache from its completed generation9 QR review into this new checkout after disk space became constrained. Both npm lock files matched; no additional copy or symlinked dependency root was used. The transfer receipt is `verification/generation10-review-cache-transfer.json`. No other-owner cache was modified by this reviewer.

The exact executed command was:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-concurrency=1 apps/web/test/backup-verification-runtime.test.mjs \
  apps/web/test/backup-verification-publication.test.mjs \
  apps/web/test/backup-verification-independent.test.mjs \
  apps/web/test/qr-review.test.mjs \
  packages/qr/test/async-expiry.test.mjs \
  packages/relay/test/ad-input-boundaries-independent.test.mjs \
  apps/web/test/solana-withheld-transport-qualification.test.mjs \
  apps/web/test/solana-withheld-transport-independent.test.mjs
```

## Independently checked author evidence

The author ran the full core suite once on 49bcb0f2, separately passing **2,309/2,309**,44 tooling,57 policy,four TypeScript configurations,32 Python specification tests,238/142 import boundaries,default/demo builds,docs/governance and source whitespace. All 12 command receipts exited zero. The reviewer rehashed every retained log and parsed the raw numerical summaries; these are author executions, not repeated reviewer executions. The source-bound execution receipt is `verification/generation10-core-execution.json`.

Every actual default/demo output was hashed: **13 default files and 14 demo files**. Every asset listed by local build evidence matches its bytes/hash. All 256 graph module hashes match actual source files. Document graphs have 93/95 modules, private Worker graphs30/30, public QR graphs4/4; all contain zero optional-package imports. Only the private Worker includes the four accepted personalization modules. The QR graph retains authority:none, privateRuntime:false and network:false. Both variants retain ReleaseEnabled:0, false release acceptance/signed release, empty connectOrigins and connect-src 'none'. These are emitted source/artifact checks, not runtime-sandbox or complete XSS proof.

Documentation retains false semantic approval/publication and stale immutable evidence. Governance retains 12 historical records,zero pending,57 rows and 13 stale references, with economic preparation false. No earlier fixture success approves distribution of the current client.

| Rehashed author log | SHA-256 |
| --- | --- |
| `generation10-core-full.log` | `d72d4686bb1568a437ec6a12667730b84b8b86772cdb561a115392812bf5d00c` |
| `generation10-core-tooling.log` | `90e7f51970c1f2a5169dabff9d75cdba7b79e6ce1a0b149c7e259cd58af593e3` |
| `generation10-core-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `generation10-core-policy.log` | `74b536ca0261b2ea4495806f24bd315d090f9feaaf6e5d6d502da9b77ee92a7a` |
| `generation10-core-boundaries.log` | `a2afff1ba06119367082cb0aec36223a649eae2fcc0580855c50a042cf9f7684` |
| `generation10-core-build.log` | `3afc8ae008321b743e6ca474df66cae86252277aec91a4f6b07567c0c9721775` |
| `generation10-core-build-demo.log` | `e2dc1489b78d2a471fd94103cdd041b8b4f77cd57b9815eabffd8a3f34fcf083` |
| `generation10-core-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `generation10-core-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `generation10-core-specs.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `generation10-core-spec-tests.log` | `4113a2adaabe80dc0bf492950de2e11bc156045557f7c19391a9d2eaafd4b11d` |
| `generation10-core-source-whitespace.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

| Independent evidence | SHA-256 |
| --- | --- |
| `core-source-check.py` | `9cb4ab47ad9957ee02e4f8848f73d47319f7cc31b22ab697178b35eca7493d8f` |
| `core-source-check.json` | `1413268febde1333f2772298152a97a271be117a033ec7c995eea29fca7e29c0` |
| `core-focused.log` | `d71139aa9b401ba6f2087cbfd9054fb6443f34a0f9834b6e5a8025efc72993c6` |
| `core-focused-results.json` | `c870bbeb014fc40db777893484b02aa68f6b3885db299e2ce6d797acfbc0b49d` |
| `core-author-log-check.json` | `628e0cc9fa2118517c01a8589ff47658908c79efc93c5df04c3440a317ba9312` |
| `core-artifact-check.json` | `6fd2f3069cdfaecaf7fdbdb17bf53bb0ff214ec4a642147a937e38fee9d67322` |

All independent files above are preserved under `/workspace/scratch/6bd6e00af1c0/verification/generation10-independent/`.

## Remaining conditions and report handoff

This local review does not establish hosted Chromium, physical-device, native validator, SBPF or financial execution. Existing source-bound203/205 passes do not transfer to this composition. The retained crypto-bigint advisory and maintenance warnings remain unresolved; this report is not a risk waiver. Preserve all strict financial assertions and real refund waits.

The author may append this report and its own report/plan after the tested source. Those additions must be report-only. The optional layers must then use that final report checkpoint as their exact base, with a new independent optional review and fresh combined execution. Root publication must verify the resulting remote tree and ordered source parents; connector-created commit IDs may differ. No remote identity or hosted merge checkout was independently executed here.

Standards findings:0 actionable integration findings. Specification findings:0 open High/Medium integration findings. Known external qualification and advisory conditions remain as stated.
