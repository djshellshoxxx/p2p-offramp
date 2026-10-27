#!/usr/bin/env bash
# Regenerates abi/BasicEscrow.json from the pinned compiler. CI runs this and fails on any diff,
# so the committed ABI always matches src/BasicEscrow.sol.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p abi
# Write to a temp file first so a missing or failing forge never truncates the committed ABI.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
forge inspect --json src/BasicEscrow.sol:BasicEscrow abi > "$tmp"
mv "$tmp" abi/BasicEscrow.json
echo "wrote abi/BasicEscrow.json"
