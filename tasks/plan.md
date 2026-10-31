# Autonomous completion plan — 2026-10-31

Baseline: `eaa1fe5`; execution contract:
[single prompt](../docs/execution/AUTONOMOUS-NEXT-PROMPT-2026-10-31.md).
Tasks are tracked only in [todo.md](todo.md).

| Task | Single writer | Owned area | Dependencies |
| --- | --- | --- | --- |
| T1 | inventory_release | security release-locator source/tests/new browser fixture | existing G15 branded verifier |
| T2 | inventory_core | new messaging envelope/history/composition package and tests | existing G02 + NIP chat |
| T3 | extension_lifecycle | new extension registry package/tests | schemas/domain types only |
| T4 | native_preflight | canonical read-only preflight adapter/tests/native fixture | existing canonical ABI + G18 |
| T5 | inventory_ui | diagnostics model/store/Settings/tests | trusted release-context seam; default unconfigured |
| T6 | inventory_tools | acceptance-evidence evaluator/tests/report CLI | trusted review-policy seam; default blocked |
| T7 | inventory_ui, second slice | offline recovery-reference capability/UI | T5 + agreed bounded Worker protocol |
| T8 | root | shared facades/manifests/CI, current status/prompt/report | all frozen interfaces |
| T9 | extension_lifecycle | transport permit capture, canonical relay pool, matching fixtures/tests | discovered by final intake reassessment; exact existing G05/G21 URL contract |

Root owns `packages/security/index.ts`, `package.json`, CI and continuation docs.
Other new packages own their own facades. No agent edits another owner's files
without coordination. Review assignments rotate after implementations freeze.

T9 was admitted after final reassessment: canonical pool explicitly documented
that a broker permit bound only endpoint ID while its independently supplied URL
was not cross-checked. Complete that existing boundary before final integration;
do not fabricate a production routing issuer. Register fixture destinations
explicitly and retain physical socket drain/limits and unknown publication rules.

The larger delivery milestones remain separate: actual trust and deployment
qualification, professional review, live/device/routing evidence, Solana parity,
unspecified key rotation/deployment/archive profiles, and opt-in later protocols.
The current feature inventory and final report must distinguish these from local
implementation. Existing signed-manifest/identity/network defaults stay closed.

Checkpoints: focused owner tests and independent review per slice; final combined
tests/build/browser/native checks; exact-head hosted review; guarded merge and
post-merge tree/ancestry verification. User's explicit autonomous execution and
merge instruction authorizes these steps; no routine human checkpoint is needed.
