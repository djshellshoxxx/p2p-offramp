#!/usr/bin/env bash
# Phases 2 and 3 of docs/consolidation/2026-11-18-branch-consolidation-gameplan.md.
# Run only after the trunk (PR #132) is merged into main and the PRs that use
# these branches are closed. For each branch: verify the remote tip still equals
# the pinned SHA, verify no open PR uses it as head or base, verify its work is on
# main, push an archive/<branch> tag at that SHA, verify the tag, then delete the
# remote branch. Any failed check skips that branch, so nothing unverified is lost.
#   ancestor: the pinned SHA must be an ancestor of origin/main.
#   lines:    the branch is patch-equivalent, not an ancestor (D9 test stack and
#             Solana payout docs). Every non-blank line it adds since its merge
#             base with origin/main must be present in main's copy of that file.
# Safe to rerun. Requires: git, gh (authenticated), and push rights to origin.
# Usage: bash scripts/consolidation/phase2-3-retire-contained-branches.sh [--dry-run]
set -euo pipefail
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
REMOTE=origin
REPO=djshellshoxxx/p2p-offramp
MAIN="$REMOTE/main"
command -v gh >/dev/null || { echo "gh CLI is required for the open-PR check"; exit 1; }
git rev-parse --git-dir >/dev/null
git fetch --prune --tags -q "$REMOTE"

# 0 when every non-blank line added on $1 since its merge base with main is on main.
lines_on_main() {
  local mb f want have miss
  mb=$(git merge-base "$1" "$MAIN")
  want=$(mktemp); have=$(mktemp)
  while IFS= read -r f; do
    if ! git cat-file -e "$MAIN:$f" 2>/dev/null; then rm -f "$want" "$have"; return 1; fi
    git diff "$mb" "$1" -- "$f" | grep -v '^+++ ' | sed -n 's/^+//p' | sed 's/^[[:space:]]*//' | grep -v '^$' > "$want" || true
    git show "$MAIN:$f" | sed 's/^[[:space:]]*//' > "$have"
    miss=$(grep -cvxFf "$have" "$want" || true)
    if [ "$miss" != 0 ]; then rm -f "$want" "$have"; return 1; fi
  done < <(git diff --name-only --diff-filter=AM "$mb" "$1")
  rm -f "$want" "$have"
}

open_prs() { # number of open PRs using branch $1 as head or base
  local h b
  h=$(gh pr list --repo "$REPO" --state open --head "$1" --json number --jq length)
  b=$(gh pr list --repo "$REPO" --state open --base "$1" --json number --jq length)
  echo $((h + b))
}

ok=0; skip=0; gone=0
while read -r branch sha mode; do
  [ -z "$branch" ] && continue
  cur=$(git ls-remote --heads "$REMOTE" "refs/heads/$branch" | cut -f1)
  if [ -z "$cur" ]; then gone=$((gone+1)); continue; fi
  if [ "$cur" != "$sha" ]; then echo "SKIP moved: $branch ($cur != $sha)"; skip=$((skip+1)); continue; fi
  n=$(open_prs "$branch")
  if [ "$n" != 0 ]; then echo "SKIP $n open PR(s) use $branch"; skip=$((skip+1)); continue; fi
  case "$mode" in
    ancestor) git merge-base --is-ancestor "$sha" "$MAIN" || { echo "SKIP not on main: $branch"; skip=$((skip+1)); continue; } ;;
    lines) lines_on_main "$sha" || { echo "SKIP added lines not all on main: $branch"; skip=$((skip+1)); continue; } ;;
    *) echo "FAIL unknown mode $mode for $branch"; exit 1 ;;
  esac
  if [ $DRY = 1 ]; then echo "would archive+delete $branch @ ${sha:0:9} ($mode)"; ok=$((ok+1)); continue; fi
  git push -q "$REMOTE" "$sha:refs/tags/archive/$branch"
  git ls-remote --tags "$REMOTE" "refs/tags/archive/$branch" | grep -q "^$sha" \
    || { echo "FAIL tag not verified: $branch"; exit 1; }
  # The lease makes the delete fail if the branch moved after the check above.
  git push -q --force-with-lease="refs/heads/$branch:$sha" "$REMOTE" ":refs/heads/$branch"
  echo "archived+deleted $branch"; ok=$((ok+1))
