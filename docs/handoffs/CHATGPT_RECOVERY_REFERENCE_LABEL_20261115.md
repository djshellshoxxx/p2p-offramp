# Static Pages recovery-reference label correction — isolated handoff

Date: 2026-11-15. **Draft proposal; not merged, deployed, or release-qualified.**

## Identity and ownership
- Base: `main@cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e`.
- Test-first commit: `a4dc8551fa734ffa2738eaebef58ef3ff46c9a6c`.
- Minimal implementation commit: `e5b4c6cc2eb57603f136348e79835341fd5e4ce1`.
- Branch: `chatgpt/zero-codex/recovery-reference-identity-20261115`. PR #61 integration owner branch was not modified.
- Scope: static GitHub Pages client UI and its synthetic offline browser regression only.

## Reproduction and correction
The G12 recovery-reference projection filters unsupported journal entries, so `page.items[index]` is **not necessarily journal entry `page.offset + index`**. Previously the panel presented a label such as “Reference 3” for supported journal record #4 whenever journal record #3 was unsupported, potentially creating a false original-journal position.

The UI now labels records by **page-local displayed ordinal** and shows their full stable `recordId` as inert text. The underlying journal offset continues to govern page/revision selection; no schema/serialization, security, permission, wallet, or recovery-export contents changed.

The synthetic browser fixture already makes record #3 unsupported and supplies 70 journal entries. The new regression checks that the third display entry includes the immutable ID of record #4 and that the second page starts with its page-local first display item and original record ID #65. Existing preview, lock, revalidation, download, profile-isolation and egress checks remain intact.

## Validation and limits
- RED test-only commit created first, but **a failed test run has not been demonstrated**.
- GREEN source fix committed. No local browser, Node, typecheck or build tests have been executed during this run. Exact-head GitHub Actions CI must be checked and reported independently.
- This is not security or release certification. No SonarCloud Security Rating A claim.
- Integration PR #61 currently changes these same source/test paths. Coordinate the minimal patch with its owner; do not merge by bypassing reviews. Historical PR #61 CI does not qualify this new commit.

## Next steps
1. Inspect exact-head browser, TypeScript, policy and security checks on this isolated draft PR. Diagnose any failures, including test-label accessibility matching.
2. Have integration owner review or cherry-pick if appropriate; resolve overlaps by review rather than rewriting the owner's branch.
3. Preserve `ReleaseEnabled=0`, no deployment or real funds. Maintain independent approval and audit gates.
