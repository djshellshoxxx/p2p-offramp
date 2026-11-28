# Generation 12 source consolidation review

Observed 2026-11-20 UTC. Reviewer: branch_inventory. Scope: complete branch/PR census, exact Git ancestry, prospective merge tree, and documented/server merge policy. No runtime tests or remote changes were performed by this reviewer.

## Conclusion

The existing combined core can be integrated through a new main-target PR whose head is frozen at `d30152336bb687b31ae547ab3fcecb8835a02ef4`. Main is its ancestor, and the prospective merge tree equals the published core tree exactly: `fa0d662c991cb03729ca0a4ea53ef60960b81842`.

This avoids separately integrating older component states. Source integration is authorized by the current owner directive and the accepted Tier C consolidation policy. Merge still requires completed applicable exact-source CI, actual hosted/native/browser checkout and execution receipts, and independent review with no open High/Medium finding.

## Complete census and preservation

The complete API census contains **222 branches and 209 PRs**: 65 open, 106 merged, and 38 closed unmerged. Every API branch SHA matches the local fetched ref.

Compared with the last complete generation 11 census:

- One branch was added: `codex/optional-current-core-evidence-g11-20261120` at `db531cb03ad303821a3625f6858941de1ac07606`.
- The documentation handoff branch advanced from `3a9cfcf3b733284f3d457d5a5cc66256669bff8f` to `d72cbf40883dcb0791b20df7a0a507e1a9f4d21d`.
- PR200 records that documentation advance. No PR was added or removed.
- No branch was removed and no other existing head changed.

135 branch heads are ancestors of the combined core; one is its proper descendant; 86 diverge. Divergence alone does not establish useful missing code. The preserved historical inventory distinguishes duplicates, cumulative sources, optional packages, and obsolete implementations.

Exact ancestry confirms inclusion of PRs **171, 172, 174, 179, 181, 183, 187, 188, 189, 190, 201, 202, 203, 204, 205, 206, 207, 208, 209, 211, and 212**. In particular, QR211, relay206, backup208, dependency209, and transport212 must not be duplicated.

Main-to-core changes span 351 paths. PR207-to-core changes span 46 paths. Ancestry proves source history, not semantic preservation of every older behavior.

## Gate-respecting route

1. Preserve original PR207/210 and component refs. Create an owned branch and main-target consolidation PR at exact d301.
2. Keep new unfinished-feature work on a separate branch so it does not invalidate the already qualified core source.
3. Verify current main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`, the PR head remains d301, and the prospective merge tree remains fa0d.
4. Read completed logs and actual checkout/tree receipts for all applicable gates. At this review's status observation, nine checks succeeded and Solana program job `136092098296`, run `44677307772`, was still running. Those status labels alone are not execution review.
5. Merge with expected head/base checks after the required evidence is accepted. Reassess if any source or base changes. No force push, deletion, release, deployment, trust-root invention, or default optional activation follows from source integration.

Live GitHub reports main unprotected and no repository rulesets. These facts do not waive the documented gate. The accepted-decision index records Tier C consolidation approval; the current request supplies current source-integration authorization. The standalone Tier B packet requires one CodeRabbit or Qodo automated review pass. A separate named-bot requirement is not established for this combined Tier C source.

## Remaining source and next reviewer

Nine optional PRs191–199 remain separate package scopes, with their current-core evidence preserved on db531. Their standalone review/source gates and default-build isolation remain applicable. PR200 preserves the canonical engineering evidence separately.

Unfinished product areas include full Solana discovery/negotiation/funding UI and signed-update UI/trust composition. The parent has assigned recovery of the historical BackupVerificationForm as a bounded next feature. Physical-device qualification and owner trust inputs remain separate.

The companion JSON contains all 222 branch heads, local ancestry results, all 65 open PR identities, the exact component inclusion checks, policy sources, and the prospective merge-tree result.

Sources: [current combined PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210), [canonical handoff PR200](https://github.com/djshellshoxxx/p2p-offramp/pull/200), [accepted decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/d30152336bb687b31ae547ab3fcecb8835a02ef4/docs/adr/ACCEPTED-DECISIONS-2026-11-04.md), [D8 packet](https://github.com/djshellshoxxx/p2p-offramp/blob/d30152336bb687b31ae547ab3fcecb8835a02ef4/docs/adr/proposed/D8-merge-policy-and-branch-protection.md).
