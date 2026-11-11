# Explicit broker invalidation review

Root independently reviewed the two-file G05 primitive authored by
audit_domain_transport. `invalidate()` uses the existing guarded transition to
revoke current scopes and notify observers without changing the selected mode.
Closed or reentrant changes return the existing fixed `POLICY_BLOCKED` value.
Inspection deadlines and timer/permit logic are unchanged from reviewed T33.

All 30 broker cases passed in the root's 66-case focused integration run, including
the new native permit/reentry/closed test and existing earliest-deadline and
display-expiry isolation regressions. This review covers only the broker
primitive. The separate T55 orchestrator, dispatcher and native observer repairs
remain under branch_inventory's independent review.

| Path | SHA-256 |
| --- | --- |
| packages/transport/src/policy.ts | 76afd8050a7e32d9a70713c0c42ef3df8c2ea775e562cfd9ab88a11e8d429eb6 |
| packages/transport/test/policy.test.mjs | f915d27e10a90bf01f2805607350bd66bcdaf471f87656b1a323d8053538c5a7 |

The immutable source commit permits refreshing the existing strict wiki evidence
binding. No hash check, release approval, route requirement or trading gate is
waived by that refresh.
