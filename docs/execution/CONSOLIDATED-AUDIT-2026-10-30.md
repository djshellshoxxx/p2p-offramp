# Consolidation, continuation and whole-repository code audit

This report supersedes the earlier local-only execution report. The integrated
branch is `integration/all-compatible-work`; local intake started at `8ff3d28`.
All reachable published compatible heads were consolidated with ancestry-preserving
merges. Original branches, commits and evidence remain intact.

[The consolidated execution prompt](CONSOLIDATED-COMPLETION-PROMPT.md) records the
continuation contract, including the final canonical acceptance gap found and
completed during review.

## Consolidation evidence and resolutions

[The ancestry inventory](CONSOLIDATED-ANCESTRY-2026-10-30.json) records all 23 remote
heads observed at intake. The three maximal compatible heads were:

- `work/p2p-consolidated-20261030` at `68fb469` — remote recovery, integration,
  private G16/G15, relay/crypto/exchange, screenshots and owner-produced fixes.
- `work/p2p-pr14-finish-handoff-20261030` at `8c8911e` — includes newer
  `claude/sweet-noether-arf6ne` at `391653e` and exchange evidence.
- `work/p2p-validation-20261030` at `11ce9e4` — additional validation artifacts.

Merge checkpoints are `f7f0b45`, `ea77fe7` and `b4a7050`. All other compatible
remote heads are ancestors. `feat/custodial-ledger-foundation` at `52e6987` is
preserved separately because its custodial design contradicts the normative
client-only, noncustodial architecture. A cited unpublished G16 object `beb9866`
was absent from both local objects and published refs; it is not falsely counted
as included. A final remote-head readback found no changes during intake.

Semantic resolutions preserve both lineages' tested behavior:

- The canonical remote profile-bound saved-review protocol and deletion UI are
  retained. Older encrypted local review wrappers remain readable, idempotent and
  deletable without rewriting original vault records. Activity retirement,
  selection-generation isolation, strict reply parsing, atomic revalidation and
  plaintext cleanup remain enforced.
- Canonical relay modules remain the public facade. The earlier restricted local
  profile and its independent tests remain explicitly named `local-pool` and
  `advertisement`; they are not substituted for canonical Nostr interoperability.
- Both journal APIs remain available to their existing consumers. Restored terminal
  strings alone never authorize a successor; native verification capabilities are
  live, nonpersisted and re-established after recovery.
- The canonical Foundry escrow and earlier isolated escrow are different immutable
  deployment profiles with different ABIs. Each retains its own reader/builders,
  fixtures and tests; neither is silently fed the other's representation.
- Existing release-manifest machinery is now present. The earlier local-only
  statement that implementation/schema was absent is obsolete after consolidation.
  A trusted live key pin, qualified deployments and external acceptance are still
  separate gates; self-consistent test fixtures are not trusted production roots.

## Finished features

Messaging identity recovery now has an explicit consumer migration:
`adoptRestored(session, recordId, sourceProfileId, signal?)`. It authenticates the
live destination snapshot, validates the identity/keypair, checks active identity
uniqueness and changes only the embedded profile binding through CAS. It returns
an identity reference, never an unlocked handle or signing authority. Original
records, key, ID, retirement state and source vault remain intact. Actual encrypted
export/fresh-key restore/adoption/unlock preserves the public identity. Wrong
source, malformed keys, conflicting identities, cancellation, lock, concurrent
writes and durable late completion are tested (22 direct identity tests).

`npm run test:exchange:evm` now composes the canonical relay, real NIP-17/44/59
crypto, signed advertisement and terms exchange, exact reviewed bytes, both EVM
acceptances, encrypted G12 journal and native canonical escrow in one bounded
loopback journey. Seven checks cover five negotiated orders and two actual
release/refund settlements, four sends with four durable markers, altered-byte
and replay refusal, chain-time funding-window checks at reserve and send marking,
and actual lost-response/fresh-key recovery without resending. Refund principal
is checked against seller balance after fees, and the escrow ends empty. This
test-only composition is in CI and adds no app trading or network capability.

## Whole first-party source audit

Separate reviewers covered full source, not just merge hunks:

