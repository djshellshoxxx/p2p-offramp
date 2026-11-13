# D1 implementation plan, proposed (revision 2, 2026-11-11)

> **Status: PROPOSED, NOT APPROVED.** This document grounds the accepted D1 decision (Option B) in the current source tree and lays out a test-first implementation plan. It authorizes no code change. D1 touches signing, EIP-712 and terms binding, which makes it Tier C under D8: the owner must approve the format (Q1), and the schema/storage coordinator must answer Q2, before any Tier C code is merged.
>
> **Provenance.** Three source-reading agents, a planner, and two adversarial re-critique rounds (workflows `wf_70faa989-5d2` and `wf_5cd96a6e-c6c`). Round 2 confirmed that all 12 corrections from round 1 are fixed, and its spot-checked citations are accurate at `05cbd5f`. It still returned **NEEDS_REVISION**. The remaining corrections are reproduced in the appendix and must be folded in before T00's independent review. Line citations refer to `05cbd5f` and to the named PR refs.

# D1 implementation plan, revision 2: version 2 peer acceptance (Option B)

Base: `claude/vibrant-cray-ny4gum` at **`05cbd5f`**, reviewed read-only.
- Since the r1 base `062db27` there are three commits (`75d8846`, `7f56204`, `05cbd5f`). They touch apps/web (including `apps/web/src/runtime/worker-endpoint.ts`, +265 lines), the new `packages/personalization` stores (`favorites.ts`, `trade-draft-store.ts`), `packages/schemas/src/runtime.ts` and `saved-review.ts` (new source `'local-draft'`, `saved-review.ts:17,23`), plus tests, scripts and docs.
- No file in `packages/exchange`, `wallet`, `domain`, `storage`, `messaging`, `nostr-crypto` or `contracts` changed, so every citation into those packages carries over unchanged. Only the worker citations moved: `savedEntries` is now `worker-endpoint.ts:55-64` (the `kind !== 'trade'` skip is `:59`), and the `skipped` reply is `:458`.
- The working tree was clean when this revision was written. The uncommitted `apps/web/test/retention-worker.test.mjs` edit the critique saw has since landed in `05cbd5f`.

Merge tier: **D8 Tier C** (signing, EIP-712, terms binding). Code may be developed and tested in parallel, but nothing merges to `main` without owner approval (`pr/50:docs/adr/ACCEPTED-DECISIONS-2026-11-04.md:12`).

D9 (durable send marker) is being implemented in open PRs #69-#75. Those PRs touch only `packages/wallet/src/evm-execution.ts`, its test, and `packages/domain/test/intent-journal.test.mjs`. This plan does not design D9 and edits none of those files. Where D1 needs something from the shared storage layer, §5 states it as a **coordination request**: an interface the D9/W1 coordinator owns.

## 0. What changed

### 0.1 This revision (re-critique R1-R9)

| # | Re-critique item | Where it is fixed |
| --- | --- | --- |
| R1 | The lock pre-check was underspecified, which reopened #2 under concurrency | §3.2 rewritten: **rule E**. Inside the lock, every path re-reads the session, re-runs `transition()`, the §2.2 hash rule and the has-terms test, and takes the tombstone target from the current `session.terms.hash`. The commit assigns the `next` value computed in the same synchronous block, never `transition(...)!`. Outgoing cancel accepts current `taken` or `offered`. P3 and P4 are restated (§3.4). New interleavings I13-I17 cover both cancel directions (T13-T15). |
| R2 | The display conflated the arrival deadline with the agreement's expiry | §3.5 now uses two deadlines: `offerDeadline` (arrival, D1:42) and `fundingClose` (`block.timestamp`, D1:51; `BasicEscrow.sol:297-301`). `both-verified` lasts until `fundingClose − 120`, so T-MAP and §3.6 no longer end after about an hour. T-DROP restated. Choice (g) is in Q1. |
| R3 | The ledger could fill permanently, for as long as the counterparty chose | §2.6 adds an acceptance horizon (`acceptBeforeSeconds ≤ now + 604,800`) at offer and at receipt: `HORIZON_EXCEEDED`. §2.5: records without a tombstone are pruned at `max(notAfterSeconds) + 86,400`. Tombstones may exceed the binding cap up to a hard ceiling, then go pending. Tests in T09 and T13. Choice (f) is in Q1. |
| R4 | The C1 code edits belonged to no task | New serialized task **T09K** (§7), gated on C1. It lists every closed kind set and every `Record<RecordKind, number>` user. The retention test moves into T09K. The apps/web worker test is labelled a **regression guard**, not RED. |
| R5 | The exchange port set was incomplete | §4.3-§4.4: every port is listed. `termsDigest` is the existing `hashTerms`, because the termsHash *is* the TradeTerms EIP-712 digest (D1:17, `evm-terms.ts:120`). The `domainFor` port is **removed**: the domain is derived from `ReviewedEvmTerms` registry values (D1:46). A port known-answer check runs at construction. |
| R6 | Errors in the task graph | Port types are declared in `domain`, so T08 no longer depends on T07 (no `packages/wallet/src` import from CORE). T05 → T03, T04. §7 has been rebuilt. |
| R7 | The base was stale again | Rebased onto `05cbd5f` (header above). |
| R8 | C2/C3 accuracy | C2 now says the hazard is pre-existing: durable chat, favorites, trade drafts and saved reviews already commit with CAS. It covers the window outside journal jobs (`submit(input, expectedRevision)`, pr/75 `evm-execution.ts:62,86`) as a liveness cost. P2, C3 and I11 now give the real sequence: `CONFLICT` plus vault lock (`vault-service.ts:370`), then `LOCKED` on reload. |
| R9 | Packet coverage gaps | D1:82 is covered by the threat T-POL, a fresh scheme recheck before economic preparation (§2.8), and tests in T06, T08 and T14. §8 adds the terms-field negatives and a D1:69-70 coverage map. ERC-1271 vectors are recorded as an explicit deviation (h). The protocol-discovery gap is stated in T00 and §10. |

### 0.2 Prior critique (12 items): all fixed in r1. Pointers updated for r2.

| # | Item | Where |
| --- | --- | --- |
| 1 | Synchronous `readyToCommit`→commit | §3.1; rule E (§3.2); I1-I17 |
| 2 | Null-hash cancel against `offered` | §2.2; rule E5; I3, I14 |
| 3 | Accepted versus tombstone | P1-P5 (§3.4), §3.5, I4-I6, I11, I13 |
| 4 | D9 interference | T-D9, C2/C3 (§5), Q2 |
| 5 | No shared `trade` v1 kind | §2.5, C1, T09K |
| 6 | Reserved-contract inventory | §2.1 (choices (a)-(h)), §2.6, §2.7 |
| 7 | T-KEY tests | k1 (T14) and k2 (T13) |
| 8 | Threats a-f | §6 T-PRIV, T-RPC, T-ORDER, T-VER, T-FULL, T-DROP |
| 9 | Factual fixes | §1-§4; base rebased (R7) |
| 10 | T01 churn | T01 dropped; one `export` keyword in T07 |
| 11 | Parallel work and placement | §4.0, §7 |
| 12 | G16 signatures | §3.6 |

---

## 1. Decision recap with exact citations

**Accepted text (owner, 2026-11-04).** "Option B: version 2 offer/accept messages carry each party's EIP-712 `TradeTerms` signature plus a wallet-signed `PeerAcceptance` binding role, account, both Nostr keys and expiry, keyed by `(termsHash, role)`. Cancel or reject tombstones the `termsHash`. No downgrade to bare signatures. The seller can still fund without any acceptance." (`pr/50:docs/adr/ACCEPTED-DECISIONS-2026-11-04.md:10`)

**Packet status.** "Nothing is implemented yet, and the version identifier, exact field names and independent review this packet requires still come first. Until that work lands, no wire format, signing rule or trust transition changes." (`pr/29:docs/adr/proposed/D1-peer-acceptance-carrier.md:3`. The file is identical on `pr/49`, and its last commit is `89d0a92`.)

Accepted sub-rules this plan implements. All are packet lines on `pr/29`.

| Rule | Packet line |
| --- | --- |
| `PeerAcceptance` is a small EIP-712 struct **in the same domain**, with `termsHash`, role, account, own Nostr key, counterparty Nostr key and `notAfterSeconds`. It does not touch `TradeTerms`. | D1:31 |
| Option B is "Option A plus" the binding. Option A puts the seller's signature in `terms-offer` and the buyer's in `terms-accept`. | D1:29 |
| The escrow ABI and the `TradeTerms` struct stay unchanged. | D1:27 |
| The seller signs first and the offer carries the signature. The buyer verifies, then signs. Neither signature covers the other, and `seller != buyer`. | D1:41 |
| The effective deadline is min(`acceptBeforeSeconds`, `notAfterSeconds`, envelope expiry). A message that arrives after it is refused. | D1:42 |
| Off-chain, nothing transitions out of `accepted`. Withdrawal needs a separately reviewed change. | D1:43 |
| Cancel or terms-reject durably tombstones `termsHash`, including across a new `(ad, buyer key)` session. | D1:44 |
| Bindings are keyed by `(termsHash, role)`. An identical resend is a no-op. A binding naming different Nostr keys is a conflict and fails closed. Deduplication never uses signature bytes. Storage is durable. | D1:45 |
| The domain is rebuilt from the local registry, never from the message. | D1:46 |
| No downgrade: a bare `TradeTerms` signature is refused. | D1:47 |
| The scheme is derived from account code at a pinned block, never from a sender field. EIP-7702 needs an explicit policy. | D1:48 |
| ERC-1271 verification is point-in-time and unfinalized. Counterfactual wallets are unsupported. Low-s applies to EOA signatures only. | D1:49 |
| v2 needs an explicit per-message byte budget. | D1:50 |
| The contract compares against `block.timestamp`, so expiry is displayed with a safety margin. | D1:51 |
| A v1 reader fails closed on v2. | D1:53 |
| Receiver checks 1-7 come before any "accepted" display. Funding status comes from chain observation only. | D1:57-63 |
| Vectors come from at least two independent implementations, are frozen, use no invented hex, and include the listed positive and negative cases. | D1:67-70 |
| Open requirements: key lifecycle, session mapping before economic preparation, the user seeing the actual statement, 7702, ERC-1271 timing, policy changes mid-trade, identity layers. | D1:77-83 |
| Out of scope: funding, the trust root, and G16 versus ABI. | D1:89 |

The escrow never sees acceptance signatures. `_bind` checks only `terms.seller == msg.sender` (`contracts/evm/src/BasicEscrow.sol:292`, cited at D1:19). D1 therefore changes no on-chain authority. Its funding-time rules are `block.timestamp < acceptBeforeSeconds` (`:297`) and `now + MIN_DURATION ≤ escrowExpiry ≤ now + MAX_DURATION` (`:298-301`; `MIN_DURATION = 1800` `:87`, `MAX_DURATION = 604800` `:90`). §3.5 uses them.

Related records:
- D8 Tier C gate: `pr/50:…ACCEPTED-DECISIONS-2026-11-04.md:12`.
- D9 marker: same file, line 13.
- CURRENT-STATE lists D1 as depending on D9 (`docs/development/CURRENT-STATE.md:111`). This plan reads that as two concrete needs: a persisted record allocation (C1) and serialized vault writes (C2). Both are in §5 and gate the merge of the persistence tasks.
- PO-B03 acceptance criterion: "No signature or wallet-identity assertion from an unrelated message key." (`docs/superpowers/specs/2026-11-09-accelerated-beta-design.md:43`)
- PO-B02: "Reserved schema/version decisions remain with their coordinator." (same file, `:42`)

Core review instruction: "Reconcile D1's reserved acceptance contract before implementing signed peer acceptance; build independent vectors and downgrade/tombstone tests." (`docs/development/2026-11-09-core-review.md:114`; scope at `:70`)

---

## 2. Reserved-contract reconciliation

### 2.1 Inventory of what is reserved

| Item | Where | Status | Reconciliation |
| --- | --- | --- | --- |
| PeerAcceptance version identifier and exact field names | D1:37, D1:76 | Deferred; needs independent review | Proposed concretely in §2.2-§2.3. Merge is gated on T00 review and on Q1. |
| "exact acceptance version/fields, byte budget, restore lifecycle and contract-wallet policy" | core-review:70 | Reserved, meaning undecided | Fields: §2.3. Byte budget: §2.4. Restore lifecycle: §2.7, part of Q1. Contract-wallet policy: refused in profile 1 (§2.8); Phase 4 is deferred (DEF-1, §10). |
| Governance proposal placeholder: `priorVersion: "terms-accept-v1"`, `proposedVersion: "pending-selection"`, empty readers and writers, `status: "draft"` | `pr/48:docs/governance/peer-acceptance-carrier.proposal.json:5-6,10-11,18` (identical on pr/26/28/35/47/48; absent on HEAD) | Placeholder | After Q1, whoever lands that governance stack sets `proposedVersion: "p2p-offramp-terms-v2"` and fills readers and writers from T00. It is not edited from here. |
| Governance decision record: `decisionId ab7aaa1b…`, `affectedCapability: "peer-acceptance-carrier"`, `reviewers: []`, `previousArtifactHash`/`nextArtifactHash: null`, `status: "proposed"` | `pr/48:docs/governance/peer-acceptance-carrier.decision.json` | Proposed, with no reviewers | T00 records the independent reviewer's identity and the spec artifact hash for this record. The record moves past `proposed` only through the governance stack's own process, after Q1. D1 code does not depend on it. |
| "reserved persistent schema version" | `docs/consolidation/2026-11-09-pr58-pr60-merge.md:29`; `accelerated-beta-design.md:22,42` | Owned by the coordinator | D1 needs a persisted allocation of its own (the ledger). It is requested as C1 (§5) and wired by T09K. D1 claims no `IntentV1`/journal version. |
| G20 text envelope reservations: `version 2` → `UNSUPPORTED_VERSION`; kinds `terms` and `receipt-status` → `UNSUPPORTED_PROVIDER` | `packages/messaging/src/envelope.ts:34-36`; `packages/messaging/test/envelope.test.mjs:23-24`; `packages/messaging/README.md:20-22` | Reserved for G20 | **Not used by D1.** D1 rides on the exchange's own envelope (`packages/exchange/src/messages.ts`). A regression test asserts the G20 reservations still refuse. |
| v1 exchange identifiers: `EXCHANGE_TOPIC 'p2p-offramp-terms-v1'`, `AD_D_PREFIX 'p2p-offramp:v1:'`, `v: 1` | `packages/exchange/src/messages.ts:9-11,71` | Live v1 | v1 keeps its meaning, including `{revision}` (D1:85). The ad address format is unchanged in v2 (see the protocol-discovery gap, §10). |
| EIP-712 domain `P2POfframp` / `1` | `packages/wallet/src/evm-terms.ts:15,87`; `BasicEscrow.sol:71-81` | Live | Reused unchanged (D1:31 "same domain"); see §2.3.3. |
| G16 spec `AcceptanceV1 {termsHash, role, walletAccount, signature}` | `01_…/module_1.8.1_trade_terms/spec-signed-trade-terms.md:31-32` | Live (worker bundle input) | Unchanged. The v2 wire item is a separate type. `verifyEvmAgreementBundle` (`packages/wallet/src/evm-agreement.ts:52`, input keys `:63`) keeps its 2×4 shape and consumes the `TradeTerms` signatures, which are now reachable (§3.6). |
| **Design choices that differ from, or narrow, the packet wording.** Listed so the reviewer approves each one explicitly. | — | Proposed | (a) **Role-indexed keys:** `sellerNostrKey`/`buyerNostrKey`, where D1:31 says "own"/"counterparty" (§2.3.1). (b) **Conflict rule** exactly as D1:45: only different Nostr keys conflict; a different `notAfterSeconds` is a refresh (§2.6). (c) **Pending tombstone** when storage is unavailable (§3.4 P4). This narrows "durably" in D1:44 so that a user's own cancel is never blocked. (d) **Precedence rules and rule E** (§3.2, §3.4). (e) **`bindingTtl = 3600 s`** (§2.6). (f) **Acceptance horizon** `acceptBeforeSeconds ≤ now + 604,800` for v2 terms (§2.6), together with time-bounded pruning (§2.5). (g) **Two display deadlines**: the binding TTL bounds arrival only; the agreement shows as verified until the funding window closes (§3.5). (h) **No ERC-1271 vectors in profile 1**: the D1:69-70 ERC-1271 positive, modes 1-5, revoked approval and reorg move to Phase 4 (§8). All of them are in Q1. |

