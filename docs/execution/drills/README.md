# Synthetic local incident preparation

These four records are bounded local preparations for G26's bad-release,
endpoint, signing-root and lost-origin scenarios. They are not real incidents,
IncidentRecords, signed advisories, complete operational drills or release
acceptance. No incident ID, contact address, human reviewer, deployed release,
victim or actual compromise is invented. A stable scenario label is not a random
G26 incident identifier. Trading stays disabled.

[local-drills.json](local-drills.json) records exact observed source hashes,
commands, actual outcomes, retained failed/missing steps, residual risks and next
actions. [local-checks.tap](local-checks.tap) is the actual thirteen-case selected
Node test output. Tests exercise existing verification/read/recovery/diagnostics
APIs with synthetic inputs; they make no external request and initiate no wallet
send. There is no new evaluator, incident service, signing protocol or attack tool.
The outer [assurance manifest](../assurance/evidence-manifest.json) binds these
files and all thirty defensive mappings without a circular self-hash.

The selected cases observed signature/asset/rollback refusal, untrusted adjacent
key refusal, mismatched native identity/anchors and stale-state veto, secret-free
diagnostic export and locked clear, revocation, imported-review refusal, evidence
invalidation and original fixed-beneficiary unsigned recovery preparation.
A rejected replacement key does not detect compromise of an already trusted key.
No out-of-band root re-bootstrap or trust rotation is implemented by this drill.

Lost-origin preparation reuses the independently recorded T49 actual Chromium
two-origin migration result: its three fixture files, twelve declared dependencies,
five observed transitive dependencies and three retained local evidence files
were checked against their recorded SHA256. It proved distinct origin storage,
source complete-file authentication, fresh destination keys and re-verification,
with zero wallet calls or external requests. This is recovery/migration evidence,
not a newly simulated outage, deleted-origin drill or production trust bootstrap.
Its synthetic release provenance placeholders and original limitations remain.
The browser/native chain suite was not rerun merely to relabel old evidence.

Keep observed facts separate from hypotheses. A full actual exercise still needs
an authentic original deployment and maintained trust policy, exact affected
release digests, a separately verified contact/owner/reviewer, real containment
advisory at a higher sequence, out-of-band root recovery when relevant, retained
independently distributed recovery bundle/static-IPFS availability and measured
recovery observations. Original immutable funded exits must remain usable even
when a later frontend release expires. Maintainers cannot reverse settlement or
promise compensation, liveness or fiat loss recovery.

For resumption, use the existing G26 checklist, G25 recovery package and G24
evaluator/CLI. Root owns the final combined source and aggregate checks. Recheck
changed source/dependency/recipe scope before reusing any receipt. Names or
`passed`/`closed` metadata cannot authenticate independent review; full scenarios
remain pending. No messages, signatures, publication or endpoint changes occur
as part of this packet.