| Slice | Coverage |
|---|---|
| State/UI | All schemas, vault/IndexedDB/crypto/backup/migration, identity/provider/recovery, full app runtime/Worker/facade/controller/UI/main/demo/testnet code and related tests. |
| Domain/transport/build | All domain modules including private G16 hosts/ports, terms, payment preflight, composition, authority and both journals; all relay and transport source; build/artifact scripts, root scripts and vectors, configuration, CI, dependency provenance and both archival reference adapters. |
| Private crypto/release | All eight Nostr crypto modules, all three exchange modules, all three security modules, all three private EVM schema modules, facades, fixtures, independent vectors and associated tests. |
| Custody/native tooling | Both escrow profiles and first-party test actors, wallet source/builders/adapters/submission, chain reader, compiler/harness, local-chain scripts, all Sepolia kit/record/sign/trade scripts and their tests. |

Fourteen actionable P2 classes were reproduced, fixed and regression-tested:

| Finding | Resolution |
|---|---|
| Restored terminal journal labels authorized successors without fresh native proof | Live verification capabilities and native revalidation before reserve/recovery; contradictory state reorgs, explicit replacement consent retained. |
| Private event/chat error classifiers could throw on hostile/revoked thrown objects | Opaque error brands, descriptor snapshots and fixed boundary normalization. |
| Crypto inventory catch classifiers could themselves throw | Opaque classification across all input roots; blocking findings replace raw rejection. |
| Transaction builder hash/value/calldata read different snapshots | One detached descriptor snapshot drives all encoding, values and reported bindings. |
| Missing/unreadable Forge records allowed an uncertain deployment to be retried | Exclusive, durable pre-broadcast account/nonce attempt marker; only matching finalized native reconciliation clears uncertainty. |
| Sepolia RPC and revert probes lacked stream/protocol bounds | Shared bounded, no-redirect/no-credential JSON-RPC transport, captured matching IDs and strict envelopes; narrowly sanitized revert bytes only. |
| Publications bypassed the relay's physical connection cap | Shared four-slot accounting includes reads, publications, closing and native drains; explicit backpressure rather than extra sockets. |
| Advertisement maker could differ from signing author | Construction, validation and discovery bind maker to the native signing key. |
| Runtime discriminator changed between reads | Command/message snapshots must agree with the discriminator used to select their schema. |
| Deleted/loaded review byte copies escaped cleanup | Wipe before dropping records and in all completion/failure paths; retained-reference regressions verify zeroes. |
| An invalid opening clock could publish an unlocked handle before failing | Validate/arm the deadline before publication and fail closed with worker termination. |
| External cancellation after durable send marker still reached the wallet | Post-marker abort guard returns unknown and keeps the reservation without a wallet call. |
| Exceptions during/after a marker were mislabeled unavailable | Marker-attempt uncertainty remains BROADCAST_UNKNOWN; no repeat send is inferred safe. |
| Delayed request timers allowed late Worker mutations | Absolute monotonic job deadline plus trusted pre-CAS/pre-add guards for save/delete/create/restore; already committed winners remain locked, retained and uncertain. |

The published-head review then reproduced and closed four additional P2 classes:

- One invalid saved review suppressed unrelated valid records in a mixed load.
  Per-record verdicts now preserve valid display and invalid-record deletion,
  without rewriting either source record or weakening plaintext cleanup.
- An unset Sepolia signing-key pin accepted a substituted self-signed trust
  bundle. Ordinary build, runtime and signed CLI verification/acceptance now fail
  closed with no owner key configured. Test fixtures supply a separate explicit
  pin through trusted API composition and display unapproved local-proof labels;
  no production key or new CLI/environment pin bypass was introduced.
- An edited planned trade-state label escaped its output directory and overwrote
  a terms-review file. Exactly one release and one refund slot are now required
  before negotiation, without restricting an explicitly chosen operator state path.
- Eight historical diagnostic runners accepted path components as capture labels.
  Bounded filename-component validation now precedes file creation and child
  execution; existing captured logs and receipts remain unchanged.

[The hosted-review disposition ledger](HOSTED-REVIEW-2026-10-31.json) records all
50 original Sonar annotations, their exact locations and review evidence, the
additional reproduced findings, and validation. Protocol-required SHA-1 for the
loopback WebSocket fixture, canonical code-unit ordering, public development
keys, loopback HTTP and intentional operator file paths were reviewed in context.
No scanner setting, exclusion, gate, branch protection or issue status was changed.
The ledger does not turn the recorded failing Sonar analysis into a passing one;
new-head hosted results are tracked separately in final delivery.

