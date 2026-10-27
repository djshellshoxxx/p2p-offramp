#!/usr/bin/env bash
# Regenerates abi/BasicEscrow.json from the pinned compiler. CI runs this and fails on any diff,
# so the committed ABI always matches src/BasicEscrow.sol.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p abi
forge inspect --json src/BasicEscrow.sol:BasicEscrow abi > abi/BasicEscrow.json
echo "wrote abi/BasicEscrow.json"
