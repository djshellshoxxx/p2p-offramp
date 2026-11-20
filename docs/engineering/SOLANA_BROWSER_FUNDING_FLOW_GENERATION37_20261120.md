# Generation 37 — explicit seller funding in the local Solana browser profile

## Result and source

The maintained local Solana app now composes the complete explicit seller path: save fixed proposal, connect the original seller wallet, prepare an exact funding review, confirm once, reconcile uncertainty and materialize ordinary recovery only after a trusted finalized native escrow observation. The original proposal remains unchanged. **208/208 selected cases passed**, including **41 new app/controller/TSX/document-client cases**. All four TypeScript projects, static boundaries and full main-baseline whitespace pass. No browser, validator or native financial journey ran locally.

| Identity | Exact value |
| --- | --- |
| Reviewed G36 source / direct parent | `b785a01ffc54a75d497641d0e758d077adff41d0` |
| Frozen G37 app source | `107ce93d030298f2668285067e156979c883184d` |
| Complete frozen source tree | `c992a93385240cdbfcecae79e70c73d1b2295013` |
| Full whitespace baseline, without exclusions | `8e836baa877b676a863c877003e277b638fc5061` |

The delta contains twelve paths: seven production/facade paths, one updated existing UI fixture, and four new test/support files. It adds four non-documentation entries for a total of **1,042**, including the existing Gitlinks. The public facade exports only actual consumers: the prepared-funding type, the G33 display projection and the recovery-document constructor. The G33 implementation changes only its now-stale no-consumer comment. Native compose, planners, journal rules, wallet bridge, installed configuration, assets, margins and trust remain unchanged.

Source: [controller](../../apps/web/src/solana-localnet/controller.ts), [protocol](../../apps/web/src/solana-localnet/protocol.ts), [exact command parser](../../apps/web/src/solana-localnet/validation.ts), [document client](../../apps/web/src/solana-localnet/client.ts), [maintained UI](../../apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx), and [local facade](../../packages/chain-solana/localnet.ts). The receipt records the exact Git entry, byte length and SHA-256 of every changed path.

## Original authority and explicit consent

Two purpose-bound commands select the 32-hex private proposal record ID: `funding.wallet.connect` and `funding.prepare`, with an optional explicit `rebuildOf` only on preparation. Exact own-data validation rejects extra fields, accessors, supplied role, terms and generic transactions. The existing `RecoveryAction` and `review.prepare` remain exit-only; funding uses its dedicated native entry. Public reviews discriminate the fund action and proposal ID while retaining the common explicit confirm/cancel commands.

The controller retains a private owner tuple containing the original saved proposal, original bound trade, actual wallet session and native client, current profile/session and epoch. Its private review holds the actual original prepared-funding handle. Confirmation consumes the public review before awaiting and checks every retained ownership reference before calling that same client's original handle and wallet. The native client's existing private full-binding/profile check remains authoritative. Display hashes, addresses, copied review fields and the G33 projection provide no substitute authority.

Profile lock/restore/disposal, wallet changes, replacement proposal connections and ordinary recovery-wallet connection retire funding ownership. The document client explicitly grants and unblocks the new connect/prepare command names and redacts proposal wallet ownership while wallet access is blocked. The existing bridge retains exact one-shot account/chain/message grants and its physical pending prompt slot until the provider settles, even when logical consent has already been revoked.

The G33 projection supplies immutable semantic review fields: complete fixed terms/hash, seller and buyer, nonce/revision, both deadlines, native principal and seller source, escrow/deployment pins, original blockhash/message and qualified height metadata. Fees, rent and total debit are shown as unknown. Peer acceptance and a funding outcome remain unestablished. The exact `Message (base64)` label is preserved for the separate native fixture's byte comparison.

## Observation, uncertainty and promotion

G36 proposal admission still performs one encrypted write without RPC, wallet connection or native preparation. Activation, unlock and restore may load validated proposal journal display records but perform no proposal-side RPC. Historical mismatch and unsupported proposals remain readable under their stored provenance; they never install configuration.

Explicit connection and preparation observe the original binding. An explicit refresh calls native recovery only when no live review owns that proposal; a retained live review uses reconciliation instead, because recovery would cancel its current-profile unmarked preparation. Paired proposals reuse the existing recovery trade's observation and journal inventory. Same-profile abandoned preparations and foreign-origin restored uncertainty retain their native distinctions.

The snapshot reports finalized observation state, nullable chain time, actual private wallet ownership and journal display with predecessor IDs. Existing 60-second freshness applies; stale or failed reads are unverified. No `canFund` authority flag is introduced. The native planner remains responsible for signer, program identity, capability policy and chain-time windows. Pending transactions block new app preparation. A definitive drop requires an explicit rebuild control naming its predecessor; the native single-successor rule remains unchanged. No refresh or restore automatically resends or replaces a message.

A signature, prepared/signed/sent/unknown journal state or successful wallet approval never creates recovery. Promotion requires a trusted finalized read containing the matching native escrow; the maintained recovery-exit validator authenticates its brand, full binding and finality. Existing released/refunded escrows are also representable. A pure recovery-document constructor alone proves no funding.