Conclusion: no artifact on HEAD or any fetched ref fixes a PeerAcceptance format. Reconciling the reserved contract therefore means five things:
- Select the format (§2.2-§2.4).
- Leave the G20 reservations and the D9 journal versions untouched.
- Obtain a persisted allocation from the coordinator (C1) instead of piggybacking on an existing kind.
- Make the restore lifecycle and choices (a)-(h) explicit approval items (Q1).
- Record everything in the specs (T00) for independent review before merge.

### 2.2 Version 2 wire: identification and bodies

- Envelope `v: 2`, with the same ten exact keys as v1 (`ENVELOPE_KEYS`, `messages.ts:61`) and the same five message types.
- Rumor tag `t` = `p2p-offramp-terms-v2` (new `EXCHANGE_TOPIC_V2`), so both the `v` field and the topic tag discriminate. Rumor tags are encrypted, so relays see nothing new. The tag count stays at 4 at most (`exchange.ts:31` `maxTags: 4`).
- **The protocol version is fixed per exchange instance by configuration, not negotiated.** `protocol: 2` emits only v2 and refuses any v1 envelope (`MALFORMED`, no state change). `protocol: 1`, the unchanged default, refuses v2 as it does today (`messages.ts:71`). Mixed sessions are impossible.
- Bodies (exact keys):

| type | v1 body (unchanged) | v2 body | v2 termsHash rule (evaluated authoritatively **inside the lock**, rule E3) |
| --- | --- | --- | --- |
| `take-request` | `{buyerAddress, buyerMessagingKey}` | same | must be null (as v1) |
| `terms-offer` | `{terms}` | `{terms, acceptance}`, `acceptance.role === "seller"` | non-null and equal to the recomputed hash (as v1, `exchange.ts:375`) |
| `terms-accept` | `{revision}` | `{revision, acceptance}`, `acceptance.role === "buyer"` | must equal the current session's hash (as v1, `exchange.ts:381`) |
| `terms-reject` | `{reason}` | same | must equal the current session's hash. This is already the v1 rule (`exchange.ts:381`); v2 adds only the tombstone side effect. |
| `cancel` | `{reason}` | same | Same as v1 (`exchange.ts:386-387`): if the **current** session has terms, null or equal; if it has none, null. A non-null mismatch is `HASH_MISMATCH`. Whenever the current session has terms, the receiver tombstones the **current `session.terms.hash`**, whatever the carried value (rule E5). A carried hash the session does not hold is never tombstoned (§3.2, I15). |

The cancel rule fixes the null-hash race. A buyer still in `taken` sends `termsHash: null` (`exchange.ts:297`: `s.terms?.hash ?? null`). If that cancel crosses the seller's offer, the seller's session is `offered` by the time it arrives, or is offered by an operation still holding the lock. The cancel must therefore be accepted against the state current when it holds the lock, and it tombstones the offered hash (I3, I14).

- `acceptance` (exact keys, flat, so the parser depth stays 3 as in `messages.ts:68`; `parseEventJson` starts at depth 0, `event.ts:198`):

```
{ "role": "seller" | "buyer",
  "account": "0x" + 40 lowercase hex, non-zero,
  "termsSignature": 130 lowercase hex (no 0x),      // EIP-712 TradeTerms signature, r||s||v
  "notAfterSeconds": decimal string, /^[1-9][0-9]{0,11}$/,
  "bindingSignature": 130 lowercase hex (no 0x) }   // EIP-712 PeerAcceptance signature
```

