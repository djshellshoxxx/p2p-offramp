#!/usr/bin/env bash
# Phase 1 of docs/consolidation/2026-11-18-branch-consolidation-gameplan.md.
# For each branch: verify the remote tip still equals the pinned SHA, push an
# archive/<branch> tag at that SHA, then delete the remote branch.
# A branch whose tip moved is skipped, so someone's new work is never deleted.
# Safe to rerun. Requires: git and push rights to origin.
# Usage: bash scripts/consolidation/phase1-archive-and-prune.sh [--dry-run]
set -euo pipefail
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
REMOTE=origin
git rev-parse --git-dir >/dev/null
git fetch --prune --tags -q "$REMOTE"
ok=0; skip=0; gone=0
while read -r branch sha; do
  [ -z "$branch" ] && continue
  cur=$(git ls-remote --heads "$REMOTE" "refs/heads/$branch" | cut -f1)
  if [ -z "$cur" ]; then gone=$((gone+1)); continue; fi
  if [ "$cur" != "$sha" ]; then echo "SKIP moved: $branch ($cur != $sha)"; skip=$((skip+1)); continue; fi
  if [ $DRY = 1 ]; then echo "would archive+delete $branch @ ${sha:0:9}"; ok=$((ok+1)); continue; fi
  git push -q "$REMOTE" "$sha:refs/tags/archive/$branch"
  git ls-remote --tags "$REMOTE" "refs/tags/archive/$branch" | grep -q "^$sha" \
    || { echo "FAIL tag not verified: $branch"; exit 1; }
  # The lease makes the delete fail if the branch moved after the check above.
  git push -q --force-with-lease="refs/heads/$branch:$sha" "$REMOTE" ":refs/heads/$branch"
  echo "archived+deleted $branch"; ok=$((ok+1))