Promotion preserves a known full-binding recovery record and its existing role/origin without writing. Otherwise it computes the ordinary deterministic recovery ID, captures the live revision before reading that exact ID, refuses any unknown occupied record and uses the captured revision for one guarded CAS. It never adopts a later revision after the occupancy read. Storage/revision/lock failures remain outside the ordinary observation-error catcher and reach dispatch's revocation path.

The new ordinary recovery payload retains the original proposal's profile provenance and seller role; a restored proposal may correctly have an older origin than a new current-profile funding intent. The original proposal bytes remain intact, and the shared quota still counts the pair once even above the historical admission limit. Current validated pending intents accompany promotion so an uncertain transaction continues to block settlement. Explicit public recovery import keeps its previous destination-profile provenance semantics.

## Controlled verification

The final selection ran on the exact frozen tree before the source commit, from **2026-11-20 21:07:58.454190 to 21:08:09.046059 UTC**. Its complete 17,668-byte log has SHA-256 `112cef79e72176ee63a09ca7d73d549a58b304d08b35380a9254ed97c101be54`. The execution receipt correctly identifies parent HEAD `b785a01`, the uncommitted complete tree and retained binary patch. The subsequent source commit has that exact tree; this is not presented as a separate test execution on the later commit.

| Execution | Result and scope |
| --- | --- |
| Initial missing-feature baseline | 7 cases, all fail on unsupported commands |
| Initial complete controller flow | 6/7 pass; finality fixture used the blockhash's own slot |
| Focused finality diagnosis | 0/1; existing native status check correctly reports integrity failure |
| Corrected flow plus G36/UI/recovery selection | 59/59 |
| Intermediate TypeScript | All four projects pass on its recorded intermediate tree |
| Expanded app selection | 37/41; four document-wallet fixtures omitted required legacy transaction support |
| Final app plus adjacent native/bridge/codec selection | **208/208**, zero failures/cancellations/skips/todos |
| Frozen-source TypeScript | All four projects pass on `107ce93` |
| Frozen-source static boundaries | Pass: **244 production files / 157 core graph modules** |

The new cases cover the complete exact-review/one-send/finalized-promotion/export flow; duplicate confirmation, cancellation and expiry; live-review refresh; proposal-specific wallet ownership; held prompt revocation; uncertain sends and explicit drop replacement; zero-RPC unlock/restore display; foreign-origin restore and preserved proposal provenance; pending-intent settlement gates; occupied IDs; buyer-role recovery preservation; overflow quota; held atomic-write and digest interruption; a same-vault revision race after a null occupancy read; signer, capability, deadline and program-pin refusal; stale observations; and actual maintained TSX/document-client command, duplicate-handler, physical-prompt and stale-result ownership.

The controller tests use the actual native client, encryption, backup and journal implementation with an in-memory store and scripted RPC/keypair wallet fixtures. The TSX harness executes the maintained component with controlled hooks/client responses. The document-client tests exercise the actual client and unchanged bridge against controlled Worker deliveries and a delayed external-wallet fixture. They do not establish DOM/IndexedDB, native Worker scheduling, a physical device or chain acceptance.

The 208-case selection includes earlier G36, funded recovery, public export, wallet bridge, native prepared funding, G33 projection and package-boundary cases. These counts overlap earlier runs and must not be added. The original G36 assertions remain; its existing UI fixture only receives the newly required passive proposal-view fields.

## Failure retention and evidence

All nine executions retain complete original output, original metadata and their binary execution patch. Each tree independently reconstructs from its recorded HEAD using an isolated temporary Git index. Every retained artifact has raw/compressed byte lengths and SHA-256 hashes and reproducible gzip `mtime=0`. The evidence also retains the execution runner, frozen source patch, source identities, packaging verifier and accepted coordinator contract.

The first finality fixture incorrectly placed a finalized transaction at the same slot as its blockhash. The maintained native check requires a later slot. The fixture now advances one scripted slot before publishing its finalized result; the original failing run and diagnostic remain. No chain-time margin or production assertion changed.

The four document-client failures came from a controlled wallet lacking its mandatory `supportedTransactionVersions: ['legacy']` feature. Adding that required advertised capability lets the intended delayed-signing assertions execute. The bridge's refusal and all assertions remain unchanged; the original 37/41 run is retained. No real wallet connection, native transaction or network request occurred.

Dependencies reuse immutable physical hardlinks from the established worktree; no package installation occurred. No full-repository suite, ordinary build, browser, validator or native financial journey ran in this author task. The native-driver companion, independent review and root composition have separate source identities and qualification responsibilities. Their results are not claimed here.

**G35/G36/G37 remain inputs to the next complete browser funding candidate above frozen PR241.** Applicable actual-source/actual-target hosted acceptance and matching recorded Tier C owner authorization remain required before merge. Local evidence does not establish peer acceptance, release, deployment, main-branch completion or merge approval. **`ReleaseEnabled=0`.**

- [Machine-readable receipt, exact commands and retained artifacts](../execution/solana-browser-funding-generation37-20261120/receipt.json)