- There is **no `scheme` field** (D1:48 overrides Option A's per-item scheme at D1:29). The verifier derives the scheme.
- There are **no Nostr keys on the wire.** The receiver fills `sellerNostrKey` and `buyerNostrKey` from its authenticated session: the ad author, and the take-request sender, who must equal the seal author (`exchange.ts:330-351`, `nip59.ts:81`). A key the sender carries can therefore never be trusted by mistake (PO-B03).
- `role` must equal the role implied by the message type, so role confusion is a parse failure.

### 2.3 PeerAcceptance typed data (proposed; frozen only after T00 and Q1)

#### 2.3.1 Type string

```
PeerAcceptance(uint8 v,bytes32 termsHash,string role,address account,bytes32 sellerNostrKey,bytes32 buyerNostrKey,uint64 notAfterSeconds)
```

| Field | Type | Value / rule | Rationale |
| --- | --- | --- | --- |
| `v` | uint8 | always `1`; anything else is refused | Mirrors the `TradeTerms` `uint8 v` (D1:17, `evm-terms.ts:12`) |
| `termsHash` | bytes32 | `evmTermsHash(domain, terms)`, recomputed locally | D1:31. The digest already commits to chainId, verifyingContract, networkId and deploymentId. |
| `role` | string | `"seller"` or `"buyer"` | A readable statement in the wallet prompt (D1:79). Hashed as `keccak256(utf8)`, like `stringWord` (`evm-terms.ts:67`). |
| `account` | address | `terms.seller` or `terms.buyer` for that role; lowercase, non-zero | D1:31; D1:60 (step 4) |
| `sellerNostrKey` | bytes32 | x-only key of the ad author | **Choice (a):** role-indexed rather than own/counterparty. Both parties sign the same ordered pair, so a key swap changes both digests and the receiver checks one tuple. Given `role`, "own" is the key indexed by `role`, which carries the same information as D1:31. |
| `buyerNostrKey` | bytes32 | x-only key of the take-request sender | Same |
| `notAfterSeconds` | uint64 | The signer sets `min(acceptBeforeSeconds, now + bindingTtl)`. The verifier requires `now < notAfterSeconds ≤ acceptBeforeSeconds` and `notAfterSeconds ≤ now + bindingTtl + MAX_FUTURE_SKEW_SECONDS` (120, `messages.ts:22`). | D1:31, D1:42. Same width as the `TradeTerms` deadlines. The upper bound limits how long a captured binding stays replayable. |

Encoder refusals:
- `v != 1`;
- `role` not in `{seller, buyer}`;
- a zero or non-canonical account;
- a key that is not 64 lowercase hex;
- `sellerNostrKey === buyerNostrKey` (mirrors `messages.ts:73` `sender !== recipient`);
- `notAfterSeconds` of 0 or above 2^64-1.

#### 2.3.2 Digest

`peerAcceptanceDigest = keccak256(0x19 0x01 ‖ domainSeparator(domain) ‖ keccak256(typeHash ‖ uint8(1) ‖ termsHash ‖ keccak256(role) ‖ account ‖ sellerNostrKey ‖ buyerNostrKey ‖ uint64(notAfterSeconds)))`

It reuses `keccak256`, `uintWord`, `addressWord`, `bytes32Word`, `stringWord`, `eip712Digest` and `domainSeparator`, all **already exported** by `packages/wallet/src/evm-terms.ts:43-89`. They are imported from that path; nothing moves (§4.2). `exactDataObject` (`evm-terms.ts:26`) is the one unexported helper; T07 adds a single `export` keyword to it.

#### 2.3.3 Domain separation from TradeTerms

- The domain is identical: `EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)` with `P2POfframp`, `1`, the registry `chainIdentity` and the deployment `address` (D1:31 "same domain").
- Separation comes from the **primary type hash**. `hashStruct` starts with `keccak256(typeString)`, and the type strings differ, so the two digests are distinct messages under one separator.
- Tests assert that the type hashes differ, and that each signature kind is refused by the other verifier: `verifyEoaAcceptance(domain, terms, role, bindingSignature)` is `false`, and so on.
- On-chain meaning: none (`BasicEscrow.sol:292`). Recorded constraint for future contract work (D3, G16 versus ABI): any contract that ever verifies signatures in this domain must reject the `PeerAcceptance` type hash.
- **The domain is derived, never injected or carried.** The policy builds `{chainId: reviewed.network.chainId, verifyingContract: reviewed.deployment.address}` from `ReviewedEvmTerms` (`packages/domain/src/terms-review.ts:65-66`). Those are registry values: `reviewTermsBytes` copies them from `options.registry` and from nothing in the message. This matches `exchange.test.mjs:31-34` and `evm-contract-acceptance.ts:59-61` (D1:46). There is no `domainFor` port (R5).

#### 2.3.4 Two prompts per party

The accepted record carries "each party's EIP-712 `TradeTerms` signature plus a wallet-signed `PeerAcceptance`", which answers D1:52: both signatures are carried. Order per party: `TradeTerms` first, then `PeerAcceptance`. Both come from one adapter call with one preflight (§4.2). No message is built until both signatures have returned and passed offline verification. The wallet shows the exact typed data (D1:79).

### 2.4 Byte budget (profile 1, EOA only)

- `MAX_V2_ACCEPTANCE_JSON_BYTES = 1024` for the serialized `acceptance` object. The real size is about 430 bytes.
- `MAX_OFFER_TERMS_BYTES = 16,384` (raw UTF-8), `MAX_ENVELOPE_BYTES = 24,576` and `MAX_RUMOR_JSON_BYTES = 40,960` are unchanged (`messages.ts:19,24`, `nip17.ts:24`).
- **Budget before prompting.** `offer()` and `accept()` serialize the envelope with a maximum-width placeholder acceptance and check it against the envelope and rumor caps before the first wallet prompt. On failure they return `LIMIT_EXCEEDED` with zero wallet requests. After signing, `build()` re-checks the real envelope (`exchange.ts:171,173`).
- The ERC-1271 budget (signatures up to 4,096 bytes each, `evm-contract-acceptance.ts:6`) can exceed the cap (D1:50). It is deferred to Phase 4 (DEF-1).

### 2.5 Persistence carrier: allocation requested, not assumed

D1 needs one durable record per `termsHash`, holding the tombstone and the two role bindings (D1:44-45).

**The r0 carrier (kind `trade`, `schemaVersion: 1`, a new `format` string) stays withdrawn.** It would share `(trade, 1)` with saved reviews (`packages/schemas/src/saved-review.ts:11-12`), which breaks three things:

1. **Migration-key collision.**
   - Migrations are keyed by `(kind, fromVersion)` (`packages/storage/src/migration-service.ts:12-19`), and the target version is per kind (`:86-91`).
   - A future saved-review `trade` 1→2 migration would run on every ledger record, fail destination validation and abort the whole plan, since planning iterates all records (`:132-139`).
   - Moving the ledger to another `trade` version does not help. A ledger record newer than the kind's current target throws `UNSUPPORTED_VERSION` (`:88`) and blocks every migration on that profile.
2. **Worker miscount.** `savedEntries` counts every `trade` record that is not a saved review as skipped (`apps/web/src/runtime/worker-endpoint.ts:55-64`). That count reaches the UI as `skipped` (`:458`), so every ledger record would appear as a damaged saved review. (The skip test at `:59` only looks at `kind`, so it ignores any other kind entirely, and a separate kind fixes this; see T09K.)
3. **In-place migration limit.** One in-place plan is capped at 256 changes (`migration-service.ts:9`). A large ledger inside a migrating kind could make that kind unmigratable (`LIMIT_EXCEEDED`).

**Request C1 (§5):** the coordinator allocates a persisted kind and version for the ledger. D1 recommends a new `RecordKind` `'acceptance'` at `schemaVersion: 1`. The edits that kind needs are T09K's file list (§7). Two consequences are for the coordinator to accept or route:
- An older build rejects the **whole snapshot** on an unknown kind (`vault.ts:152` `fail()`). That is acceptable before beta only if the coordinator says so; otherwise it needs a vault-format compatibility step.
- Retention needs a purpose and rule for the kind. A classify branch returning `purpose: 'peer-acceptance-ledger'` is the obvious one. The ledger's own prune (below) does the time-based expiry.

Until C1 is answered, T02 and T09 use a single constant `LEDGER_RECORD = {kind, schemaVersion}` behind the ledger port, so the allocated value is a one-line change. T02, T09 and T13-T16 can be developed but **not merged** before T09K lands.

Payload (exact keys; canonical JSON; re-encoded byte for byte on read, the same discipline as `decodeIntentPayload` in `packages/schemas/src/intent.ts:68`):

```
{ format: "p2p-offramp/peer-acceptance-ledger/v1", termsHash, chainId, verifyingContract, acceptBeforeSeconds,
  tombstone: null | { reason: "cancel" | "terms-reject", atSeconds },
  bindings: { seller: null | Binding, buyer: null | Binding } }
Binding = { account, sellerNostrKey, buyerNostrKey, notAfterSeconds, scheme: "eoa", verifiedAtSeconds }
```

- Record id: the first 16 bytes of `SHA-256("p2p-offramp/peer-acceptance-ledger/v1" ‖ 0x00 ‖ termsHash)`, as 32 hex characters. It is deterministic, so the same `termsHash` in two tabs maps to one record. The vault is encrypted, so the id leaks nothing.
- **No signature bytes are persisted.** Deduplication compares binding fields only (D1:45, D1:49), and the vault does not become a store of replayable artifacts. §3.6 covers what this means for G16 reachability.

**Capacity and lifetime (R3).** No record can live longer than about eight days after its creation, and the counterparty cannot extend that.

| Rule | Value | Why |
| --- | --- | --- |
| Binding cap | 128 records holding a binding (twice `EXCHANGE_LIMITS.maxSessions` = 64, `exchange.ts:30`) | Also keeps any future ledger migration under the 256-change in-place cap |
| Record creation | Only by a first binding, which needs a user-initiated session: the user's own offer, an inbound offer in a take the user made, the user's own accept, or an inbound accept to the user's own offer. Take-requests write nothing. | No counterparty can create records without a user action |
| Horizon | Every v2 `acceptBeforeSeconds` is at most `now + 604,800` at offer, and at most `now + 604,800 + 120` at receipt (§2.6) | Bounds the life of every record and tombstone |
| Prune, record with a tombstone | `now > acceptBeforeSeconds + 86,400`. By then the deadline rule refuses every message for that hash, and the margin absorbs a clock moved back by up to a day. | D1:44: keep the tombstone while it can matter |
| Prune, record without a tombstone | `now > max(bindings.*.notAfterSeconds) + 86,400`, so at most about 25 hours after the last binding (`bindingTtl` 3600). After `notAfterSeconds` no message can rely on a binding: the buyer's accept needs a live seller binding (§3.3), and the receiver checks `now < notAfterSeconds`. Conflict detection (D1:45) therefore stays in force through every binding's usable life plus a day. | Recovery: a full ledger frees itself within about a day, without tombstones expiring early |
| Full ledger | A new offer or accept that would create a record returns `LIMIT_EXCEEDED` **before any wallet prompt**. Recovery happens by time alone, within about 25 hours, or within 8 days if the full set is tombstoned. | Fail closed for acceptances |
| Tombstone creation | Always allowed beyond the binding cap, up to a hard ceiling of `128 + maxSessions` (192). At the ceiling it becomes **pending** (P4) and is never refused. Each live session can hold at most one tombstone not yet stored, so the ceiling is only reached under storage faults. | A cancel is never blocked (T-FULL) |

### 2.6 Binding TTL, acceptance horizon and the conflict rule

- **`bindingTtl = 3600 s`**, equal to `MAX_MESSAGE_LIFETIME_SECONDS` (`messages.ts:21`). The signer uses `notAfterSeconds = min(acceptBeforeSeconds, now + 3600)`.
  - The buyer gets up to an hour after the offer to review and sign, which matches the longest a single exchange message may live.
  - A captured binding stops being useful within an hour.
  - The buyer's `accept()` is refused once the seller's `notAfterSeconds` has passed, so a slow buyer gets a clean `EXPIRED` before prompting rather than after.
  - The TTL bounds **message arrival only** (D1:42). It does not shorten how long an accepted agreement is shown as verified (§3.5, choice (g)).
- **Acceptance horizon (choice (f)): `MAX_ACCEPT_HORIZON_SECONDS = 604,800`**, equal to the escrow's `MAX_DURATION` (`BasicEscrow.sol:90`) and `MAX_ESCROW_SECONDS` in domain review.
  - v2 `offer()` refuses `acceptBeforeSeconds > now + 604,800` with `HORIZON_EXCEEDED`, after review and before any prompt.
  - v2 receipt of an offer refuses `acceptBeforeSeconds > now + 604,800 + MAX_FUTURE_SKEW_SECONDS` with `HORIZON_EXCEEDED`, before any verify call, RPC call or ledger access. There is no state change, and the rumor is not marked seen.
  - Why it is needed: review only requires `acceptBefore > now` (`exchange.ts:152`), and `fundable` (`packages/domain/src/terms-review.ts:163-169`) accepts any far-future pair, for example `acceptBefore = expiry = 10^12`.
  - Cost: v2 terms must be accepted within a week of being offered. v1 is unchanged. This is a narrowing, so it is in Q1.
- **Conflict rule (D1:45, exactly).** Key = `(termsHash, role)`.
  - Same account and keys, same `notAfterSeconds` → `duplicate` (no write).
  - Same account and keys, different `notAfterSeconds` → `refreshed`. The stored `notAfterSeconds` becomes the maximum of the two (both were validly signed by the account) and one write is made.
  - Different `sellerNostrKey` or `buyerNostrKey` → `BINDING_CONFLICT`, which fails closed.
  - A different account cannot reach the ledger, because it is refused earlier as `WRONG_SIGNER` (`account !== terms[role]`).
  - Two valid signatures over the same fields are a `duplicate`; signature bytes are never compared.

### 2.7 Restore and key lifecycle (part of Q1; core-review:70 "restore lifecycle")

- Exchange sessions stay in memory and are not resumable (`exchange.ts:9`). Only the ledger survives a restart.
- A binding is valid only for the exact `(sellerNostrKey, buyerNostrKey)` pair it names. After a fresh-key restore or any messaging-key change, a new binding for the same `termsHash` under different keys is `BINDING_CONFLICT` while the old record lives (at most about 25 hours untombstoned, §2.5). To continue sooner, the seller issues new terms with a new `revision`, and therefore a new `termsHash`. A same-key restart is not affected, because the refresh rule (§2.6) lets the same terms be re-offered.
- A restore from a backup older than a tombstone loses that tombstone. The residual risk is bounded by `acceptBeforeSeconds`, which is now at most a week ahead (§2.6), and any re-acceptance still needs a fresh, deliberate wallet signature. The same bound applies to a pending tombstone lost in a crash (§3.4 P4). Documented as a known limit (T-REST).
- Bindings do not follow the durable-chat rule that history requires the original messaging identity (`packages/messaging/src/durable-chat.ts:39`, `:234`). Bindings are not history: they are refusal state. After a key change they can only cause refusals, never acceptances.

### 2.8 Scheme policy (profile 1) and policy changes mid-trade (D1:82)

The resolver pins `latest`: it reads the block header, then calls `eth_getCode(account, height)`. It checks chainId and genesis first, reusing the checks in `evm-contract-acceptance.ts:61-62`.

| Code at the pinned block | Result |
| --- | --- |
| Empty | `eoa`, verified with strict low-s `verifyEoaSignature` (`evm-terms.ts:136`) |
| Starts with `0xef0100` (EIP-7702 delegation designator) | `UNSUPPORTED_SCHEME` (D1:48, D1:80) |
| Any other code | `UNSUPPORTED_SCHEME` in profile 1; Phase 4 only (DEF-1) |

- Research 02 recommends EOA-only first (`docs/research/2026-11-03/02-peer-acceptance-and-relays.md:13`).
- The resolver is called **only after** offline signature recovery succeeds (T-ORDER).
- Results are cached in memory per `(chainId, account)` for 300 s, with at most 128 entries (T-PRIV). `resolve(account, networkId, {fresh: true})` bypasses the cache and does not populate it.

**Policy change after acceptance (D1:82; threat T-POL).** In profile 1 the only change possible is an EOA that installs an EIP-7702 delegation, or receives other code, after its binding was verified. Profile 1 has no contract-wallet policy to change.
- The ECDSA signature stays a valid statement by the key holder. The account, however, has left the supported profile, and the delegated code may now validate other signatures or move funds on the account's behalf.
- Rule: a verified binding is a **point-in-time** fact. It carries `scheme` and `verifiedAtSeconds`, and the anchor height is held in memory.
- Rule for any future economic preparation (approval, funding, release, starting an off-chain payment): first call `recheckAcceptanceSchemes(view, resolver)` (§4.3). It calls `resolve(..., {fresh: true})` for both accounts and returns `ok` or `SCHEME_CHANGED`. A `SCHEME_CHANGED` result forbids that preparation.
- The 300 s cache therefore delays only receive-time verification and never an economic decision.
- The display label is not the gate for this. `acceptanceDisplay` stays a pure function of the session, the ledger and the clock; the recheck is a separate gate that T00 requires of consumers.
- This is a spec rule for future app wiring; no app calls it in D1. Tests: T06, T08, T14.

---

## 3. Concurrency and commit-ordering contract

### 3.1 The invariant D1 must preserve

Every existing send path does the same three things in order: it **builds** the message, then calls `readyToCommit`, then **commits state synchronously**, with no `await` in between (`exchange.ts:246-251`, `:265-270`, `:279-284`, `:297-302`). The comment at `exchange.ts:115-116` relies on that order.

The receive path does the same: `readyToCommit` (`:376`, `:383`, `:389`), then commit and `seen.set` (`:392-393`). It is safe today only because no `await` separates the state read at `:383`/`:389` from `session.state = transition(session.state, env.type, senderRole)!` at `:392`.

v2 keeps this invariant and adds one durable write before the check:

> **(sign → verify offline → resolve scheme) → build → acquire session lock → rule E (pre-write) → durable ledger write → rule E (post-write) + `readyToCommit` + commit**, with **no `await` between the post-write rule E and the commit.**

Two consequences follow:
- Anything that can fail during build (`LIMIT_EXCEEDED`, `AD_EXPIRED`, `WRONG_SIGNER`, `CLOSED`, `INVALID_INPUT`, `exchange.ts:160-179`) fails before any durable write and before any state change.
- A durable write that succeeds while the post-write check fails leaves a binding or tombstone with no state change. §3.4 shows that this outcome is always safe.

### 3.2 Per-session lock and rule E (R1)

**Lock.**
- A FIFO promise chain keyed by session id. The map is bounded by `maxSessions` plus pending takes, and an entry is removed when its chain drains.
- At most 8 waiters per session (`MAX_LOCK_WAITERS_PER_SESSION`). A ninth gets `LIMIT_EXCEEDED`: nothing is written and the rumor is not marked seen.
- Every v2 operation that changes an existing session enters the lock: outgoing and incoming `terms-offer`, `terms-accept`, `terms-reject` and `cancel`.
- `take` and incoming `take-request` do not enter it. They write no ledger state, and they replace only a terminal or expired session (`exchange.ts:215`, `:343`). Check E1's identity test catches such a replacement.
- **No wallet prompt, RPC call, terms review or wrap construction ever runs inside the lock.** They run before it, concurrently, as today. A holder waits only for one ledger write, which C2 bounds at 10 s.

**Rule E: re-evaluate against the current session.** Inside the lock, an operation keeps only its own inputs:
- `op.type` and `op.actorRole`;
- `op.hash`, the hash it reviewed, signed or verified (null for a cancel built from `taken`);
- the built message (outgoing) or the parsed envelope (incoming);
- its verified binding, if any.

Every session-derived value computed before the lock is discarded, including the state captured at call time (`exchange.ts:296`). Rule E is then evaluated against `s = sessions.get(id)` at that moment:

| Check | Evaluated against the current session | Failure |
| --- | --- | --- |
| E1 | `!closed` and `sessions.get(id)` is the same object as the operation's session (purged, closed or replaced otherwise) | `CLOSED` / `OUT_OF_ORDER` |
| E2 | `next = transition(s.state, op.type, op.actorRole)` must be non-null | see the E2 table |
| E3 | has-terms and hash test. Offer: `s.terms === null`. Accept and reject: `s.terms !== null && s.terms.hash === op.hash`. Incoming cancel: the §2.2 hash rule against the current `s.terms` (carried null always passes; carried non-null must equal `s.terms.hash`, or fails when `s.terms === null`). Outgoing cancel: if `op.hash !== null` it must equal `s.terms.hash`. | `OUT_OF_ORDER` / `HASH_MISMATCH` |
| E4 | ledger, for offer and accept: `isTombstoned(op.hash)` (committed ∪ pending) → `TOMBSTONED`; the stored binding for `(op.hash, role)` names other keys → `BINDING_CONFLICT`; a create while at the binding cap → `LIMIT_EXCEEDED` | as listed |
| E5 | tombstone target for cancel and reject: `t = s.terms?.hash ?? null`, from the **current** session. Never the carried value and never the value captured at call time. No tombstone if `t === null` or `now ≥ acceptBeforeSeconds` (moot). | — |

E2 failure table (no write in any row):

| Current state | Operation | Result |
| --- | --- | --- |
| `accepted` | incoming cancel or reject | P3: `OUT_OF_ORDER`. If the hash test E3 passes against the current terms, the session gets the in-memory annotation `crossedCancel: true`. |
| `accepted` | outgoing cancel | `OUT_OF_ORDER` (D1:43). The built wraps are discarded and never returned, so they are never published. |
| `cancelled` or `rejected` | any | `OUT_OF_ORDER`. The tombstone already exists, or was moot. |
| any other null transition | any | `OUT_OF_ORDER` |

**Sequence inside the lock.**
1. **Pre-write (synchronous):** E1-E5. On failure, release the lock and return. Nothing has been written.
2. **Write (`await`):** `recordBinding(op.hash, role, binding)` for offer and accept, or `tombstone(t, reason)` for cancel and reject when `t !== null` (P4 covers failures).
3. **Post-write (synchronous, no `await` from here to the end):**
   - Re-run E1-E3 against the current session.
   - Call `readyToCommit(s, s.state, …)`, with `s.state` read now.
   - Assign `s.state = next`, using the `next` computed in this block.
   - Set terms and acceptances, then `seen.set` (incoming) or `sent()` (outgoing).

   No v2 path uses the `transition(...)!` assertion of `exchange.ts:392`. Every assignment is of a value checked to be non-null in the same synchronous block.

Why both phases exist: the pre-write phase decides whether to write at all, so a loser writes nothing (P1). The post-write phase keeps the synchronous `readyToCommit`→commit rule. Every v2 mutator holds the lock, so between the two phases the state can change only through `close()`, `purge()` (`exchange.ts:110-112`) or a replacement, and E1 catches each of them. The post-write `readyToCommit` therefore fails only on time or capacity: `AD_EXPIRED`, `EXPIRED`, `CLOSED`, or `LIMIT_EXCEEDED` caused by another session filling `seen`.

**Pre-lock checks are advisory.** The existing early checks stay: the `transition(...) === null` tests at `exchange.ts:238`, `:259`, `:277`, `:294` and `:365`, and the hash tests at `:380-387`. They exist only to avoid needless prompts and RPC calls. Passing them grants nothing; only rule E decides.

**Consequences, each with a test:**
- A null-hash cancel queued behind an offer that holds the lock is evaluated after the offer commits. It sees `offered`, tombstones the current hash and commits `cancelled` (I3).
- A buyer's own `cancel()` from `taken` that loses the lock to an incoming offer sees `offered`. It commits `cancelled` and tombstones the offered hash, and its wraps (with `termsHash: null`) are returned. That null hash is valid at the seller by §2.2. So P4 holds: the user's cancel is not blocked by contention (I14).
- A local `accept()` holds the lock while an incoming cancel waits. The cancel sees `accepted`, and P3 applies. The state never becomes null (I13).
- A cancel carrying a non-null `H` reaches the buyer while the buyer's inbound offer for `H` is still in review or RPC, outside the lock. E3 sees `s.terms === null` → `HASH_MISMATCH`, and the rumor is not marked seen. If it is delivered again after the offer commits, it gives `cancelled` and tombstones `H` (I15).
  - The receiver never tombstones a carried hash its session does not hold. Doing so would let any buyer tombstone another buyer's `termsHash` on the same seller, a cross-session denial of service.
  - The residual case, where the cancel is never delivered again, is T-DROP.

v1 (`protocol: 1`) gets no lock and no ledger, and is byte-for-byte unchanged.

### 3.3 Sequences

**Outgoing v2 `offer()` (seller):**
1. The existing synchronous preconditions (`exchange.ts:235-240`).
2. `reviewForSession` (`:143-157`).
3. Advisory checks: horizon (`HORIZON_EXCEEDED`); `isTombstoned(hash)` → `TOMBSTONED`; an existing seller binding with different keys → `BINDING_CONFLICT`; ledger full → `LIMIT_EXCEEDED`.
4. Placeholder budget check (§2.4).
5. `resolveScheme(ownAccount)` → `eoa`, or a refusal before any prompt.
6. `signer.signAcceptancePair` (TradeTerms, then PeerAcceptance), followed by offline verification of both signatures through the domain policy.
7. `build()`.
8. Lock → rule E (expected: current `taken`, no terms) → `recordBinding(hash, 'seller', b)` → post-write rule E + `readyToCommit(…, effectiveDeadline)` → commit `offered`, terms and `acceptances.seller` → `sent()`.

**Outgoing v2 `accept()` (buyer):** the same, except:
- Step 1 also requires a verified `acceptances.seller` whose `notAfterSeconds` is still in the future.
- E2 and E3 require current `offered` with `s.terms.hash === op.hash`.
- The effective deadline is min(acceptBefore, seller notAfter, own notAfter).

**Outgoing v2 `reject()` / `cancel()`:**
1. The existing preconditions (advisory).
2. `build()`.
3. Lock → rule E (cancel: current `taken` or `offered`; reject: current `offered`) → tombstone the current `s.terms.hash` if any and not moot (P4 covers failures) → post-write rule E + `readyToCommit` → commit → `sent()` with `tombstone: 'durable' | 'pending' | 'none'`.

**Incoming v2 `terms-offer` / `terms-accept`:**
1. The existing unwrap, authentication and envelope checks (`exchange.ts:306-365`), with `v === 2` required.
2. Offer only: `reviewForSession`, the hash comparison (`:372-375`) and the horizon check.
3. `evaluateAcceptanceOffline`, in the T-ORDER order.
4. `resolveScheme(account)` over RPC. On `UNAVAILABLE`, return `SCHEME_UNAVAILABLE` (T-RPC).
5. Lock → rule E → `recordBinding` → post-write rule E + `readyToCommit` → commit state, terms and acceptance → `seen.set`.

**Incoming v2 `terms-reject` / `cancel`:**
1. The existing checks, plus the §2.2 hash rule (advisory).
2. Lock → rule E (E3 hash rule and E5 target against the current session) → tombstone `t` (P4 covers failures) → post-write rule E + `readyToCommit` → commit → `seen.set`.

Every refusal leaves the rumor **unmarked as seen**, as today: `seen.set` happens only at commit (`exchange.ts:355,393`). The wrap can be delivered again after a transient failure, and once committed a rumor is a `DUPLICATE`.

### 3.4 Precedence rules (accepted versus tombstone)

- **P1. Same instance: the first holder of the lock wins.** `accepted` and `cancelled`/`rejected` are mutually exclusive outcomes for a session. Rule E runs before the write, so:
  - a cancel that loses to an accept writes **no** tombstone;
  - an accept that loses to a cancel writes **no** buyer binding.

  There is nothing to roll back.
- **P2. Across tabs on one vault: the durable record decides future use, and the display never claims more than the record allows.**
  - Two instances (tabs) may hold the same session in memory. The lock is per instance.
  - **Sequence (R8):** the stale tab's commit finds the stored envelope changed. `vault-service.ts:370` then **locks that vault session and returns `CONFLICT`**. The ledger's reload-and-retry reads through a locked session and fails `LOCKED`.
  - So the stale tab returns `STORAGE_FAILED` for an offer or accept (P5), or records a pending tombstone for a cancel or reject (P4). It must unlock again to write.
  - When the CAS fails without the lock (the in-memory revision moved, `vault-service.ts:368`), the ledger reloads and re-evaluates. `recordBinding` on a now-tombstoned record returns `TOMBSTONED`.
  - A tombstone write succeeds even if bindings exist, because the other tab may have written a binding without sending anything (§3.1).
  - Residual risk: tab A sends an accept while tab B sends a cancel, and the counterparty sees whichever arrives first. Locally, the display rule (§3.5) never shows "signatures verified for both wallets" for a tombstoned hash.
- **P3. Network crossing: no ledger write and no transition out of `accepted` (D1:43).**
  - A cancel or reject that rule E evaluates against a current `accepted` session gets `OUT_OF_ORDER`, as today, and writes nothing. D1 therefore opens no off-chain withdrawal path.
  - If the hash test E3 passes against the current terms, the exchange records the in-memory annotation `crossedCancel: true` on the session. There is no state change and no ledger write.
  - The display then downgrades (§3.5). That is the fail-safe direction, and it grants the canceller nothing they could not get by simply not funding or not paying.
  - The user's own `cancel()` against a current `accepted` session is likewise `OUT_OF_ORDER`, and its wraps are discarded.
- **P4. A cancel or reject, the user's own or a counterparty's, is never blocked by the ledger or by lock contention.** It is refused only when the current state forbids it: `accepted` (D1:43) or already terminal.
  - **Capacity:** a tombstone is an in-place update when the record exists. Otherwise it is a creation allowed beyond the binding cap, up to the 192 ceiling (§2.5). At the ceiling it is pending.
  - **Moot tombstones:** a hash past `acceptBeforeSeconds` is not tombstoned, because the deadline rule already refuses it.
  - **Storage unavailable** (`LOCKED`, `UNAVAILABLE`, `CONFLICT` after the retry, writer timeout under C2): the tombstone is recorded as **pending** in the ledger's in-memory set, which `isTombstoned` consults. The cancel or reject still commits and, if outgoing, is still sent, with `tombstone: 'pending'`. Pending tombstones are flushed on the next successful ledger open or write.
  - **Contention:** rule E re-reads the state, so losing the lock to an offer never refuses a cancel (I14).
  - Justification: blocking a withdrawal would keep an offer live against the user's intent, which fails open for the user. Losing a pending tombstone in a crash has the same bound as T-REST. This narrows "durably" in D1:44 and is in Q1 (c).
- **P5. Offers and accepts fail closed on storage problems.** If the binding cannot be written, the exchange returns `STORAGE_FAILED`, sends nothing, commits nothing and does not mark the rumor seen.

### 3.5 Display rule: `acceptanceDisplay(view, ledger, now)` (R2)

Two deadlines, kept separate (choice (g)):
- **`offerDeadline = min(acceptBeforeSeconds, acceptances.seller.notAfterSeconds)`.** This is the arrival rule (D1:42): the last moment the buyer's accept may be sent or received. Each message's envelope expiry is enforced on receipt and does not affect the display.
- **`fundingClose = min(acceptBeforeSeconds, escrowExpirySeconds − 1800 + 1)`.** This is the first second at which `_bind` reverts (`BasicEscrow.sol:297-301`), and so the end of the agreement's usefulness (D1:51 concerns `block.timestamp`).

The rules are applied in order, and the first match wins. No label implies funding, payment or fiat receipt (D1:63). Funding comes only from chain observation.

| Condition | Label |
| --- | --- |
| `view.protocol === 1` | `unverified-v1`: "Acknowledged without wallet signatures (protocol 1)" |
| The hash is tombstoned (committed or pending) | `cancelled`: "Cancelled — not agreed" (also covers the P2 cross-tab case) |
| `crossedCancel` (P3) | `disputed`: "The counterparty sent a cancel that crossed this acceptance. Not agreed — do not act on it." |
| `accepted`, both bindings verified (the seller's first), `now ≥ fundingClose − 120` | `window-closed`: "Agreement window closed; it can no longer be funded" |
| `accepted`, both bindings verified, otherwise | `both-verified`: "signatures verified for both wallets" |
| `offered`, the seller binding verified, `now ≥ offerDeadline − 120` | `offer-expired` |
| `offered`, the seller binding verified, otherwise | `seller-verified` |
| otherwise | `none` |

- The bindings' `notAfterSeconds` no longer ends `both-verified`. An agreement accepted in time stays verified for as long as the escrow could still be funded, which is what T-MAP needs.
- The 120 s margin is `MAX_FUTURE_SKEW_SECONDS` (`messages.ts:22`).
- The short-expiry alternative is rejected. Ending `both-verified` at `effectiveDeadline − 120` (r1) would bound T-DROP at about an hour, but together with T-MAP it would forbid economic preparation an hour after the offer, even though the funding window runs to `acceptBeforeSeconds`. T-DROP is handled as in §6 instead.
- Consumers derive "accepted" **only** from this function, never from `view.state` alone (T-VER). Before economic preparation they also need `recheckAcceptanceSchemes` (§2.8) and a ledger tombstone check (T-MAP).

### 3.6 G16 signature reachability (decision)

- `SessionView.acceptances[role].termsSignature` exposes a **copy** of each party's 65-byte `TradeTerms` signature, in memory only. Binding signatures are not exposed and nothing is persisted (§2.5).
- That is enough for the T43 / `verifyEvmAgreementBundle` composition (`evm-agreement.ts:52`, keys `:63`) within one runtime. T16 proves it by passing both views' signatures, the domain, the terms and the fixture private agreement into `verifyEvmAgreementBundle`, and asserting success.
- **Reachability is no longer limited by the display.** Signatures stay available while the session is in memory. The display label (§3.5) does not hide them.
- Session lifetime is unchanged from v1. A session lives until `close()` or until `purge()` removes it (`exchange.ts:110-112`). `purge()` removes terminal sessions and any session whose ad has expired, and runs when the session table is full (`admit`, `:135-140`). An `accepted` session can therefore disappear after its ad expires, possibly before `fundingClose`. Composition must happen while the session lives.
- Making the agreement and its signatures survive a restart or an ad expiry needs session or agreement persistence. That is **deferred** (DEF-3, §10): it is a separate design with its own persisted allocation. D1:89 lists bundle composition as unblocked, not delivered.

---

## 4. Module-by-module changes

Layering:
- `wallet` holds crypto and the provider adapter.
- `domain` holds policy, the ledger and **all port types**. It uses ports only and imports no chain or transport code. `domain` and `schemas` are CORE (`scripts/check-import-boundaries.mjs:23`).
- `exchange` holds transport and the state machine. It stays chain-free (its imports are domain, nostr-crypto and relay only, `exchange.ts:11-22`) and receives injected ports, as with `hashTerms` (`exchange.ts:41-42`).
- `schemas` holds record codecs.
- Cross-package imports must go through facades (`CROSS_PACKAGE_PRIVATE_IMPORT`, `check-import-boundaries.mjs:226`, `:236-239`). Wallet's only facade is `packages/wallet/contract-acceptance.ts`, so no other package may import `packages/wallet/src/*`, types included.
- Composition happens only in tests and scripts. No app wiring: `createTermsExchange` has no app caller today. The wallet implementations satisfy the domain port types structurally, and tests and scripts plug them in.

### 4.0 Placement and rebase-risk table

| Artifact | File | Facade edit? | Why there |
| --- | --- | --- | --- |
| Wire `acceptance` item parser, v2 envelope codec | `packages/exchange/src/messages.ts` | none (internal to exchange) | The exchange's wire codecs already live here |
| Ledger payload codec | `packages/schemas/src/peer-acceptance-ledger.ts` | `packages/schemas/index.ts`: one export block **appended at the end** | `storage` (retention classify, migration validator) needs it through the schemas facade, as with `intent.ts` |
| Acceptance policy, display, **port types** (`AcceptancePorts`, `AcceptanceSigner`, `LedgerPort`, `LedgerStorePort`, `SchemeResult`) and the port KAT | `packages/domain/src/peer-acceptance.ts`, `src/peer-acceptance-kat.ts` | `packages/domain/index.ts`: one export block appended at the end | `exchange` calls the policy and imports the port types through the facade. Wallet code never needs to be imported from CORE. |
| Ledger implementation | `packages/domain/src/peer-acceptance-ledger.ts` | **none**. It is test- and script-composed, like `intent-journal.ts`, which the domain facade does not export. | `exchange` needs only the `LedgerPort` type, from the facade |
| PeerAcceptance typed data | `packages/wallet/src/evm-peer-acceptance.ts` | none (test- and script-only, like `evm-terms.ts`; `contract-acceptance.ts` is unchanged) | — |
| Scheme resolver | `packages/wallet/src/evm-account-scheme.ts` | none | — |
| Adapter pair signing | `packages/wallet/src/evm-adapter.ts` | none | — |
| C1 record-kind wiring (T09K) | `packages/schemas/src/vault.ts`, `packages/storage/src/{vault-service,retention-service,migration-service}.ts` and tests and scripts that list kinds | none | Vault-format and recovery code (D8 Tier C), serialized (§7) |
| Retention test | `packages/storage/test/peer-acceptance-retention.test.mjs` (T09K) | — | storage-owned |
| Worker-count regression guard | `apps/web/test/saved-reviews-worker.test.mjs` (extended in T09K) | — | It asserts against `apps/web/src/runtime/worker-endpoint.ts`. A storage test must not import app source. |

Rebase risk:
- `packages/domain/index.ts` and `packages/schemas/index.ts` are also edited by the open extraction PRs pr/26, pr/35, pr/47 and pr/48 (both files) and pr/62 (one). D1 touches each facade once, with an appended block and no reordering, so conflicts resolve as one-line rebases.
- T09K's storage and retention files were just reworked at HEAD (`05cbd5f`, the retention Worker lane). T09K therefore rebases onto whatever storage lane is current at merge time and lands alone.

### 4.1 `packages/schemas`
- **New** `src/peer-acceptance-ledger.ts`:
  - `LEDGER_RECORD` (placeholder `{kind, schemaVersion}` until C1);
  - `encodePeerAcceptanceLedgerPayload` / `decodePeerAcceptanceLedgerPayload`: canonical, byte-for-byte re-encode, exact keys at every level, never throws on hostile input.
- Edit `index.ts`: appended export block.
- **New** `test/peer-acceptance-ledger.test.mjs`.
- T09K, after C1: `src/vault.ts:12` (the `RecordKind` union) and `:152` (the parser's closed set).

### 4.2 `packages/wallet`
- `src/evm-terms.ts`: **one-word change**, adding `export` to `exactDataObject` (`:26`). No other change: digests and the roughly 30 import sites are untouched.
- **New** `src/evm-peer-acceptance.ts`:
  - `PEER_ACCEPTANCE_TYPE`, `peerAcceptanceTypeHash`, `snapshotPeerAcceptance`, `peerAcceptanceStructHash`, `peerAcceptanceDigest(domain, input)`, which returns lowercase hex and satisfies the domain port `bindingDigest`;
  - `verifyPeerAcceptanceEoa(domain, input, signature)`, which delegates to `verifyEoaSignature`;
  - `peerAcceptanceTypedDataJson(domain, input)`, the exact `eth_signTypedData_v4` JSON. The adapter and the tests share it, so the prompt and the digest cannot diverge.
  - All encoders are imported from `./evm-terms.ts`.
- **New** `src/evm-account-scheme.ts`: `createAccountSchemeResolver({rpc, registry, now})`.
  - `resolve(account, networkId, opts?: {fresh?: boolean})` returns `{scheme:'eoa', anchor:{height,hash}}`, or `UNSUPPORTED_SCHEME`, `WRONG_CHAIN` or `UNAVAILABLE`. It satisfies the domain port `resolveScheme`.
  - Checks: chainId, genesis, pinned height, then one `eth_getCode` call.
  - It holds the cache from §2.8 (`fresh` bypasses it) and is read-only.
- `verifyEoaSignature(digestHex, signature, expected)` (`evm-terms.ts:136`) already satisfies the domain port `verifyEoa` unchanged.
- Edit `src/evm-adapter.ts`: add `signAcceptancePair(session, request, signal)`, where `request` is the domain `AcceptanceSignRequest` (plain data: `role`, `account`, `domain`, `termsHash`, `terms`, `binding`). Composition binds it as `{signAcceptancePair: (req, sig) => adapter.signAcceptancePair(session, req, sig)}`, which satisfies `AcceptanceSigner`.
  - **One preflight for both prompts**: everything `signTerms` checks (`evm-adapter.ts:130-164`), **plus** `deployment.protocolVersion === 1`, `runtime.upgradeable === false` (as `evm-contract-acceptance.ts:59`), `request.account === session.account` and `request.binding.role === request.role`.
  - The adapter re-queries the account and chain **before each** of the two prompts.
  - Exactly two `eth_signTypedData_v4` calls (TradeTerms, then PeerAcceptance), with no fallback: error 4200 → `UNSUPPORTED_PROVIDER`.
  - Each result must be 65 bytes and verify offline, otherwise `INTEGRITY_FAILURE`.
  - If the first signature succeeds and the second is cancelled, the result is `CANCELLED` and **neither** signature is returned.
  - `signTerms` itself is unchanged, so v1 behaviour does not move. Whether `signTerms` should also gain the deployment checks is a separate Tier C hardening item (DEF-4).
- `src/evm-contract-acceptance.ts`: unchanged in profile 1.

### 4.3 `packages/domain`
- **New** `src/peer-acceptance.ts`. It holds pure policy plus every **port type** (R5, R6):

```
type EvmDomainData = { chainId: string; verifyingContract: string };       // plain data, no chain code
interface AcceptancePorts {
  verifyEoa(digestHex: string, signature: Uint8Array, expectedAccount: string): boolean;     // strict low-s ECDSA recovery
  bindingDigest(domain: EvmDomainData, input: PeerAcceptanceInput): string;                  // PeerAcceptance EIP-712 digest, hex
  resolveScheme(account: string, networkId: string, opts?: { fresh?: boolean }): Promise<SchemeResult>;
}
interface AcceptanceSigner {
  signAcceptancePair(request: AcceptanceSignRequest, signal?: AbortSignal):
    Promise<{ ok: true; value: { termsSignature: Uint8Array; bindingSignature: Uint8Array } } | { ok: false; code: SignerCode }>;
}
interface LedgerPort { isTombstoned(h): boolean; bindingFor(h, role): Binding | null; canCreate(): boolean;
  recordBinding(h, role, b, meta): Promise<…>; tombstone(h, reason, meta): Promise<'durable' | 'pending'>; }
```

  - **The TradeTerms digest port is the existing `hashTerms`.** The termsHash is the EIP-712 TradeTerms digest itself (D1:17; `evmTermsHash = eip712Digest(domainSeparator, tradeTermsStructHash)`, `evm-terms.ts:120-121`). The `termsSignature` is therefore verified as `verifyEoa(hashTerms(reviewed), termsSignature, terms[role])`, and no separate `termsDigest` port exists.
  - `domainOf(reviewed)` returns `{chainId: reviewed.network.chainId, verifyingContract: reviewed.deployment.address}` (§2.3.3). No domain port exists.
  - `buildBindingInput(session, role, notAfterSeconds)` takes the Nostr keys from the authenticated session only.
  - `effectiveDeadline(...)`, `offerDeadline(...)` and `fundingClose(...)`.
  - `evaluateAcceptanceOffline(ctx, item)` and `confirmScheme(ctx, account)`, in the T-ORDER order. Either returns `VerifiedBinding` or a typed refusal: `ACCEPTANCE_INVALID`, `BINDING_INVALID`, `WRONG_SIGNER`, `EXPIRED`, `HORIZON_EXCEEDED`, `UNSUPPORTED_SCHEME`, `SCHEME_UNAVAILABLE`, `TOMBSTONED` or `BINDING_CONFLICT`.
  - `acceptanceDisplay` (§3.5).
  - `recheckAcceptanceSchemes(view, ports)` (§2.8) returns `ok`, `SCHEME_CHANGED` or `SCHEME_UNAVAILABLE`.
  - A missing `TradeTerms` signature or a missing binding is a refusal, never a partial acceptance.
- **New** `src/peer-acceptance-kat.ts`: `assertAcceptancePorts(ports, hashTerms?)`.
  - It runs at exchange construction and checks that `bindingDigest` reproduces a frozen positive digest, that `verifyEoa` accepts the frozen positive, and that `verifyEoa` refuses its high-s twin and a wrong account.
  - The constants are copied from the T03/T04 frozen fixtures, with their SHA-256 noted, and T10 asserts they equal the fixtures. No hex is invented.
  - A composition that injects a weaker verifier fails construction with `INVALID_OPTIONS`. This does not replace review of the composition; it catches the obvious mistakes, such as a stub that always returns true or a digest from the wrong type.
- **New** `src/peer-acceptance-ledger.ts`, against a `LedgerStorePort`:
  - `load()`, plus `commit(mutations)` routed through the C2 writer. Until C2 exists it is bound to `VaultService` commit with a revision CAS, following the `intent-journal.ts` pattern (`:11`, `:216`, `:230`).
  - `open()` builds the committed index and flushes pending tombstones.
  - `isTombstoned` (committed ∪ pending, synchronous), `bindingFor(hash, role)` (synchronous) and `canCreate()` (synchronous).
  - `recordBinding` returns `inserted | duplicate | refreshed`, or fails with `BINDING_CONFLICT`, `TOMBSTONED`, `LIMIT_EXCEEDED` or `STORAGE_FAILED`.
  - `tombstone` returns `'durable' | 'pending'` and is idempotent. It follows the §2.5 ceiling.
  - `prune(now)` applies both §2.5 rules. It runs inside every ledger write and on `open()`. Ledger writes are serialized internally.
  - CAS handling (P2): on `CONFLICT` the ledger reloads, re-evaluates and retries once. If the reload fails `LOCKED`, the vault session was locked by `vault-service.ts:370`, and the ledger returns `STORAGE_FAILED` (or pending for a tombstone). After the one retry it returns `STORAGE_FAILED`.
- Edit `index.ts`: one appended export block holding the policy, the port types and `assertAcceptancePorts`.

### 4.4 `packages/exchange`
- `src/messages.ts`:
  - `EXCHANGE_TOPIC_V2`, `MAX_V2_ACCEPTANCE_JSON_BYTES`, `ExchangeEnvelopeV2`, `envelopeTagsV2`;
  - `parseAcceptanceItemV2(value, expectedRole)` (exact keys, regexes, size cap);
  - `parseEnvelopeV2(text)`, which applies the §2.2 shape rules.
  - `parseEnvelope` (v1) is unchanged.
- `src/machine.ts`: **unchanged.**
- `src/exchange.ts`:
  - `ExchangeOptions` gains `protocol?: 1 | 2` (default 1). When `protocol === 2`, it also requires the following; otherwise it throws `TypeError('INVALID_OPTIONS')`, as the existing option check does (`exchange.ts:93`):
    - `acceptance: { signer: AcceptanceSigner; ports: AcceptancePorts }`, which is the complete list: `signAcceptancePair`, `verifyEoa`, `bindingDigest` and `resolveScheme`;
    - `ledger: LedgerPort`.
  - The existing `hashTerms` doubles as the TradeTerms digest, and the existing `registry` (through review) is the only source of the domain.
  - At construction `assertAcceptancePorts(acceptance.ports)` must pass.
  - `ExchangeCode` gains `TOMBSTONED`, `BINDING_CONFLICT`, `ACCEPTANCE_INVALID`, `BINDING_INVALID`, `UNSUPPORTED_SCHEME`, `SCHEME_UNAVAILABLE`, `STORAGE_FAILED` and `HORIZON_EXCEEDED`.
  - The v2 paths follow §3.3 exactly, using the lock and rule E from §3.2.
  - `SessionView` gains:
    - `protocol: 1 | 2`;
    - `acceptances: null | {seller, buyer}`, each `null | {account, sellerNostrKey, buyerNostrKey, notAfterSeconds, scheme, verifiedAtSeconds, termsSignature}` (§3.6);
    - `offerDeadlineSeconds`, `fundingCloseSeconds`;
    - `crossedCancel`.

    v1 views get `protocol: 1, acceptances: null`. No existing `exchange.test.mjs` assertion deep-compares a view.
  - `SentMessage` gains an optional `tombstone` field.
  - `purge()` is unchanged. Tombstones live in the ledger, so a re-take after a cancel is allowed (`exchange.ts:215,343`), but re-offering the tombstoned hash is refused.
- **New** tests: `test/messages-v2.test.mjs` and `test/exchange-v2.test.mjs`. The existing `exchange.test.mjs` and `async-boundaries.test.mjs` stay green unchanged.

### 4.5 Tombstones, persistence and downgrade refusal (summary)

| Control | Location |
| --- | --- |
| Tombstone inside the lock, target from the current session (E5), before wraps are returned (outgoing) and before commit (incoming); pending fallback (P4) | `exchange.ts` v2 paths and the domain ledger |
| Tombstone check before any wallet prompt, in rule E before and after the write, and on receipt | `exchange.ts`, `peer-acceptance.ts` |
| Downgrade refusal: a v2 instance refuses v1; the v2 parser refuses a missing or partial `acceptance`; the adapter has no fallback; the policy refuses a `TradeTerms` signature without its binding; the display never upgrades v1 | `messages.ts`, `exchange.ts`, `evm-adapter.ts`, `peer-acceptance.ts` |
| A v1 reader refuses v2 | the existing `messages.ts:71`, plus a regression test |

### 4.6 Specs and docs (T00, T17)
- `01_…/module_1.8.1_trade_terms/spec-signed-trade-terms.md`: a `PeerAcceptanceV1` section (type string, verifier rules, `bindingTtl`, horizon, scheme policy, the D1:82 recheck rule).
- `01_…/module_1.4.1_encrypted_relay_protocol/spec-encrypted-order-envelope.md`: the `ExchangeEnvelopeV2` bodies, the budget, the cancel and tombstone rule, "no mixed versions", the ordering contract (§3.1-§3.3), rule E and precedence P1-P5.
- `spec-order-lifecycle-reconciliation.md`: `agreed` remains a negotiation record (`:47-48`), plus the display rule from §3.5 with both deadlines.
- `docs/development/CURRENT-STATE.md`: updated only after merge. `LOCALPROOF` stays.

---

## 5. Coordination interface D1 needs from the D9/W1 coordinator (requests, not designs)

D1 does not design D9 or the shared storage layer. These are the interfaces D1 consumes. Each has a fallback D1 behaviour if the coordinator chooses differently.

**C1 — Persisted allocation for the ledger.**
- Request: allocate a `(kind, schemaVersion)` for "peer-acceptance ledger" records.
- D1 recommends a new kind `'acceptance'` at `schemaVersion: 1`, for the reasons in §2.5: no shared migration key, no worker miscount, and its own in-place budget.
- The coordinator also decides the compatibility of older builds (they reject the whole snapshot at `vault.ts:152`) and the retention purpose.
- D1 deliverables after allocation are all in T09K:
  - the codec's `LEDGER_RECORD` constant;
  - the closed kind sets;
  - a `RecordSchema` validator for the migration registry (`migration-service.ts:20`);
  - the retention classify branch;
  - the worker regression guard.

**C2 — One serialized vault writer (an existing hazard that D1 extends).**
- **The hazard predates D1.** Vault commits are compare-and-swap on the whole-vault revision (`vault-service.ts:349`, `:368`). Several writers already commit against a captured revision:
  - durable chat commits on **inbound peer messages** (`packages/messaging/src/durable-chat.ts:197`);
  - review favorites (`packages/personalization/src/favorites.ts:152`);
  - trade drafts (`packages/personalization/src/trade-draft-store.ts:174`);
  - saved reviews (`apps/web/src/runtime/worker-endpoint.ts:487`).

  Every journal job captures the revision at start (`intent-journal.ts:136`), guards on it at every step (`:125`) and commits against it (`:216`, `:230`, `:283`). On pr/69, a failed `markSending` (`evm-execution.ts:91`) or a failed `recordBroadcast` (`:105`) is reported as `BROADCAST_UNKNOWN` with a nonce hold. A foreign write during a journal job can therefore already turn a clean send into broadcast-unknown. **D1 adds one more inbound-triggered writer** (bindings and tombstones caused by peer messages). It does not create the class.
- **Request.** A single profile-scoped vault writer, owned by the coordinator, through which **every** writer commits: the journal, durable chat, favorites, drafts, saved reviews and the D1 ledger. The guarantees D1 needs:
  - (i) While a journal job is open (capture → final commit), other writes queue behind it and never interleave. The coordinator may prefer an equivalent: the journal rebases over foreign writes that do not touch `journal`-kind records, or the ledger lives in a separate store. D1 accepts any of these as long as (iv) holds.
  - (ii) D1 writes are single-commit, short jobs. The writer gives D1 the current revision inside the queue, so D1 causes no CAS churn of its own.
  - (iii) **Outside any journal job.** `submit(input, expectedRevision)` takes a revision captured by the caller (pr/75 `evm-execution.ts:62`), and `reserve` refuses a moved revision with `CONFLICT` (`:86`; `intent-journal.ts:197`).
    - A D1 write between the caller's capture and `reserve` therefore yields a **retry-safe `CONFLICT`**: nothing is marked, and nothing is sent.
    - That is a **liveness cost**, not a safety one. On a profile with steady inbound traffic (chat or D1), a caller can lose `reserve` repeatedly.
    - D1 asks the coordinator to decide whether `reserve` should rebase over non-journal writes, or whether the writer should hand `submit` the revision inside the queue.
  - (iv) A joint test, owned by the coordinator, for which D1 supplies fixtures: a ledger write (and a chat write) injected at every await point of `reserve`, `markSending` and `recordBroadcast` never produces `BROADCAST_UNKNOWN`, and causes at most the retry-safe `CONFLICT` of (iii) before `reserve`.
- **Bounded wait.** D1 waits at most 10 s for the writer. On timeout it behaves as if storage were unavailable: P5 for offers and accepts, P4 (pending tombstone) for cancels and rejects. D1 never makes another writer wait on a wallet prompt or an RPC call, because the lock (§3.2) covers no I/O except the commit.
- **D1 side until C2 lands.** `LedgerStorePort` is abstract. Unit tests use a fake writer that records ordering. Merge of T09 and T13-T16 waits for C2.

**C3 — Locked and stale-vault behaviour (R8).**
- Request: confirm the writer reports `LOCKED` while the vault is locked or its session is revoked. The writer should keep today's stale-snapshot sequence as is: `vault-service.ts:370` locks the vault session and returns `CONFLICT`, and later calls on that session report `LOCKED`.
- D1's resulting behaviour, specified here so the coordinator can check it is compatible:
  - inbound and outbound v2 offers and accepts → `STORAGE_FAILED`, not sent, not seen, no state change;
  - cancels and rejects → pending tombstone, then commit;
  - `take-request` is unaffected (no ledger use);
  - pending tombstones flush on the next unlock or `open()`.

**Revision budget (information for C2).**
- Each D1 trade costs at most three ledger commits: the seller binding, then the buyer binding or a tombstone, then a share of one prune batch.
- Inbound-triggered writes happen only in sessions the local user is party to and whose terms it reviewed. Take-requests write nothing.
- At `MAX_REVISION` (`vault.ts:2`, 1,048,575) the vault requires a rekey (`vault-service.ts:372`), so this cost is bounded and small.

---

## 6. Threat model deltas → controls → tests

| ID | Threat | Control | Test (task) |
| --- | --- | --- | --- |
| T-RPL1 | The same rumor is replayed within its lifetime | Rumor-id `seen` map (`exchange.ts:114-120`); ledger `duplicate` | A re-wrapped identical accept → `DUPLICATE`; ledger unchanged (T14) |
| T-RPL2 | Replay after restart, or into a new `(ad, buyer key)` session | Durable tombstone; identical binding is a no-op; different keys → conflict | Fresh instance on the same vault; tombstoned hash re-offered under a new buyer Nostr key with the same buyer address → `TOMBSTONED` (T15) |
| T-RPL3 | A nondeterministic or high-s re-signature evades deduplication | Field-only deduplication; low-s for EOA | Two valid signatures over one binding → `duplicate`; high-s twin refused (T07, T09) |
| T-XCH | Cross-chain or cross-contract replay | Domain derived from registry values in `ReviewedEvmTerms`; termsHash commits network and deployment; adapter chain check | chainId or verifyingContract variants fail (T07, T10, T13) |
| T-ROLE | Role confusion | `role` is in the digest; wire role equals message type; `account === terms[role]`; `seller != buyer` (`evm-terms.ts:96-118`) | Role-swap vector; offer carrying `role:"buyer"` → `MALFORMED`; swapped accounts → `WRONG_SIGNER` (T07, T12, T13) |
| T-KEY | Key substitution: valid signatures re-carried under another Nostr key (Option A's weakness, D1:29; PO-B03) | Binding keys come only from the authenticated session; the seller's own ledger fixes the key pair per `termsHash` | **k1:** attacker M takes the ad under its own key with the victim's `buyerAddress`. A seller instance with an empty ledger (as after an older-backup restore) offers M the same terms. M replays the victim's `termsSignature` and binding in an accept. The `TradeTerms` signature verifies, but the binding digest over `(seller, M)` does not → `BINDING_INVALID`, no state change, not seen (T14). **k2:** the seller, with its ledger intact, offers the same termsHash to M after binding it to the victim → `BINDING_CONFLICT` with zero signer calls (T13). (A forwarded offer from a non-author key is already `NOT_SELLER` at `exchange.ts:335-336`, so that case is not a D1 test.) |
| T-TYPE | Confusion between `TradeTerms` and `PeerAcceptance` signatures | Distinct primary type hash | Cross-verification refused in both directions (T07) |
| T-EXP | Stale expiry or clock edges | `effectiveDeadline` refused with `>=`; rechecked after the write; buyer accept requires a live seller binding; display margins of 120 s on `offerDeadline` and `fundingClose` | `deadline-1` passes and `deadline` is refused, per source; display flips at `offerDeadline-120` and `fundingClose-120` (T08, T14) |
| T-HOR | Far-future `acceptBefore` pins ledger records (R3) | Horizon 604,800 s at offer and receipt; time-bounded prune | Offer at `now+604,801` → `HORIZON_EXCEEDED`, zero prompts; received offer at `now+604,921` → `HORIZON_EXCEEDED`, zero verify and RPC calls, no state change, not seen (T13) |
| T-DOWN | Downgrade to bare signatures or v1 | §4.5 | v1 envelope to a v2 instance; v2 to v1; offer missing `bindingSignature`; adapter 4200 → no other method (T11-T13) |
| T-TOMB | Tombstone bypass: null-hash cancel, race, second tab, failed write, carried-hash abuse | §2.2 cancel rule; rule E (target from the current session); CAS reload; P2, P4 | T15-c1/c2, I3-I6, I11, I14, I15 (I15 also shows a carried hash the session does not hold is never tombstoned) |
| T-RACE | Interleaving between the async steps and commit leaves state committed without a send, a write without its precondition, or a null state | §3.1-§3.3; rule E before and after the write; no `await` between the post-write check and commit; no `transition(...)!` on v2 paths | I1-I17 (T13-T15). After every interleaving step, `view.state` is one of the five states. |
| T-PORT | A composition injects a weak verifier or digest port (R5) | Domain-declared port types; `assertAcceptancePorts` known-answer check at construction; the domain is derived, not injected | `verifyEoa` stub returning true, a TradeTerms digest posing as `bindingDigest`, a verifier accepting high-s → each construction throws `INVALID_OPTIONS` (T13) |
| T-D9 | Inbound-triggered D1 writes move the vault revision under an open journal job, turning a clean send into `BROADCAST_UNKNOWN` (pr/69 `evm-execution.ts:91,105`). This is **pre-existing** for durable chat (`durable-chat.ts:197`) and other CAS writers; D1 adds one more. Outside a job, it makes `reserve` retry (liveness). | C2 single writer for all writers; D1 holds no I/O in its lock except the commit; bounded wait | D1 side: the fake writer records that no ledger commit starts while a "journal job" token is held (T09). Joint test owned by the coordinator (C2 iv). |
| T-PRIV (a) | `eth_getCode` on the counterparty's account at receipt tells the RPC provider that address and the timing, together with the user's IP | Lookup only after offline recovery succeeds (T-ORDER); per-account cache for 300 s; same registry-pinned RPC as funding, which will see the address anyway; documented in the spec and README | The resolver fake counts calls: zero calls for a forged signature; one call for two messages from the same account within the TTL (T06, T13) |
| T-RPC (b) | RPC failure during receive | `SCHEME_UNAVAILABLE`, no ledger write, no state change, **rumor not marked seen**. Delivering the same wrap again retries it until envelope expiry. After commit, a repeat delivery is `DUPLICATE`. | Resolver returns UNAVAILABLE, then a valid result; the same wrap is delivered twice → first `SCHEME_UNAVAILABLE`, then `offered` (T13) |
| T-ORDER (c) | Expensive or privacy-leaking checks run on forged input | Order: (0) horizon → (1) termsHash recomputed equals the carried and session values → (2) role equals type and sender → (3) `account === terms[role]` → (4) `notAfterSeconds` bounds → (5) effective deadline → (6) not tombstoned → (7) no key conflict with the stored binding → (8) offline strict EOA recovery of `termsSignature` over `hashTerms(reviewed)` → (9) offline recovery of `bindingSignature` over the session-key digest → (10) only then `resolveScheme` (RPC). Offline recovery comes first because an address that recovers is either an EOA or a 7702-delegated EOA, and only the second needs the code lookup. | Port-call-order assertions: no verify call after a failure in (0)-(7); no RPC call after a failure in (0)-(9) (T08) |
| T-VER (d) | v1 and v2 `accepted` look the same, because `machine.ts` is unchanged; or an app falls back from v2 to v1 | `SessionView.protocol`; "accepted" is derived only through `acceptanceDisplay`, which maps v1 to `unverified-v1`; one protocol per exchange instance; spec rule: an app must not construct a v1 exchange for a profile configured for v2, nor retry a failed v2 send as v1. The ad format carries no protocol version, so apps cannot discover the peer's version; T00 states this next to the no-fallback rule (§10 DEF-2). | A v1 `accepted` view → `unverified-v1`; a v2 instance never calls the v1 envelope encoder (spy) (T08, T13). App wiring is out of scope; the rule is in T00. |
| T-FULL (e) | A full ledger, failed storage or lock contention blocks the user's own cancel | P4: in-place update, creation beyond the cap up to 192, pending at the ceiling, moot skip, pending on storage failure; rule E re-reads state | Ledger at the binding cap → own cancel from `offered` sends with `tombstone:'durable'`. At 192 → `'pending'`. Store throws LOCKED → cancel sends with `tombstone:'pending'`; a later `accept()` in another session for that hash → `TOMBSTONED`; reopening flushes it. Own cancel losing the lock to an inbound offer → sent (I14) (T15) |
| T-DROP (f) | A cancel is dropped by relays, so the counterparty keeps a positive label | Residual risk, documented. A dropped **buyer** cancel leaves the seller at `seller-verified` until `offerDeadline − 120` (at most about an hour), then `offer-expired`; it can never become `both-verified` without an accept. A dropped **seller** cancel followed by a buyer accept leaves the buyer at `both-verified` until `fundingClose − 120`. The seller's ledger holds the tombstone, the T00 spec rule forbids a client from preparing funding for a tombstoned hash, and the buyer must act only on chain-observed funding (D1:63). The harm is the buyer waiting for funding that never comes. | Documentation (T00, T17). Tests: both cases with the display timeline (T14); the seller's ledger refuses its own re-offer (T15) |
| T-POL | Policy change mid-trade (D1:82): an EOA installs a 7702 delegation or other code after its binding was verified; the 300 s cache hides it | Bindings are point-in-time; `recheckAcceptanceSchemes` with `fresh: true` is required before any economic preparation (§2.8); spec rule in T00 | Resolver returns empty code, then `0xef0100…`: within 300 s the cached receive path still says `eoa` (documented); `recheckAcceptanceSchemes` → `SCHEME_CHANGED` (T06, T08, T14) |
| T-REST | Restore from an older backup, or a crash with a pending tombstone, drops a tombstone | Bounded by `acceptBeforeSeconds` (at most a week, T-HOR); re-acceptance needs a fresh deliberate signature; documented (Q1) | A restored ledger without the record still refuses after `acceptBefore` (T09) |
| T-RELAY | Malicious relay: drop, reorder, replay or forge | NIP-59/44 authentication (`nip59.ts:81`); the state machine enforces order; relay status never promotes state (D1:83) | Accept delivered before offer → `OUT_OF_ORDER` (T14) |
| T-SCHEME | A sender-chosen scheme, or 7702/contract code behind an "EOA" | Scheme from code at the pinned block; 7702 and other code refused | Resolver fixtures: empty code, `0xef0100…`, contract code, chainId or genesis mismatch (T06); a 7702 account whose signature recovers correctly → `UNSUPPORTED_SCHEME` (T13); the deployed `Eip1271RecoveryFixture` as account → `UNSUPPORTED_SCHEME` (T16) |
| T-SIZE | Oversized offer, or the user signs something that cannot be sent | Budget check before prompting; post-sign checks | 16,384-byte escape-heavy terms → `LIMIT_EXCEEDED` with zero provider requests (T13) |
| T-DOS | Ledger flood, or permanent fill (R3) | Binding cap 128; creation only in user-initiated sessions (§2.5); horizon; prune untombstoned records at `max(notAfter) + 86,400` and tombstoned ones at `acceptBefore + 86,400`; refusal before prompting; per-session lock waiter cap of 8 | Fill to the cap → new offer `LIMIT_EXCEEDED` with zero prompts; advancing the clock past `notAfter + 86,400` frees space without the user doing anything; tombstoned records stay until `acceptBefore + 86,400`; a ninth lock waiter → `LIMIT_EXCEEDED`, not seen (T09, T13) |
| T-MAP | Session mapping (D1:78): a binding is used for an unrelated peer or session | Bindings are stored in the session that verified them and keyed to its authenticated keys. Spec rule: any future economic preparation takes the account and peer from a `SessionView` whose display is `both-verified`, whose hash is not tombstoned, and whose `recheckAcceptanceSchemes` passes. That stays possible until `fundingClose − 120` while the session lives (§3.5, §3.6). | Bindings in session A are never visible in session B for another buyer key (T13); `both-verified` persists past `offer time + 3600` (T14) |
| T-FUND | Misreading acceptance as authority | Escrow unchanged; the seller funds without acceptance; the display never implies funding | Local EVM: funding succeeds with an empty ledger (T16) |

---

## 7. Ordered TDD task list

Legend: **‖** = can run in parallel with the other tasks in the same wave (no file overlap). **→** = depends on.

For every task: write the RED test first and show it failing, then implement, then go GREEN. `npm test`, `npm run typecheck` and `npm run check:boundaries` must pass. Vector tasks must also pass `npm run test:specs`.

**Merge gates:**
- All tasks wait for Q1 (Tier C).
- T09K waits for the C1 answer.
- T02, T09 and T13-T16 wait for T09K and for C2/C3 (Q2).

### Wave 0
**T00 Specs and format review packet** (docs; the Tier C gate).
- Files: the three specs in §4.6.
- RED: `npm run check:specs` indexes and links the new sections.
- Acceptance:
  - every identifier in §2.2-§2.8 and every rule in §3 (rule E, P1-P5, both display deadlines) is written verbatim;
  - choices (a)-(h) in §2.1 are listed for approval;
  - the consumer rules are stated: T-VER no-fallback, T-MAP, the T-POL recheck, and no funding preparation for a tombstoned hash;
  - the protocol-discovery gap (§10 DEF-2) is stated next to the no-fallback rule;
  - an independent reviewer is recorded, together with the artifact hash, for the governance `decision.json`;
  - the T-PRIV, T-DROP, T-REST and C2 (iii) residuals are stated.
- It blocks *merge* of every later task, not development. T03, T04 and T05 implement from this text, not from T07 code.

### Wave 1 (all ‖; no shared files)
- **T02 Ledger payload codec** (`packages/schemas/src/peer-acceptance-ledger.ts`, `index.ts` appended block, `test/peer-acceptance-ledger.test.mjs`).
  - RED:
    - byte-for-byte round trip;
    - non-canonical whitespace or key order, a foreign format, a duplicate key, an extra key at any depth, `tombstone.reason` outside the enum, uppercase hex and zero `notAfterSeconds` are all refused;
    - the decoder never throws.
- **T03 Vector generator A**: ethers 6.15.0, installed into an isolated `--prefix` as `g16-independent-README.md` describes, never added to the lockfile.
  - Files: `packages/wallet/test/fixtures/d1-peer-acceptance-generate.mjs`, `d1-peer-acceptance-independent.json` and `d1-peer-acceptance-README.md`.
  - Acceptance: the JSON is frozen and its SHA-256 recorded.
- **T04 Vector generator B**: js-sha3 0.8.0 + elliptic 6.6.1, the `g16_evm_independent.mjs` pattern.
  - Files: `scripts/vectors/d1_peer_acceptance_independent.mjs` and `packages/wallet/test/fixtures/d1-peer-acceptance-evm-independent.json`.
  - The field order is transcribed independently from T00.
- **T06 Account-scheme resolver** (`packages/wallet/src/evm-account-scheme.ts`, `test/evm-account-scheme.test.mjs`).
  - RED:
    - empty code → `eoa`;
    - `0xef0100` + 20 bytes → `UNSUPPORTED_SCHEME`;
    - other code → `UNSUPPORTED_SCHEME`;
    - wrong chainId or genesis → `WRONG_CHAIN`;
    - provider error → `UNAVAILABLE`;
    - exactly one `eth_getCode` call, at the pinned height;
    - cache hit within 300 s with no RPC call, miss after; at most 128 entries;
    - **`fresh: true` always calls RPC and does not populate the cache**: empty code then `0xef0100…` → cached `eoa`, fresh `UNSUPPORTED_SCHEME` (T-POL).
- **T07 PeerAcceptance digest, verify and typed data** (`evm-terms.ts` one-word export, `src/evm-peer-acceptance.ts`, `test/evm-peer-acceptance.test.mjs`).
  - RED:
    - the type hash equals `keccak256` of the §2.3.1 string, computed in the test with `@noble/hashes`, and differs from the TradeTerms type hash;
    - the encoder refusals from §2.3.1;
    - cross-type refusal both ways;
    - high-s, `v=29`, 64-byte and `r=0` signatures refused;
    - `peerAcceptanceTypedDataJson` has exactly the §2.3.1 types (its independent hash is checked in T10 against generator A's `TypedDataEncoder` digest);
    - `peerAcceptanceDigest` and `verifyEoaSignature` type-check against the domain port types **in the test file only**, where composition is allowed;
    - all existing wallet tests stay green, with no digest changed.
- **T08 Domain policy, display and port types** (`packages/domain/src/peer-acceptance.ts`, `test/peer-acceptance.test.mjs`, `index.ts` appended block). **No dependency on T07**: the port types are declared here, and the tests use fakes.
  - RED:
    - each refusal code from T-ORDER, including `HORIZON_EXCEEDED`;
    - **port-call order**: no verify call after a failure in steps 0-7, and no `resolveScheme` call after a failure in steps 0-9;
    - `termsSignature` is checked against `hashTerms(reviewed)` and `domainOf(reviewed)` uses only registry fields;
    - `effectiveDeadline`, `offerDeadline` and `fundingClose` boundaries, including `escrowExpiry − 1800 + 1`;
    - a missing binding → refusal;
    - the `notAfterSeconds` bounds;
    - `acceptanceDisplay`: the full §3.5 table in order, including `unverified-v1`, `cancelled` with a pending tombstone, `disputed`, `window-closed` at `fundingClose−120`, `offer-expired` at `offerDeadline−120`, and `both-verified` beyond the seller's `notAfterSeconds`;
    - `recheckAcceptanceSchemes` → `ok`, `SCHEME_CHANGED` and `SCHEME_UNAVAILABLE`, always with `fresh: true`.
  - `check:boundaries` shows no `packages/wallet/src` import from domain.
- **T12 Exchange v2 message codec** (`packages/exchange/src/messages.ts`, `test/messages-v2.test.mjs`).
  - RED:
    - v2 round trip;
    - `parseEnvelope` returns null on v2, and `parseEnvelopeV2` returns null on v1;
    - an offer without `acceptance` or with `role:"buyer"` → null;
    - an accept with `role:"seller"` → null;
    - cancel accepts `termsHash` null or hex; reject requires a hash (same as v1);
    - acceptance over 1,024 bytes → null;
    - the acceptance item regexes (uppercase hex, `0x` signatures, 128 or 132 hex, zero account, leading-zero `notAfterSeconds`, extra keys);
    - `EXCHANGE_TOPIC_V2` with at most 4 tags;
    - the G20 reservations (`envelope.ts:34-36`) still refuse.

### Wave 2
- **T05 → T03, T04. Python oracle** (`scripts/vectors/check_d1_peer_acceptance.py`, `scripts/tests/test_d1_vectors.py`; details in §8). It asserts an exact count over both frozen fixtures, so it cannot start before they exist. ‖ with T09, T10 and T11.
- **T09 → T02. Domain ledger** (`packages/domain/src/peer-acceptance-ledger.ts`, `test/peer-acceptance-ledger.test.mjs`), against a fake `LedgerStorePort`.
  - RED:
    - identical → `duplicate`, with no write;
    - a different `notAfterSeconds` → `refreshed`, storing the maximum;
    - different keys → `BINDING_CONFLICT`;
    - binding after a tombstone → `TOMBSTONED`;
    - the tombstone persists across a reopen;
    - CAS `CONFLICT` → reload, re-evaluate, retry once, then `STORAGE_FAILED`; `CONFLICT` followed by a `LOCKED` reload → `STORAGE_FAILED` for a binding and `'pending'` for a tombstone (the `vault-service.ts:370` sequence);
    - binding cap of 128: a create at the cap → `LIMIT_EXCEEDED`; a tombstone at the cap succeeds (in place, or as a creation up to 192); at 192 → `'pending'`;
    - **prune (R3)**: an untombstoned record goes at `max(notAfter) + 86,400 + 1`, not one second earlier; a tombstoned record survives that and goes at `acceptBefore + 86,400 + 1`; a full ledger of live records recovers by time alone;
    - a moot tombstone past `acceptBefore` writes nothing;
    - store LOCKED → `tombstone` returns `'pending'`, `isTombstoned` is true, and `open()` flushes it;
    - no signature bytes in the payload;
    - the fake writer asserts serialized commits, and that no ledger commit starts while a "journal job" token is held (the D1 side of C2).
- **T10 → T03, T04, T07. Vector conformance** (`packages/wallet/test/d1-peer-acceptance-vectors.test.mjs`).
  - RED: fixture SHA-256 values equal the README; generator A and generator B agree field by field; `peerAcceptanceDigest` reproduces every digest; positives verify; negatives (including the terms-field controls, §8) are refused for the stated reasons; the `peer-acceptance-kat.ts` constants equal the fixture values.
  - Existing pinned counts are untouched: `evm-terms.test.mjs:128-145`, `g16-independent.test.mjs:5` and `test_g16_vectors.py:35`.
- **T11 → T06, T07. Adapter `signAcceptancePair`** (`packages/wallet/src/evm-adapter.ts`, `test/evm-adapter.test.mjs`), with a fake EIP-1193 provider.
  - RED:
    - exactly two `eth_signTypedData_v4` calls, TradeTerms then PeerAcceptance, whose JSON equals the shared builders;
    - an account or chain change before **either** prompt → `LOCKED` or `WRONG_CHAIN`, with no further prompt;
    - `protocolVersion != 1` or upgradeable → `UNSUPPORTED_PROVIDER` with zero prompts;
    - `request.account !== session.account` → `UNAUTHORIZED`;
    - 4200 → `UNSUPPORTED_PROVIDER` with no other method;
    - a wrong-key result → `INTEGRITY_FAILURE`;
    - the second prompt cancelled → `CANCELLED`, and the first signature is not returned;
    - a late result after abort → `CANCELLED`;
    - `signTerms` behaviour is unchanged (the existing tests are untouched).
- T05, T09, T10 and T11 have no file overlap. T10 and T11 both live under `packages/wallet/test` but in different files.

### Wave 2K (serialized; gated on the C1 answer; D8 Tier C vault-format code)
**T09K → T02, C1. Record-kind wiring for the allocated ledger kind.** It lands alone, rebased onto the current storage and retention lane, because `05cbd5f` just reworked the retention Worker. Edits, for the recommended `'acceptance'` kind:
- `packages/schemas/src/vault.ts:12` (the `RecordKind` union) and `:152` (the parser's closed set);
- `packages/storage/src/vault-service.ts:67` (`kind()`);
- `packages/storage/src/retention-service.ts:88` (the snapshot's closed set), plus a classify branch in `classify` (`:95-121`) that returns `purpose: 'peer-acceptance-ledger'` with `reviewTimestamp` = the payload's `acceptBeforeSeconds`, or null for undecodable payloads, so they are retained, as today's catch at `:119` does;
- `packages/storage/src/migration-service.ts:10` (`KINDS`), and the `Record<RecordKind, number>` it requires (`:68-81`; `:81` throws `INVALID_INPUT` when a kind lacks a current version). Its users: `packages/storage/test/migration-service.test.mjs:22`, `packages/storage/test/reseal.test.mjs:37`, `scripts/test-vault-browser.mjs` (including `:509`) and `scripts/test-reseal-crash-browser.mjs`;
- kind-enumerating tests: `packages/schemas/test/vault.test.mjs:122` and `packages/storage/test/vault-service.test.mjs:77`;
- `packages/schemas/src/peer-acceptance-ledger.ts`: set `LEDGER_RECORD` to the allocated value, and add the `RecordSchema` validator for the migration registry (`migration-service.ts:20`).

Tests:
- RED: the vault parser accepts an `acceptance` v1 record and still refuses an unknown kind; the migration registry requires a current version for the new kind; `packages/storage/test/peer-acceptance-retention.test.mjs` classifies ledger records under the new purpose and keeps damaged ones.
- **Regression guard (not RED):** `apps/web/test/saved-reviews-worker.test.mjs` gains a case showing that ledger records are not counted as `skipped`. It passes at once, because `savedEntries` skips any kind other than `trade` (`worker-endpoint.ts:59`). It exists to catch a future change that widens that filter.
- If the coordinator allocates differently, only this task's file list changes.

### Wave 3 (sequential; all edit `packages/exchange/src/exchange.ts`)
Interleaving tests use deferred-promise fakes for the signer, the resolver and the ledger writer, so each await point can be paused and another operation injected. After every step of every interleaving, the test asserts that `view.state` is one of the five machine states.

**T13 → T08, T09, T10, T11, T12. v2 options, offer path, lock and rule E.**
- RED:
  - `protocol:2` without ports → `INVALID_OPTIONS`; **T-PORT** stubs → `INVALID_OPTIONS`;
  - the order is horizon, budget, own scheme, then signer, with zero signer calls when over the horizon or the budget;
  - a tombstoned hash or a full ledger → refused before any prompt;
  - **k2** (§6);
  - the buyer receives a valid offer → `offered` with `acceptances.seller`;
  - forged binding, swapped keys, wrong account, expired binding, horizon exceeded or tombstoned hash → refused, no state change, not seen;
  - a 7702 account → `UNSUPPORTED_SCHEME`;
  - T-RPC repeat delivery; T-PRIV call counts;
  - a v1 envelope to a v2 instance → `MALFORMED`;
  - the v1 encoder is never called;
  - T-MAP;
  - a ninth lock waiter → `LIMIT_EXCEEDED`, not seen (**I17**).
- Interleavings:
  - **I1:** `build()` fails with `LIMIT_EXCEEDED` after signing → no ledger write, state `taken`, no wraps.
  - **I2:** a buyer cancel commits while `offer()` waits on the signer → the offer's rule E2 fails (`cancelled`) with `OUT_OF_ORDER`, and **no seller binding is written**.
  - **I3:** a buyer cancel with a **null hash** arrives while the offer holds the lock (its ledger write pending) → the cancel waits. The offer commits `offered` and returns its wraps. The cancel's rule E then sees `offered`, tombstones the current `session.terms.hash` and commits `cancelled`. The tombstone is durable.
  - **I7:** `close()` during the ledger write → `CLOSED` (E1), no commit, no wraps; the binding is durable and the display stays `none`.
  - **I8:** the ad expires during the write → `AD_EXPIRED`, no commit.
  - **I12:** a static guard. The test patches the ledger to resolve, then synchronously asserts that the state was committed in the same microtask turn as the resolution, with no intervening await. It also checks that `readyToCommit` was invoked after the write resolved. A source-level assertion also checks that no v2 path contains `transition(` followed by `)!`.
  - **I14 (outgoing cancel, R1):** buyer `cancel()` from `taken` builds with `termsHash: null`. An incoming offer then takes the lock and commits `offered`. The cancel's rule E sees `offered` → commits `cancelled`, tombstones the offered hash and returns wraps with `termsHash: null`. Fed to the seller instance (in `offered`), those wraps give `cancelled` there too, and the seller's ledger tombstones the hash.

**T14 → T13. v2 accept path.**
- RED:
  - `accept()` with an expired seller binding → `EXPIRED` and zero prompts;
  - the seller receives the accept → `accepted`, both bindings set, `acceptanceDisplay` = `both-verified`;
  - **R2:** with `fundingClose` far beyond `offer + 3600`, `both-verified` persists at `offer + 3601` and past both bindings' `notAfterSeconds`, then becomes `window-closed` at `fundingClose − 120`; `seller-verified` becomes `offer-expired` at `offerDeadline − 120`;
  - replay → `DUPLICATE`;
  - deadline boundaries per source;
  - reordered delivery → `OUT_OF_ORDER`;
  - **k1** (§6);
  - T-DROP, both cases from §6;
  - **T-POL:** after acceptance the resolver fake starts returning `0xef0100…`; `recheckAcceptanceSchemes` → `SCHEME_CHANGED`; the display is unchanged.
- Interleavings:
  - **I4:** on the seller, an incoming accept races a local `cancel()`. With the accept holding the lock first, the result is `accepted`; the cancel's rule E sees `accepted` → `OUT_OF_ORDER`, its wraps are discarded, and **no tombstone is written**. With the cancel first, there is a tombstone, the state is `cancelled`, the accept's E2 fails → `OUT_OF_ORDER`, and **no buyer binding is written**.
  - **I5 / I13 (incoming cancel, R1):** on the buyer, a local `accept()` holds the lock while an incoming seller cancel (carrying the hash, or null) waits. The accept commits `accepted`. The cancel's rule E sees `accepted` → `OUT_OF_ORDER`, `crossedCancel: true`, no tombstone, and the state stays `accepted`, never null. In the reverse order, the cancel commits `cancelled` with a tombstone, and the accept's E2 fails with no buyer binding and no wraps.
  - **I9:** the same offer wrap is delivered twice concurrently → exactly one commit; the other is `DUPLICATE` or `OUT_OF_ORDER`; the ledger reports one `inserted` and at most one `duplicate`.
  - **I10:** the incoming offer's RPC lookup is slow, and a seller cancel commits first → the offer's rule E fails, and no binding is written.

**T15 → T14. Tombstones and cancel/reject.**
- RED:
  - **c1:** an outgoing cancel from `offered` writes the tombstone before wraps are returned (a ledger spy ordered against `createGiftWrap`).
  - **c2:** an incoming null-hash cancel against `offered` → `cancelled`, and the tombstone is written for `session.terms.hash`. A non-null mismatched hash → `HASH_MISMATCH`.
  - an incoming reject → tombstone, then commit;
  - re-take of the same pair is allowed, but re-offering the same termsHash → `TOMBSTONED` before any signer call;
  - a new buyer Nostr key with the same buyer address → `TOMBSTONED`;
  - a fresh instance after restart still refuses;
  - T-FULL (binding cap, the 192 ceiling, LOCKED, pending, flush, I14);
  - P3: a cancel arriving when `accepted` → `OUT_OF_ORDER`, no ledger write, `crossedCancel: true`, display `disputed`.
- Interleavings:
  - **I15 (carried hash ahead of the offer, R1):** the seller sends an offer for `H` and then a cancel for `H`. The buyer receives the cancel while the offer is still in RPC → `HASH_MISMATCH`, not seen, and the ledger is unchanged. The offer then commits `offered`. Delivering the cancel again → `cancelled`, and `H` is tombstoned. A cancel carrying another session's hash `H'` is never tombstoned, in any state.
  - **I6 / I11 (cross-tab):** two instances share one vault fake.
    - A tombstone in A, then a binding attempt in B → `TOMBSTONED` after the CAS reload.
    - B's stale snapshot → `CONFLICT` and the vault session locked (`vault-service.ts:370`), then the reload fails `LOCKED`. The result is `STORAGE_FAILED` for an offer or accept, and `pending` for a cancel.
    - A tab whose session reached `accepted` while the ledger holds a tombstone from the other tab → display `cancelled`.

**T16 → T09K, T11, T15. Local EVM integration** (`scripts/test-exchange-v2-evm-local.mjs`, `package.json` script `test:exchange:v2:evm`).
- RED: on Anvil, two real `eth_signTypedData_v4` signers run the full v2 flow end to end, with real NIP-44/NIP-59 wraps and a real `EncryptedVaultService` holding the allocated ledger kind.
  - The termsHash equals `tradeIdOf`.
  - **G16 reachability:** the two `termsSignature` copies from the views, together with the fixture private agreement, pass `verifyEvmAgreementBundle`.
  - The seller funds with an **empty** ledger.
  - A tombstoned re-offer is refused.
  - The deployed `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol` as an account → `UNSUPPORTED_SCHEME` (the profile-1 counterpart of the deferred ERC-1271 positive).
  - A 7702-delegated test account, if the Anvil version supports `anvil_setCode` with a designator → `UNSUPPORTED_SCHEME`.
- CI wiring is a separate Tier A follow-up.

**T17 → T16. Docs and state.** `CURRENT-STATE.md` and the package READMEs record D1 profile 1 as EOA only. `LOCALPROOF` and `tradingEnabled:false` are unchanged. Phase 4 is deferred (DEF-1). The residual risks T-PRIV, T-DROP, T-REST and the C2 (iii) liveness cost are listed.

### Phase 4 (deferred, DEF-1; not scheduled)
**T18 ERC-1271 PeerAcceptance**:
- generalize `evm-contract-acceptance.ts` to take a digest kind;
- set a v2 budget for 1271;
- have the resolver return `erc1271`;
- fixture modes 1-5, revoked approval and a reorg (`scripts/test-eip1271-local.mjs:45,48-50`);
- display "accepted by contract wallet at block N (unfinalized)" and recheck before each economic action (D1:49, D1:81).

Parallelism summary:
- Wave 1: T02, T03, T04, T06, T07, T08 and T12 in parallel. Two facades are touched, by different tasks: T02 the schemas facade and T08 the domain facade.
- Wave 2: T05, T09, T10 and T11 in parallel.
- Wave 2K: T09K alone, as soon as C1 is answered. It can overlap Wave 3 development but merges first.
- Wave 3: T13 → T14 → T15 → T16 → T17, strictly sequential.

---

## 8. Deterministic vectors and independent oracle extension

### Inputs (no invented hex)
- **Terms and domain:** load the vectors `signed-native` and `signed-erc20-other-domain` from the frozen `packages/wallet/test/fixtures/g16-evm-independent.json` by `id`. Do not retype them. The second vector supplies the cross-domain control. Each generator recomputes the `termsHash` values equal to the fixture.
- **Wallet keys:** synthetic secp256k1 scalars 1 (seller) and 2 (buyer), as in `scripts/vectors/g16_evm_independent.mjs:56-65`. The existing `TradeTerms` signatures are reused as `termsSignature`.
- **Nostr keys:** BIP-340 x-only public keys of synthetic scalars 3 (seller) and 4 (buyer), each computed by its generator's own library. The two generators must agree.
- **`notAfterSeconds`:** the scenario's `acceptBeforeSeconds`, and also `acceptBeforeSeconds - 1`, both from the fixture terms.
- **Signing:** deterministic RFC 6979, canonical low-s, with a recovery self-check.

### Cases

| Kind | Cases |
| --- | --- |
| Positive | {native, erc20} × {seller, buyer}: the PeerAcceptance struct hash, digest and signature, plus the reused `TradeTerms` signature |
| Negative digest controls | Role swapped; seller and buyer keys swapped; **buyer key replaced by the scalar-5 key** (the T-KEY k1 digest); `notAfterSeconds` +1; termsHash from the other scenario; chainId +1; verifyingContract changed; account swapped |
| **Negative terms-field controls (R9, D1:70)** | Each generator mutates one TradeTerms field of each scenario: `asset` (erc20: another address; native: switched to erc20 with an address), `amountBaseUnits` +1, `acceptBeforeSeconds` −1, `escrowExpirySeconds` +1, `revision` +1 and `sellerNonce` (last byte +1). For each mutation it recomputes the termsHash and records it. Required results: it differs from the original; the original `termsSignature` does not recover to the account over it; and the original `bindingSignature` does not recover over the binding digest built on it. The in-repo `evm-terms.test.mjs:37-41,108` already checks that each field changes the hash, but only with the implementation under test. These controls make the check independent. |
| Negative signature controls | High-s twin (`n-s`, flipped v); `v=29`; `v=1`; 64 bytes; `r=0`; `s=0`; `r=n`; a `TradeTerms` signature presented as the binding, and vice versa |
| Encoder refusals | `sellerNostrKey == buyerNostrKey`; role `"Seller"`; `v=2`; zero account |

### Coverage of the D1:69-70 list

| Packet case | Covered by |
| --- | --- |
| EOA seller and buyer, native and ERC-20; binding for both roles | Positive vectors (T03, T04, T10) |
| NIP-44 and NIP-59 round trip with official vectors | Existing `packages/nostr-crypto/test/fixtures/nip44.vectors.json` (with `NIP44-VECTORS-PROVENANCE.md`) and `nip59.test.mjs`; T16 runs real wraps |
| **ERC-1271 positive from the local fixture** | **Deviation (h)**: profile 1 refuses any account with code, so a positive cannot verify. The profile-1 counterpart is T16 (fixture account → `UNSUPPORTED_SCHEME`). The positive moves to T18. |
| High-s twin; v not 27/28; wrong length | Signature controls |
| Wrong role; swapped accounts | Digest controls |
| Changed chain id or contract | Digest controls |
| Changed asset, amount, deadline, revision or nonce | Terms-field controls (above) |
| Wrong or swapped Nostr key | Digest controls (key swap; scalar-5 key) |
| Expired | T08, T14 (behavioural; a clock, not hex) |
| Duplicate | T09, T14 |
| v1 reader given v2 | T12 |
| Oversize envelope; offer over the byte budget | T12, T13 |
| **ERC-1271 wrong magic, revert, gas exhaustion, short return, oversize return (modes 1-5), revoked approval, reorg** | **Deviation (h)**, moved to T18 (DEF-1). In profile 1 these accounts are refused before any `isValidSignature` call. |
| Tombstoned `termsHash` re-offered in a new session | T15 |
| Bare `TradeTerms` signature without its binding | T12, T13 |
| Conflicting second binding | T09, T13 (k2) |

### Freezing
Each JSON records the generator, library versions, lock integrity and source SHA-256 (the `g16-independent-README.md:3,21` pattern). T10 asserts the fixture SHA-256. No new npm or Python dependency is added.

### Python oracle extension (T05 → T03, T04)
`scripts/vectors/check_d1_peer_acceptance.py` uses the standard library plus the already-pinned `cryptography 50.0.0`:

1. A pure-Python Keccak-f[1600]/keccak256 transcription. `hashlib.sha3_256` is NIST SHA-3, not Keccak, and must not be used. The transcription self-validates against `packages/wallet/test/fixtures/eip712-keccak-vectors.json` and against every termsHash in `g16-evm-independent.json` before it is trusted.
2. An independent EIP-712 encoder for the `PeerAcceptance` type string, taken from the spec text, plus the `TradeTerms` encoder for the terms-field controls. It recomputes every digest.
3. Pure-integer secp256k1 recovery from `(r, s, v)`, with the range checks `v ∈ {27,28}`, `0<s≤n/2` and `0<r<n`. It derives the address and cross-verifies with `cryptography` ECDSA over the prehashed digest (`check_g16_evm_openssl.py:7-21`).
4. Every negative fails for its stated reason. The checker fails if there are zero signatures.

`scripts/tests/test_d1_vectors.py` runs it under `npm run test:specs` and asserts the exact verified count over both frozen fixtures, plus tamper controls. `check_g16_evm_openssl.py` stays unchanged, so its pinned "4 independently verified" holds.

### Non-cryptographic exchange fixtures
Envelope JSON with a fixed nonce and clock is built in T12 and T13: budget edge, v1/v2 cross-refusal, escape-heavy terms, horizon edge. These are not frozen hex. NIP-44/NIP-59 correctness relies on the existing official vectors in `packages/nostr-crypto`.

---

## 9. Non-goals

- No change to the escrow ABI, `BasicEscrow`, the `TradeTerms` struct or the domain (D1:27). Funding stays independent of acceptance.
- **No D9 design.** No change to `IntentV1`, the journal, `sendMarkedAt` or `evm-execution.ts`. D1 states only consumer requirements C1-C3.
- No change in meaning for v1 messages, including `{revision}` (D1:85). No mixed v1/v2 sessions. No v1 horizon.
- No transition out of `accepted` (D1:43). P3's `crossedCancel` is a display annotation only.
- No session or agreement persistence or resumption across restarts (DEF-3).
- No ERC-1271, EIP-7702 or counterfactual wallets in profile 1.
- No use of the G20 envelope's reserved `terms` kind or version 2.
- No kind-10050 inbox or relay AUTH policy (D1:84). No NIP-42 identity merging (D1:83). No protocol-version advertisement in ads (DEF-2).
- No change to `LOCALPROOF` or `tradingEnabled`. No app or UI wiring. No funding, trust-root or G16-versus-ABI work (D1:89). No app-level bundle composition (§3.6).
- No change to D4 capability-hash semantics. D1 profile 1 uses whatever terms review accepts today (D1:53).
- No hardening of v1 `signTerms` (DEF-4).

---

## 10. Disposition of prior open questions, and deferred items

| Prior open question | Disposition |
| --- | --- |
| What "reserved contract" means (0), the version identifier (13), exact type string (3, 4, 23), expiry field (2) | §2.1-§2.3; Q1 |
| Which persisted version is reserved (1), carrier location (14) | §2.5; C1; T09K; Q2 |
| Scheme field (5), scheme derivation and 7702 (26) | §2.2, §2.8 |
| D1:52, the second prompt (6, 25) | §2.3.4: both signatures carried (accepted text) |
| ERC-1271 scope (7, 22, 28, 29) | Profile 1 refuses it; DEF-1 / T18 |
| Tombstone scope and retention (8, 15), null-hash cancel (16) | Per `termsHash` in the profile's vault, deterministic id, time-bounded prune (§2.5); `purge()` and re-take in §4.4; null-hash cancel in §2.2 and rule E |
| Byte budget (9, 19) | §2.4 |
| Withdrawal after `accepted` (10) | Out of scope; P3 |
| D4 capabilities (11), capabilities mapping (31) | Non-goal; uses current terms review |
| Spec updates before code (12) | T00 gates merge |
| States for "seller signed" (17) | `offered` plus `acceptances.seller`; machine unchanged; codes in §4.4 |
| Signer port and package ownership (18) | Domain-declared `AcceptanceSigner` (§4.3); wallet `signAcceptancePair` (§4.2) |
| G20 `terms` kind (20) | Not used |
| Key lifecycle (21) | §2.7; Q1 |
| `signTerms` deployment checks (27) | Applied to the v2 pair preflight; v1 unchanged (DEF-4) |
| Fixture files and pinned counts (30) | New fixture files; existing counts untouched |

**Deferred items. They do not block D1 profile 1, so they are not owner decisions now.**
- **DEF-1 Contract-wallet policy (ERC-1271, EIP-7702 support).** Profile 1 refuses both.
  - Open: whether ERC-1271 PeerAcceptance is wanted; its v2 byte budget (two signatures of up to 8,192 hex each can exceed the 24,576-byte envelope, D1:50); a 7702 support rule (D1:48, :80); the recheck points (D1:81).
  - Suggested direction when revisited: carry 1271 signatures in a separate follow-up message rather than shrinking the terms cap (research 02:13 recommends EOA first).
- **DEF-2 Protocol discovery.** The ad format is unchanged, so a v2 client cannot learn the counterparty's version. A v2 take to a v1 seller is refused at the seller (`MALFORMED`) and simply never answered.
  - Without a discovery mechanism, apps will be pressed to fall back to v1. T00 states the no-fallback rule (T-VER) next to this gap.
  - Discovery needs a G19 ad-format change with its own review. Until then a profile is configured for one protocol.
- **DEF-3 Durable agreements.** Keeping accepted sessions and their `TradeTerms` signatures across a restart or ad expiry (§3.6) needs its own persisted allocation and design.
- **DEF-4 v1 `signTerms` hardening** with the deployment checks of the v2 preflight (§4.2).

---

## 11. Owner decisions (blocking only)

**Q1 — Approve the v2 format and rule set after T00's independent review.** *Blocks the merge of all Tier C code; development proceeds.*

Contents:
- the identifiers `v: 2` and `p2p-offramp-terms-v2`;
- the §2.3.1 type string, including (a) role-indexed keys;
- the flat `acceptance` object without a `scheme` field, and the 1,024-byte budget;
- (b) the D1:45 conflict rule with refresh;
- (c) pending tombstones;
- (d) rule E and precedence P1-P5;
- (e) `bindingTtl = 3600`;
- (f) the 604,800 s acceptance horizon and time-bounded pruning;
- (g) the two display deadlines;
- (h) no ERC-1271 vectors in profile 1;
- the restore and key-lifecycle rule (§2.7);
- the D1:82 recheck rule (§2.8).

*Recommended answer:* approve as written.

*Rationale:*
- The packet makes the identifier, the exact fields and independent review preconditions (D1:3, :37, :76), and D8 Tier C requires owner approval.
- Each choice either follows a packet line exactly or narrows it in the fail-safe direction:
  - (a) carries the same information as "own/counterparty", with one tuple to check;
  - (b) is D1:45 verbatim, and the stricter rule would block same-key restarts;
  - (c) keeps a withdrawal from being blocked by storage, at the same bounded residual as a restore;
  - (d) never lets a cancel be lost to lock contention, never writes a null state, and never transitions out of `accepted` (D1:43);
  - (f) is the only option that stops a counterparty from pinning ledger records indefinitely; a week matches the escrow's own maximum duration;
  - (g) keeps the arrival rule (D1:42) and the `block.timestamp` margin (D1:51) apart, so a valid agreement stays usable for the whole funding window;
  - (h) follows from refusing contract code in profile 1: a positive ERC-1271 vector cannot pass a verifier that refuses the account.

**Q2 — Coordination request to the D9/W1 schema and storage coordinator** (to the owner if that role is unassigned). *Blocks T09K and the merge of T02, T09 and T13-T16.*

Contents:
- (C1) allocate the ledger's persisted `(kind, schemaVersion)`, and decide older-build compatibility and the retention purpose;
- (C2) provide or approve a single serialized vault writer for **all** CAS writers (journal, durable chat, favorites, drafts, saved reviews, D1 ledger), under which no write interleaves an open journal job; decide how `submit`'s caller-captured revision handles foreign writes (iii); own the joint no-`BROADCAST_UNKNOWN` test;
- (C3) confirm `LOCKED` reporting, the `CONFLICT`-then-lock stale-snapshot sequence, and the D1 behaviour in §5.

*Recommended answer:*
- C1: a new kind `'acceptance'` v1, accepting that older builds refuse such snapshots, since the project is pre-beta, `LOCALPROOF` and `tradingEnabled:false`.
- C2: one profile-scoped FIFO writer in which journal jobs are exclusive and every other write is a single short commit with a 10 s bounded wait. The writer also hands `submit` its revision inside the queue, which removes the retry loop in (iii).
- C3: as specified in §5.

*Rationale:*
- Sources assign the persisted-version decision to the coordinator (`accelerated-beta-design.md:22,42`; `pr58-pr60-merge.md:29`).
- Sharing `trade` v1 breaks migrations and the saved-review count (§2.5).
- The CAS hazard already exists for durable chat and the personalization stores (`durable-chat.ts:197`; `favorites.ts:152`; `trade-draft-store.ts:174`). On pr/69 semantics it can turn a clean send into `BROADCAST_UNKNOWN` with a nonce hold (`intent-journal.ts:125,136,230`; `evm-execution.ts:91,105`). One writer fixes it for every writer at once. D1 cannot fix it from its side without designing D9.


---

## Appendix: remaining review findings (round 2), to be resolved before T00

**REMAINING REQUIRED CORRECTIONS**

1. **High: exception safety of ports, encoders and the lock is unspecified.**
   - `verifyEoaSignature` *throws* `EvmTermsError` on high-s, v∉{27,28}, r=0 and s=0 (evm-terms.ts:136-151). It does not return false.
   - The v2 wire parser only checks for 130 lowercase hex characters, so a peer can deliver a high-s `termsSignature` or `bindingSignature`.
   - `receive()` has a try/catch only around unwrap (exchange.ts:310-313). The plan says nothing about throw→refusal mapping, or about releasing the lock with try/finally when the signer, resolver, ledger or encoder throws or rejects.
   - The KAT "verifyEoa refuses its high-s twin" must also treat a throw as a refusal.
   - Fix:
     - Every port call and encoder in policy, ledger and exchange maps a throw to a typed refusal (`ACCEPTANCE_INVALID`, `BINDING_INVALID`, `SCHEME_UNAVAILABLE` or `STORAGE_FAILED`).
     - The lock is released in `finally`.
     - Add tests: a wire-delivered high-s, v=29 or r=0 binding gives `BINDING_INVALID`, not seen, and a subsequent operation on the same session still acquires the lock. A throwing or rejecting signer, resolver or ledger has the same outcome.

2. **Medium-High: a counterparty can drive tombstones that block a seller's v2 offers for about 8 days.**
   - §2.5 counts tombstoned records against the 128 binding cap ("records holding a binding"; "within 8 days if the full set is tombstoned").
   - A buyer can take the seller's ad repeatedly. The seller makes its routine offer each time, and the buyer cancels. The "user action" the plan relies on is the seller's normal response to a take.
   - After 128 rounds, every new v2 offer is `LIMIT_EXCEEDED` until `acceptBefore + 86,400`.
   - The T-DOS row misses this case.
   - Fix: count only records without a tombstone against the binding cap, and give tombstone-only records a separate budget that is still under the 256 in-place cap. Alternatively, drop bindings from tombstoned records. Add a T13 or T15 test for the churn.

3. **Medium: the buyer's accept is allowed after the display already says it is too late.**
   - The display flips to `offer-expired` at `offerDeadline − 120` (§3.5). But `accept()` is refused only once the seller's `notAfterSeconds` has passed (§2.6, §3.3 step 1).
   - The seller enforces arrival `< min(acceptBefore, seller notAfter, …)`.
   - An accept sent in the final 120 s commits `accepted` locally, which shows `both-verified` until `fundingClose − 120` (up to about a week). The seller refuses it as `EXPIRED`. This divergence is caused by the plan itself, not by the relay.
   - Fix: `accept()` refuses, with zero prompts, at `now ≥ offerDeadline − MAX_FUTURE_SKEW_SECONDS`, consistent with the display. Test the boundary in T14.

4. **Medium: T09K's retention classify branch is wrong and unnecessary.**
   - `reviewTimestamp` is in milliseconds. It is compared with `nowMs` and `RETENTION_REVIEW_AGE_MS = 30 days` (retention-service.ts:10, 213; chat uses `nowMs()`, durable-chat.ts:188). The plan sets it to `acceptBeforeSeconds`, so every ledger record, live tombstones included, would immediately count as an archive-review suggestion.
   - Even with milliseconds, a 30-day age can never be reached by records that self-prune within about 8 days.
   - Fix: add the kind to the snapshot closed set (`:88`) only, with no classify branch. Unknown kinds are retained by the catch at `:119`. Add a test that live tombstones are never offered as retention candidates.
   - Also tell C1 that `reviewNative` refuses any non-journal record in scope (retention-service.ts:326). Ledger records present for up to 8 days after any v2 trade therefore extend that refusal.

5. **Medium: task-graph hole for `packages/domain/src/peer-acceptance-kat.ts`.**
   - The file is listed in §4.0 and §4.3, and its constants must be copied from the frozen T03/T04 fixtures.
   - No task owns it. T08 (Wave 1, ‖ T03/T04) lists only peer-acceptance.ts, its test and index.ts, yet T08's facade block exports `assertAcceptancePorts`.
   - Fix: add a task (or split T08) that depends on T03 and T04, before T10 and T13. Also make the `hashTerms` KAT mandatory for `protocol: 2`. Today `hashTerms?` is optional, so a wrong injected `hashTerms` is unchecked.

6. **Medium: pruning drops the D1:45 conflict rule early for accepted agreements, and the plan says otherwise.**
   - Records without a tombstone are pruned at `max(notAfter) + 86,400` (about 25 h). An accepted agreement stays `both-verified` and usable for economic preparation until `fundingClose` (up to about a week).
   - After the prune, the same termsHash can be bound to a different Nostr key pair with no `BINDING_CONFLICT`. This is exactly the §2.7 fresh-key case and the D1:78 session-mapping concern.
   - §2.5 claims conflict detection "stays in force through every binding's usable life". That is false for accepted agreements.
   - Fix (either):
     - retain records holding both bindings until `acceptBefore + 86,400`. They require the local user's own wallet signature, so a counterparty cannot flood them;
     - or list this explicitly as a D1:45 narrowing under Q1 (f), and correct the claim.

7. **Medium: a cancel that arrives before its offer is lost deterministically (I15), and R2 makes the consequence much worse.**
   - Relay reordering, which is ordinary and not a drop, delivers a seller cancel(H) before offer(H). The buyer refuses it (`HASH_MISMATCH`, not seen) and relies on redelivery, which usually never comes.
   - The buyer can then accept and show `both-verified` for up to about a week, while the seller has H tombstoned. Under r1's display this lasted about an hour.
   - Fix: a bounded in-memory, per-session early-cancel memo, keyed by (session, H) and authenticated as from the counterparty. When an offer for exactly H later commits in that session, apply the memo: commit `cancelled` and tombstone H. This keeps the plan's no-cross-session-DoS property, because H must equal the session's own later offer. Add an interleaving test. If this is rejected, T-DROP must state the reorder case and the week-long window explicitly.

8. **Low corrections:**
   - **L1.** The cap of 8 lock waiters contradicts P4 ("never blocked by … lock contention"): a user's own cancel as the ninth waiter gets `LIMIT_EXCEEDED`. Exempt local cancel and reject from the cap, or restate P4.
   - **L2.** §2.8 says `recheckAcceptanceSchemes` returns `ok` or `SCHEME_CHANGED`; §4.3 adds `SCHEME_UNAVAILABLE`. State in T00 that only `ok` permits economic preparation.
   - **L3.** `packages/wallet/contract-acceptance.ts` is not a facade for the boundary checker. `isPublicPackageFacade` accepts only `packages/*/index.*` plus PUBLIC_SIDE_ENTRIES (check-import-boundaries.mjs:133-136). Reword "Wallet's only facade" (§4 layering); the conclusion that `packages/wallet/src` is not importable stands.
   - **L4. D9 creep.** The Q2 C2 recommended answer ("writer hands `submit` its revision inside the queue") and C2 (iii) prescribe changes to `submit`/`reserve` semantics in evm-execution.ts, which is D9's file. T09's test also bakes in mechanism (i) (no commit while a "journal job token" is held), although §5 says D1 accepts rebase or a separate store. Keep C2 to the guarantee (iv) plus the bounded wait. Leave the mechanism to the coordinator, and make T09's fake-writer assertion mechanism-neutral.
   - **L5.** C1 should state that an older build refusing the whole snapshot (vault.ts:152) also makes the D9 journal (nonce holds, broadcast-unknown records) unreadable on that build. The coordinator must weigh this, not only "pre-beta".
   - **L6.** T00 should state that a `verifyEvmAgreementBundle` success built from v2 `termsSignature`s (§3.6) is not a D1 acceptance. Consumers must gate on `acceptanceDisplay`, otherwise exposing the signatures lets an app downgrade to bare signatures (D1:47). No app caller exists today (only scripts).

No other downgrade path at the parser, exchange or adapter layer, and no unsafe parallel task beyond item 5.

VERDICT: NEEDS_REVISION