done <<'LIST'
claude/loving-einstein-xgzvdy-decisions 89d0a928e9e1127a4c8911f9437359260bd06ab6 ancestor
claude/gifted-faraday-73kydc 8fb081b492ccf9ecef4dc47525c753cac670dacb ancestor
codex/foundation-gates-20261104 77fb7c52dcdde58cad17ceee45a0f43e7e22ad43 ancestor
codex/core-continuation-20261104 edc66f6a503176302bd17dd1ca073947273f7d9a ancestor
codex/post-send-reconcile-20261109 af0e1789889790c2050142ed508b5042ef5bcc85 ancestor
codex/rq00-evidence-20261109 a136909721046ec8a540ed98ecfdcbf4c4bcf8ad ancestor
gpt/p2p-beta-spec-20261109 c4fb7b590639e2a1d0a3220cf6bf7936156cc8e4 ancestor
integration/privacy-endpoint-disclosures-20261109 07b3b2abfc548a1b69621396b1d45a52dfe79063 ancestor
claude/sleepy-fermat-4s6ocx e2e25cf0f5aa43c23d4f70ad8ef1c120b7df9746 ancestor
claude/p2p-offramp-evm-escrow-vc7stk edc8a6971819a5e726f4c22813b4e51a6b9d8f9e ancestor
chatgpt/zero-codex/docs-wiki-20261110 c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf ancestor
parallel/cli-argument-regression-20261113 605bcd24ef3d239f6a080c129761132482029ef7 ancestor
parallel/tooling-source-correspondence-20261113 32a4052163553f7826d55f784ab9a6e96425e576 ancestor
integration/pages-offline-recovery-20261112 9550d4b182806170ee28149e9d46ffbccef56c33 ancestor
parallel/browser-runtime-engines-20261113 378fdf92c0b9a340dff3587a0b53dd568292f3e6 ancestor
parallel/accessibility-recovery-panels-20261113 db38fba65be8b6e19c880c78e439e712ffe7e974 ancestor
parallel/docs-web-profile-recovery-20261113 3524096c0ff1f4d743b01f06421bc56bbe07b9b3 ancestor
parallel/browser-cold-nonce-20261113 2cacd1d5219a82d984a75668838204e3160d5791 ancestor
parallel/browser-cold-recovery-20261113 65efc3428ff01d4f091600baee85edfff094b347 ancestor
parallel/browser-peer-offer-20261113 d6d65a47b99e68d00f82153d83fef366e532cf67 ancestor
parallel/portable-recovery-guide-20261113 05794e754c8bf588fc6781100e8af99675418629 ancestor
parallel/recovery-builder-help-20261113 4f75e00d0c8e7eb9f61efd633b684ca0a47b9d76 ancestor
parallel/locale-20261113 c4b13ddccc5bd78406762c656df5af35958e83f9 ancestor
parallel/diagnostics-20261113 330fa1ede8b70e532a02230e4895b0711579491e ancestor
parallel/spec-tool-20261113 6d48c9b0695cacd2a166a7386f24b61a6248bc10 ancestor
integration/pages-beta-qualification-20261112 4dcddf2b4bcc9890e50647cea067f81b1b734cdd ancestor
integration/m2a-safe-fixes-20261114 c0bbfe62951873a0960b4218b9db9b06b616da5a ancestor
codex/completion-20261116 88f9e40bbf8ea086705edd554a2555865429b54a ancestor
codex/d9-migration-20261116 c1f8e750beb7e22d5b9a7f0e47cca9f8cd8bdb65 ancestor
codex/consolidation-20261116 274d4fe533f47ffa15aed936bd095f82ad10d9ce ancestor
codex/continue-completion-20261116 e7506c22e6b0bc405a9e51f1c809fa30c2fe5861 ancestor
codex/peer-acceptance-20261116 b3f508420e63329ab30e1b646f61337020a1ebad ancestor
integration/p2p-consolidated-20261109 fa28a3702517eb98293b3c5cca5070e74a2e2b57 ancestor
codex/solana-payout-docs-20261109 7e8d571ae350190e9ba0fdf50a7b9184a4730ad9 lines
claude/confident-fermi-g6wjp3 64c7c1861779ea34632f2f800b80bdaecbaefa03 ancestor
codex/review-consolidate-20261116 5eadddd54f6db6e755e658c1982c95f95b37a823 ancestor
chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111 619fc7413fa65e63db39e5a63bf1bbfdb4ff1d2b ancestor
chatgpt/zero-codex/d9-marker-failure-20261110 44ca5fcf5e5d94893b5d7a0e3e15735506a76f52 lines
chatgpt/zero-codex/d9-restore-regression-20261110 78af7214a1aab97eb3eb7722793bb536e7d6ff39 lines
chatgpt/zero-codex/d9-restored-account-isolation-20261111 b19ae4637538d7c364b4e55a2624b0b908d5cb7f lines
chatgpt/zero-codex/d9-restored-casefold-20261110 f393c365937cbadee4bb1a0a35f78c4c105cbcee lines
chatgpt/zero-codex/d9-restored-cross-network-nonce-20261111 dd5cf16da0c7e0c2f1613153ac746bd6390ec587 lines
chatgpt/zero-codex/d9-restored-hash-conflict-20261110 146d06d81474445434070aff557ad56379ad24a3 lines
chatgpt/zero-codex/d9-restored-pending-20261110 94778c3282a99110922aa260b5f4ea98dd34caf9 lines
chatgpt/zero-codex/d9-restored-prepared-20261110 92cc054ce9a2ee21936e20d103757e374f4af296 lines
chatgpt/zero-codex/d9-restored-race-20261111 e8afa6af3db9ac9575f57beaef61886e3b79683a lines
chatgpt/zero-codex/d9-restored-terminal-20261110 06305ebaccd99fa8e2ce7a9d5eccc05d9fbde28f lines
LIST
echo "done: $ok processed, $skip skipped, $gone already gone"
echo "Not listed (their tips move with the merge): nodata/affectionate-ritchie-xq4bon and"
echo "nodata/epic-goldberg-sg8n96. Delete them with GitHub's Delete branch button after the merge."
