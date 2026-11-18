# Shared helpers for the scripts/consolidation retirement scripts. Source this file; do not run it.
# Covered by scripts/tests/consolidation-lib.test.mjs.

# lines_on_main <sha> [main-ref]
# Exit 0 only when every non-blank line that <sha> adds to a file since its merge base with
# main is present in main's copy of that file (leading whitespace ignored on both sides).
# Fails closed (exit 1) when:
#   - the merge base cannot be computed (unrelated history, unknown SHA);
#   - any git command fails;
#   - an added or modified path is absent on main;
#   - a changed file is binary, because its content cannot be line-checked.
# Renames are not followed (--no-renames), so a renamed file's whole content counts as added.
# Deletions are not work to preserve and are ignored.
lines_on_main() {
  local sha=$1 main=${2:-${MAIN:-origin/main}} mb names stat f tmp rc=0
  mb=$(git merge-base "$sha" "$main" 2>/dev/null) || return 1
  [ -n "$mb" ] || return 1
  names=$(git diff --no-renames --name-only --diff-filter=AMT "$mb" "$sha") || return 1
  stat=$(git diff --no-renames --numstat --diff-filter=AMT "$mb" "$sha") || return 1
  # numstat prints "-<TAB>-<TAB>path" for a binary file.
  if printf '%s\n' "$stat" | grep -q $'^-\t-\t'; then return 1; fi
  tmp=$(mktemp -d) || return 1
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if ! git cat-file -e "$main:$f" 2>/dev/null; then rc=1; break; fi
    if ! git diff --no-ext-diff --no-color --no-renames -U0 "$mb" "$sha" -- "$f" > "$tmp/diff"; then rc=1; break; fi
    # With -U0 a single-file diff is a header, then hunk headers and +/- lines. Every "+" line
    # after the first "@@" is content, including content that itself starts with "++ ".
    awk 'started && /^\+/ { sub(/^\+[[:space:]]*/, ""); if (length) print } /^@@/ { started = 1 }' \
      "$tmp/diff" > "$tmp/want" || { rc=1; break; }
    if ! git show "$main:$f" > "$tmp/main"; then rc=1; break; fi
    sed 's/^[[:space:]]*//' "$tmp/main" > "$tmp/have" || { rc=1; break; }
    # Any wanted line that is not a whole line of main's copy fails the check.
    if grep -qvxFf "$tmp/have" "$tmp/want"; then rc=1; break; fi
  done <<< "$names"
  rm -rf "$tmp"
  return $rc
}

# tag_at <remote> <tag-ref> <sha>: exit 0 only when the remote tag resolves to exactly <sha>.
tag_at() {
  local got
  got=$(git ls-remote --tags "$1" "$2") || return 1
  [ "$(printf '%s\n' "$got" | cut -f1)" = "$3" ]
}