done <<'LIST'
autonomous/completion-20261031 b3519180eb56c9913a8568a3ac878fa94a7eca19
autonomous/continuation-20261031 320fc4bcc90069cf1d8c869af78caf63efe5b9ea
autonomous/guidance-20261101 c8494b05e36cda43ac3f73e0feab831cfa00647d
autonomous/journey-20261101 3947074c95fa1e0facd65a8947a2c7e70363c708
chatgpt/zero-codex/acceptance-cli-input-bounds-20261110 2ba1a4e18f4673f006b195e822b5f984effb48e8
chatgpt/zero-codex/acceptance-review-boolean-20261110 08a9cf1e9abc0fb703b14964062a3da2234fdbb6
chatgpt/zero-codex/d9-cross-deployment-nonce-20261111 c153a99dd5c876c23bdb115f7037a4bf63cb57d4
chatgpt/zero-codex/docs-static-offers-status-20261116 30efa0e158c6b50525c8e0dced494faa9f54eb08
chatgpt/zero-codex/g05-transport-path-binding-20261111 053056975ed0e6e7ff02345f0291ae7f71cb3eb9
chatgpt/zero-codex/g12-erc20-withdraw-binding-20261111 9786b221552fbbc12ea5d4fe644d1a3b45cd36a0
chatgpt/zero-codex/g12-native-withdraw-recipient-20261111 84bb67f6e438b26bd1d321995c427d6a86a58930
chatgpt/zero-codex/g16-bilateral-replay-20261111 969d02aecf86c6be18dde509b5cf0016345b0fe4
chatgpt/zero-codex/g18-final-chain-recheck-20261111 921f067769188f53c2d379f035695a40ae978083
chatgpt/zero-codex/g18-receipt-own-data-20261111 c16e7617f0c5d165902ec15c67591a230d947fd2
chatgpt/zero-codex/g20-chat-scope-regression-20261111 a5c74990f0f5e9162a23450db5e9af00f37d88e8
chatgpt/zero-codex/g25-public-endpoint-regression-20261110 e0a9033158d1ae874c78de7f25d0be0aa3a13157
chatgpt/zero-codex/g26-clear-reentrancy-20261111 548495515c83fc1389837f00eb0468758cd232fd
chatgpt/zero-codex/http-buffer-lifecycle-20261110 5f2381ab42c27984dbb1cc872468dd3e09771690
chatgpt/zero-codex/recovery-reference-identity-20261115 85849f7b267dddceffc35ef5253da4a23ef9be05
chatgpt/zero-codex/registry-concurrency-20261110 a213166ea83a0c5ec0768f693ff583413e8e976b
claude/adoring-wozniak-850ue6 81c2dc889fa2a66eec2259ce3a911132386d1aa1
claude/docs-screenshots c1e31918ed5e4e370e7217a6a654ea360c71f4b4
claude/loving-einstein-xgzvdy-s00-ci-triggers a88560741e60146a424cc18fcb2cc1043756ae3e
claude/loving-einstein-xgzvdy-s01-tooling 4e319013ea61ead31ae00ea9a44fa9c431cc84ce
claude/loving-einstein-xgzvdy-s02-core-contracts-storage 01344cbd6655f509f3e2e3903333cdb579228d37
claude/loving-einstein-xgzvdy-s03-core-messaging 5a747ded358ee9fcca393bb4a0616fd4e8632296
claude/loving-einstein-xgzvdy-s04-wallet-release 4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2
claude/loving-einstein-xgzvdy-s05-web-locale-leaf 72bdf9f521db5ed99acc7e19ae13fe3f65ab5bce
claude/loving-einstein-xgzvdy-s06-web-runtime-ui 14be5a1c1ec69d91b0affe8a87811c681269fb6c
claude/loving-einstein-xgzvdy-s07-native-journey 8f0e5e245ee8c63c749e8af97fdb9d309e95b8d7
claude/loving-einstein-xgzvdy-s08-portal-lab-docs c950dad4b387cb4b33910789c454eb8f2ab0ae81
claude/loving-einstein-xgzvdy-s09-intake 389c0ea69e24615d0f1d7595942514300cd855f9
claude/loving-einstein-xgzvdy-s10-optional-packages c696c02b94eb6b90da2ed76f93c383fcd8a7f703
claude/loving-einstein-xgzvdy-s11-governance-ci 789b2b2c2644af741daa5328adf76ac2ec88599c
claude/loving-einstein-xgzvdy-s12-evidence 001c31cc868b683080e79a025b6621d900acb96a
claude/p2p-offramp-integration-aan57u 48074e750cf64fefc3df6b0a7997e40a4c8fcb31
claude/post-merge-followups ec65012dbb94189180d3da52de2619cc22fe0482
claude/recovery-consolidation 7586b5fd0a9daa0ec7f0b610a3a6de25442a6a25
claude/sweet-noether-arf6ne 391653eaba946f77057b01fd03d3c234958bcf1d
claude/sweet-shannon-grykla 7165626c17d8afb7ad7fce461ae7df9cbfcdba07
claude/tender-goodall-db3cot 8783636e7a1739b5e884cec62fbecf9c77a0ceaf
claude/trade-review-integration 1450c537deadf2abbb56ebf18f2bbd5e71bad62d
codex/consolidation-ledger-20261104 d5b959b5ed732ab3e6f7adfd37e872a841470225
consolidation/qualified-regressions-20261116 f2375dba1b249912ac434ed9da3998e4cb0a40f0
docs/lean-release-handoff-2026-10-24 474f0505a409b7ba6f31ea5fc55618e280661c8f
docs/security-spec-expansion-20261021 0ea82ded188ed7392622616f28a1cf33c87c2ed8
docs/spec-readiness-and-foundations 6b6004bdf35b7aea14530f965756ca6d54336682
feat/custodial-ledger-foundation 52e6987e77d9ef6bc403c0129b3f52531986ade8
fix/remediation-09f20d73-9524c0 9f5201dd44a85fa90841d9a2882752b41db9360e
fix/remediation-f84468d6-0a97ed dba5072d7a67f67e223432c48aefabc07f31f005
integration/all-compatible-work dce515996f3e7b965a4cf3576b6da509c14a73e1
research/code-reuse-2026-11-03 5fec2c6db018868a49c8ce40c21e186cdf702417
research/remaining-gaps-20261103 922a391e429d07b0840bbbe525b3a10c6d3c830c
research/security-addendum-20261103 3a523a11a87d85443c484b6a4d4284b96c5f0b41
research/upstream-reuse-20261103 977b36654bab2d00ca20c6139398b60c693bab73
work/noncustodial-reconstruction-2026-10-24 bc996aac828ce63856193c9114edfef480153325
work/p2p-client-shell-2026-10-24 8a88d11d8e419cd402b28428947e8fe4fbcfe893
work/p2p-consolidated-20261030 68fb46920431e3311c78f931432bc4a21d066c17
work/p2p-exchange-close-20261030 2d3135b646bf99f63935287a082856ea7fe6b74d
work/p2p-exchange-test-repair-20261030 adfbec52f964d9b07c571b8924d31fa03d54e03a
work/p2p-gate-reconciliation-20261030 e762e649600493221e3bd10f0c3525858722bc94
work/p2p-independent-branch-review-20261030 9f80c9b27b943b30409710dea76a53d97a761832
work/p2p-pr14-finish-handoff-20261030 8c8911e2dd3c7af4d515e645a6501eedc6178111
work/p2p-relay-lifetime-20261030 e0961edc8cb64b466a2a3193aa37158bfc8c3487
work/p2p-validation-20261030 11ce9e42bea9e5f27e303ee6db66e463d38ebdda
LIST
echo "done: $ok processed, $skip skipped (moved), $gone already gone"
