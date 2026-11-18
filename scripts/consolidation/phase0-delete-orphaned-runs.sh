#!/usr/bin/env bash
# Phase 0 of docs/consolidation/2026-11-18-branch-consolidation-gameplan.md (issue #130).
# Deletes the 15 workflow runs that GitHub created on 2026-11-11 between 20:29 and
# 20:32 UTC but never dispatched. They cannot be cancelled (API 409). Each run is
# pinned to its head SHA, and a run is deleted only while it is still queued, has
# zero jobs, is at that SHA and was created in that window. Nothing is re-run.
# Safe to rerun: runs that are already gone are counted and skipped.
# Requires: gh, authenticated as a user who can administer Actions on the repo.
# Usage: bash scripts/consolidation/phase0-delete-orphaned-runs.sh [--dry-run|--apply]   (dry run by default; --apply performs the deletions)
set -euo pipefail
# Dry run unless --apply is given exactly; any other argument is refused, so a typo never runs the live path.
case "${1:-}" in
  ""|--dry-run) DRY=1 ;;
  --apply) DRY=0 ;;
  *) echo "usage: $0 [--dry-run|--apply]" >&2; exit 2 ;;
esac
[ $# -le 1 ] || { echo "usage: $0 [--dry-run|--apply]" >&2; exit 2; }
REPO=djshellshoxxx/p2p-offramp
command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated: run gh auth login"; exit 1; }
err=$(mktemp); trap 'rm -f "$err"' EXIT
ok=0; skip=0; gone=0
while read -r id sha; do
  [ -z "$id" ] && continue
  if ! meta=$(gh api "repos/$REPO/actions/runs/$id" --jq '[.status, .head_sha, .created_at] | join(" ")' 2>"$err"); then
    if grep -q 'HTTP 404' "$err"; then echo "gone $id"; gone=$((gone+1)); continue; fi
    echo "FAIL reading run $id:"; cat "$err"; exit 1
  fi
  read -r status head created <<<"$meta"
  jobs=$(gh api "repos/$REPO/actions/runs/$id/jobs" --jq '.total_count')
  if [ "$status" != queued ] || [ "$head" != "$sha" ] || [ "$jobs" != 0 ] || [[ "$created" != 2026-11-11T20:* ]]; then
    echo "SKIP $id: status=$status head=$head jobs=$jobs created=$created"; skip=$((skip+1)); continue
  fi
  if [ $DRY = 1 ]; then echo "would delete $id (${sha:0:9}, $created)"; ok=$((ok+1)); continue; fi
  gh api -X DELETE "repos/$REPO/actions/runs/$id" >/dev/null
  if gh api "repos/$REPO/actions/runs/$id" >/dev/null 2>&1; then echo "FAIL run still present after delete: $id"; exit 1; fi
  echo "deleted $id"; ok=$((ok+1))
done <<'LIST'
43096680664 a1930a3596f76eff4c29a1ee2991d6acd7f35895
43096680635 a1930a3596f76eff4c29a1ee2991d6acd7f35895
43096680641 a1930a3596f76eff4c29a1ee2991d6acd7f35895
43096596488 c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf
43096596504 c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf
43096596557 c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf
43096544209 3c8423d4cb5a3ba7d49944808088279fc60dc46e
43096544199 3c8423d4cb5a3ba7d49944808088279fc60dc46e
43096544071 3c8423d4cb5a3ba7d49944808088279fc60dc46e
43096508461 353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab
43096508218 353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab
43096508216 353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab
43096380160 c153a99dd5c876c23bdb115f7037a4bf63cb57d4
43096380278 c153a99dd5c876c23bdb115f7037a4bf63cb57d4
43096380324 c153a99dd5c876c23bdb115f7037a4bf63cb57d4
LIST
echo "done: $ok processed, $skip skipped, $gone already gone"
