# Security findings, repairs and evidence limits

## Review scope

This run independently reviewed changed core, Solana, browser/ERC-20, QR and
historical tooling source, checked branch content/ancestry, ran affected and
combined tests, and inspected actual hosted logs. It is an engineering review by
independent native workers, not a professional third-party security certification.
The full source baseline is main `91ee699…`; exact branch evidence is in
[TEST-RESULTS.md](TEST-RESULTS.md) and [BRANCH-INVENTORY.json](BRANCH-INVENTORY.json).

## Confirmed findings and repaired defects

| ID | Severity / exploitability | Finding | Resolution and status |
| --- | --- | --- | --- |
| CONS-01 | Availability / correctness; local browser, no unauthorized send demonstrated | Duplicate React sibling keys produced duplicate localnet profile UI and failed real browser selectors | Distinct namespaced keys. Repaired #168, incorporated via #170; hosted browser passed |
| CONS-02 | Boundary correctness; Worker wallet requests | AbortSignal/control state crossed the structured-clone wallet boundary | Explicit EIP-1193 `{method, params}` projection plus fixture assertion; incorporated via #170 |
| CONS-03 | Low; malicious invalid library grouping size can prevent termination | QR `groupForDisplay` lacked positive safe-integer bounds | #171 has regression-first fix and all required CI; remains unmerged pending D8 Tier B automated review |
| CONS-04 | Low; hostile JavaScript array descriptor trap escapes typed refusal | Canonical JSON array descriptor access could throw outside `JcsError` | #172 normalizes that trap; RED/GREEN and required CI pass; required automated review absent |
| CONS-05 | Low; inert developer-package input boundary | Changing Proxy array length admitted 40 preconditions despite a 32-element limit | #174 captures validated own-data length and exact key count; new regression failed before repair and focused suite passes |
| CONS-06 | Evidence integrity; sequential local lab use | Flat lab output overwrote a previous run's recipe/logs/results | Historical #28 fix ported into #174: private per-run directory, exclusive writes, retained failed evidence; two regressions pass |
| CONS-07 | Integration evidence correctness | #154 owned-document hashes and temporary target fixtures were stale after source integration | Strict regeneration and bounded fixture target discovery; validator not relaxed; #174 review/CI pending |

No new confirmed High/Medium product exploit was established in the reviewed
qualified stack. That statement is limited to this review and is not a proof of
absence. The two low QR issues remain present in main until their required review
gate is satisfied.

## Dependency audit changed during this run

The earlier [Picomatch assessment](../execution/PICOMATCH-ADVISORY-ASSESSMENT-2026-11-18.md)
accurately preserves its original observation of five propagated high findings
from one advisory and a bounded expensive-pattern reproduction. A fresh root
`npm audit --json` and `npm audit --omit=dev --json` now both return **zero findings**
against the unchanged lockfile. The configured registry was confirmed to be
`https://registry.npmjs.org/`; installed/latest Picomatch remains `4.0.7`.

The primary [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
now explicitly records withdrawal on November 18, 2026. The referenced
[maintainer discussion](https://github.com/micromatch/picomatch/pull/235)
disputes classifying arbitrary untrusted glob patterns as a package vulnerability.
The scanner result changed through advisory withdrawal, not through a local patch,
dependency downgrade, excluded audit or fabricated fixed version. The historical
slow-pattern behavior is not erased. Repository-controlled build patterns and
separation from the emitted runtime remain the relevant exposure controls.

This closes the **current scanner finding** for the root dependency graph; it does
not constitute a whole-project vulnerability-free claim, an audit of every
separately locked experimental package or a replacement for supply-chain review.

## Observations that are not confirmed vulnerabilities

- Wrong-chain cancellation in the expanded browser test leaves a durable prepared
  intent because canonical validation cannot persist cancellation. After correct
  reconnect it is conservatively held until the configured 12-block preparation
  lease. #173 now asserts block 11 hold and block 12 recovery without sign/send.
  This is an availability/UX constraint, not evidence of unauthorized funds movement.
- One controller invocation timed out at its second negotiation; an unchanged
  retry passed. Root cause is unconfirmed. The failure remains in evidence.
- A typecheck process exited 137 while heavy workers ran in parallel; the same
  source passed serialized. No TypeScript diagnostic was suppressed.
- Local Chromium cannot establish its initial Unix-domain sockets under the
  workspace sandbox. Actual hosted Chromium is required; a local build or syntax
  check is not substituted for that acceptance result.
- #142's line-membership retirement helper cannot prove complete incorporation.
  It was not run against branches; no deletion or unsafe closure resulted.

## Preserved security invariants

External wallets retain keys and economic signing; restored encrypted records do
not grant transaction authority. Exact terms, account, chain, contract/program,
asset/mint and original-deployment binding remain. D9 write-before-send markers,
nonce holds, uncertain-broadcast status and CAS/lock checks remain fail-closed.
Finite token approval, explicit per-action review and manual fiat confirmation
remain. Default/static artifacts retain `ReleaseEnabled=0` and no production trust.

The accepted D1 carrier can reverify an existing bilateral binding after restart;
it has no renewal nonce. Any feature claiming cryptographically fresh peer consent
after restart needs a separately reviewed protocol extension. Physical wallets,
real relay interoperability, Solana browser composition, public-testnet recovery,
independent security signoff and release trust are still outstanding gates.
