# Implementation package assessment — no work started

Requested report only for possible user-operated Claude API work. No external agent was invoked, no API credit was spent, and this document grants no new scope or publication authority. Current local source is not pushed; a fresh GitHub clone does not contain these checkpoints.

## Ranked bounded work

1. **P2P: fixture-backed composition of existing G08 authority, G12 intent journal and G16 TradeTerms.** Highest new-functionality payoff among these two repositories: connect existing modules to a deterministic read-only trade/recovery timeline and test duplicate/reordered/late events, stale generations, contradictory observations/reorgs, expiry and unresolved sends. Reuse `TradeAuthority`; it already exists and must not be rewritten as a duplicate engine. Keep `economicPreparationAllowed()` false, wallet/identity test-only, ReleaseEnabled=0 and network origins empty. This is ready canonical engineering because controlled fixtures supply observations/terms and nothing selects trust roots, enables signing, clears uncertain spending or chooses production retry policy. File ownership should be one new composition module plus focused tests; the integrator owns shared exports/UI/handoffs. The exact interface/name should follow current canonical specs, not a new feature specification.
2. **GhostPay: default artifact reachability and core-flow evidence.** Trace existing App→SellerKeys→TagArchive and other preserved extras, record actual default/flagged/bundled reachability, then complete only the already-approved evidence gaps in the EVM flow. Valuable money/key assurance, but less new product functionality than P2P. Retain modules; do not infer permission to remove code, redesign recovery or create reload/cross-tab journal policy. A bounded read-only graph/evidence task is ready now; any source isolation needs current integration ownership and exact-source checks.
3. **P2P: secret-bearing identity G06 review.** Existing Noble identity code and BIP340 vectors make a bounded independent provider/randomness/lifecycle review feasible without owner trust decisions. This is qualification rather than a live-wallet feature and is not the best package for maximizing visible product coding. Accepted G16 public-data review does not cover it.

The first package targets the existing frozen lean EVM/G08/G12/G16 sequence. It does not complete escrow, wallet/network integration or a two-party trade. Actual G11/G15 signing-root/update/deployment choices, verified custody tooling, private packet access, real wallet/device review and later funds permission remain gates, but they do not block this fixture-only composition. Preserve the fixed noncustodial/client-side architecture.

## Baseline that is actually available

Verified private source package: **Library `libfile_bc6ed2cb4a7481919459a534ac05e4ba`, version0**, `GhostPay-P2P-root-exit-G06-checkpoint-20261026.zip`, SHA-256 **`beda5022b515aa571c06900e78b3e5203b92850a969523b80e90764d95b43b4d`**.

It contains GhostPay source0f85ee9bd316546b3814bf327fa45ad3d76c7851 and P2P source **02f75b452045afd35b71d977c347c331937568ee**. The P2P inner source archive and six domain/schema file hashes were checked against current source; see `docs/evidence/ASSIGNMENT_BASELINE_20261026.json`. The six selected APIs are byte-identical. Later accepted-review metadata/tests, notices, reports and handoffs are not assumed present in that older archive. The current reuse/attribution artifact contains documentation, not replacement repositories.

An owner-operated worker must first materialize and verify that exact available baseline through its supported route. Consumer download from another environment has not been proven working; previous denied/failed transfer routes must not be retried here. No fresh-clone/current-HEAD or complete-GhostPay-history claim is made. External work must return a separate reviewable patch/branch and not overwrite current local integration changes.

## Luthier comparison limit

This coordinator has not inspected Luthier's six named pedal gaps or native Windows baseline. A user-operated Windows machine could make Windows qualification materially more useful there; parent is obtaining that source/ranking evidence and official Claude setup instructions. No defensible overall three-project winner or $200 token/cost estimate is invented here. Among GhostPay/P2P, P2P has the larger bounded coding backlog; GhostPay has strong bounded assurance value.
