#!/usr/bin/env bash
# Supplement to scripts/consolidation/phase2-3-retire-contained-branches.sh, for the
# state after PR #134 merged main at eef9a80312e7ac1cb84ff79307e0cdc60d6e1cc9
# (re-checked against main af4835b after #135).
# Inventoried 2026-11-18 on a full (unshallowed) fetch (14 branches). Covers branches the
# existing scripts do not list. claude/sleepy-fermat-4s6ocx is deliberately absent:
# after the phase2-3 script pinned it, it was reused for new Solana work (419ca12).
#
# For each branch: the remote tip must equal the pinned SHA, no open PR may use it
# as head or base, and its content check must pass. Then an archive/<branch> tag is
# pushed at that SHA and verified, and the branch is deleted with a lease.
#   ancestor:   pinned SHA is an ancestor of origin/main.
#   lines:      every non-blank line the branch adds since its merge base with
#               origin/main is present in main's copy of that file.
#   superseded: PR closed as superseded with owner approval; archive only, no
#               content check (the tag preserves the work).
# Safe to rerun. Dry run by default. Requires git, gh (authenticated) and push rights.
# Usage: bash scripts/consolidation/phase2-5-retire-post-134.sh [--dry-run|--apply]
set -euo pipefail
case "${1:-}" in
  ""|--dry-run) DRY=1 ;;
  --apply) DRY=0 ;;
  *) echo "usage: $0 [--dry-run|--apply]" >&2; exit 2 ;;
esac
[ $# -le 1 ] || { echo "usage: $0 [--dry-run|--apply]" >&2; exit 2; }
REMOTE=origin
REPO=djshellshoxxx/p2p-offramp
MAIN="$REMOTE/main"
command -v gh >/dev/null || { echo "gh CLI is required for the open-PR check"; exit 1; }
git rev-parse --git-dir >/dev/null
[ "$(git rev-parse --is-shallow-repository)" = false ] || git fetch --unshallow -q "$REMOTE"
git fetch --prune --tags -q "$REMOTE"

# 0 when every non-blank line added on $1 since its merge base with main is on main.
lines_on_main() {
  local mb f want have miss rc=0
  mb=$(git merge-base "$1" "$MAIN")
  want=$(mktemp); have=$(mktemp)
  while IFS= read -r f; do
    if ! git cat-file -e "$MAIN:$f" 2>/dev/null; then rc=1; break; fi
    git diff "$mb" "$1" -- "$f" | grep -v '^+++ ' | sed -n 's/^+//p' | sed 's/^[[:space:]]*//' | grep -v '^$' > "$want" || true
    git show "$MAIN:$f" | sed 's/^[[:space:]]*//' > "$have"
    miss=$(grep -cvxFf "$have" "$want" || true)
    if [ "$miss" != 0 ]; then rc=1; break; fi
  done < <(git diff --name-only --diff-filter=AM "$mb" "$1")
  rm -f "$want" "$have"
  return $rc
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
    superseded) : ;;
    *) echo "FAIL unknown mode $mode for $branch"; exit 1 ;;
  esac
  if [ $DRY = 1 ]; then echo "would archive+delete $branch @ ${sha:0:9} ($mode)"; ok=$((ok+1)); continue; fi
  git push -q "$REMOTE" "$sha:refs/tags/archive/$branch"
  git ls-remote --tags "$REMOTE" "refs/tags/archive/$branch" | grep -q "^$sha" \
    || { echo "FAIL tag not verified: $branch"; exit 1; }
  git push -q --force-with-lease="refs/heads/$branch:$sha" "$REMOTE" ":refs/heads/$branch"
  echo "archived+deleted $branch"; ok=$((ok+1))
done <<'LIST'
nodata/affectionate-ritchie-xq4bon 86224cfb4abe19c266cf99d441bd64d52f5c57b4 ancestor
nodata/epic-goldberg-sg8n96 1df700355e5199c69e84d5b41b12005677b5f5ee ancestor
chatgpt/zero-codex/audit-evm-schema-20261110 353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab lines
chatgpt/zero-codex/docs-collaboration-20261117 e21a58e6a4d09c099d3249660ddec770f2164a74 lines
chatgpt/zero-codex/docs-python-baseline-20261116 75a5e35b56310a9660aa7c6a3855db3c64e759f4 lines
chatgpt/zero-codex/qualify-pr61-20261110 a1930a3596f76eff4c29a1ee2991d6acd7f35895 lines
review/codebase-security-20261104-94554ec 6e9c0c5ea8881013d06892103cf87ef1c547476a lines
docs/offramp-research-tools-execution-plan-20261106 0f1792f589a20efab1f629f38d2a0068d4f44193 lines
chatgpt/zero-codex-continuation-spec-20261109 62c6c14539ccc2ac2e56658a81602f6d1ba50d73 superseded
claude/p2p-offramp-prompt-lqcgno 25a01987385b49e9c28199fdfb4a874b29a6ad89 superseded
codex/setup-autonomous-agent-20261104 54e632f8f472a4d26b2fdda4ebdd3f2e02a5dba0 superseded
parallel/localization-blank-warning-20261113 718208880b650b03ac380d358a00878480827870 superseded
claude/compassionate-gauss-uyhfih 970ac80f08c04e8d340ee57d901e48e26a667a18 superseded
claude/quirky-knuth-3s6ysy 2f839b12768700ac6c3b674f75a144c6ec19fa93 superseded
LIST
echo "done: $ok processed, $skip skipped, $gone already gone"