The source audit and fix reviews identified no P0/P1 findings and no unresolved
reproduced actionable finding in that coverage. This is AI-assisted engineering
review, not independent professional cryptographic/security approval. Third-party
source/binary internals are not claimed audited. Archived author evidence is
retained verbatim, including historical failures and TAP whitespace.

## Verification

On Node 24.19.0 / Linux x64, Chromium 154.0.8037.57:

- Final integrated Node suite: **908 pass, zero failures/skips/cancellations**.
- All TypeScript configurations, import boundaries (92 production sources), build
  policy, default/demo builds, 26 seeded fuzz tests, 12 Python tool tests and
  173-spec structural/link audit pass.
- Native vault/CAS/reseal/browser-kill/Worker/policy and lifecycle two-tab tests;
  emitted shell, review persistence/deletion, cross-tab conflict and fresh-key
  recovery; private G16 document/Worker/message-port/physical-drain and G15
  verification browser fixtures pass. No external application egress or wallet
  prompts are enabled by these fixtures.
- Official exact Foundry **1.5.1-v1.5.1**, commit
  `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, and pinned solc **0.8.30** were
  obtained and verified without changing project pins or version strings. Exact
  submodule commits were materialized. Default and CI Forge profiles: **82/82**
  each; committed ABI matches exactly. Canonical local trade **8/8**, actual native
  reconciliation **5/5**, Sepolia hygiene **7/7**, kit **9/9**, trade **13/13** pass.
  Sepolia fixtures use only private loopback chains and temporary public test keys.
- The isolated earlier escrow's seven adversarial scenarios and two-party
  journal/native-history/fresh-key recovery harness also pass.
- Root and isolated tool-package advisory queries each report zero advisories,
  including development dependencies, at this check. This does not certify native
  binaries or rule out undisclosed vulnerabilities.
- Additional final diagnostic-label tests: **16/16** across all eight runners;
  edited trade-state tests: **2/2**; trust-source tests: **8/8**, including two-key
  substitution and explicit unpinned rejection. Emitted local-proof browser
  artifacts are marked unapproved; the ordinary unpinned testnet build is refused.
- Foundry CI Actions are pinned to immutable revisions. Source gates and security
  settings were not weakened. Parent/archived CI does not qualify this head;
  published exact-head CI is tracked separately in the final delivery.

Native evidence logs and exact tool hashes are retained under `/workspace/work`.
No tool processes or Anvil nodes remain after checks. The managed workspace and
verified tool installations are retained for continuation; no paid instances were
created.

## Retained custody and composition limits

The isolated earlier escrow intentionally rolls a failed payout back to Funded
and retries only the stored recipient. A separate native reproduction using an
EIP-1271 seller that permanently rejects native payments confirms that three
refund attempts revert and its principal/liability remain funded. The canonical
profile can defer a failed push, but withdrawal still requires that same recipient
to accept payment. Neither profile promises recovery for a permanently rejecting
recipient. Alternative beneficiaries would change the immutable custody model
and require a separate reviewed profile; this is an unresolved wallet-liveness
qualification limit, not a fixed finding.

Pure calldata builders deliberately have no chain clock or RPC. The external
Sepolia tool already checks authoritative funding time and simulates before
sending. Any future app composition must enforce that policy before reserve and
the durable send marker; the new loopback composition proves both checks and
zero wallet calls for expired or out-of-range windows. It does not enable a
production composition.

The existing manual Sepolia tool's explicit `--unsigned-registry` experiment is
retained as `verified:false`. It is separate from signed release acceptance and
the disabled app. The null-pin fix adds no CLI/environment pin override, and no
live unsigned or signed trade was executed during this work.

## Remaining gates and status

Trading remains disabled: `ReleaseEnabled=0`, default `connectOrigins:[]`, no wallet
signing/submission controls in the shipped offline preview, no production deployment
or live-funds transaction. No live Sepolia deployment was performed. Approval of
real trust keys, deployments/assets/endpoints, professional review and deployed
host/device qualification remains external. Unsupported G15 locator/rotation and
other later roadmap integration are not represented as implemented or accepted.
The full product remains incomplete; source consolidation and the completed local
features are distinct from a funds-enabled release.
