# Generation 21: vault-form notices follow the selected locale

## Result and exact scope

Unlock, create, unchecked backup export and fresh-key restore notices now follow
the selected compiled catalog when the parent rerenders. The forms retain
semantic message keys, fixed runtime error codes or the returned public restore
profile/count values, then resolve the existing wording during render.

This corrects a bounded F19 presentation gap. It adds no locale, translation,
approval or operation. The default compiled configuration remains English-only
and draft. Existing command, consent, cancellation, reconciliation, private-key,
storage and Worker behavior is unchanged.

| Checkpoint | Exact identity |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Regression-only commit | `293ffd4d47b58eb3e289d5fb36f2169239cd56f2` |
| Frozen implementation | `08acab8908fb9878e91aa2d87d652e8a245051e3` |
| Frozen source tree | `13f111937bf5f6fa01dc3db65afcd81a84fa91b0` |
| Author branch | `codex/vault-forms-locale-g21-20261120` |

Only two source/test paths differ from the base:

- `apps/web/src/ui/VaultForms.tsx`
- `apps/web/test/vault-forms-locale.test.mjs`

All **2,575 other base tree entries** retain identical mode, type and object ID.
The frozen source adds one test file, giving 2,577 entries against 2,576 in the
base. `App.tsx` and `BackupVerificationForm.tsx`, which have separate locale
work in the coordinator's composition, remain untouched here.

The regression and initial fixed/targeted/type checks ran on the exact working
trees subsequently frozen in the named commits. Build and policy checks ran
after the implementation commit. The regression test blob is identical across
the regression-only and fixed commits. Later commits on this author branch add
only this report, its machine-readable receipt and retained execution logs.

## Confirmed behavior and change

The original `Notice.text` retained a resolved string after an operation or
ordinary validation. Existing labels rerendered in the selected locale while
the notice remained in the previous one. This affected profile/consent/file and
passphrase validation, completed runtime refusals, an ordinary thrown error,
unchecked export success, restore success and explicit inventory-reconciliation
errors.

`Notice` now holds an existing catalog key, `RuntimeErrorCode`, or the returned
restored profile ID and record count. The shared `NoticeText` resolves that
representation with the existing live message view and fixed error mapper.
Its `alert`/`status` roles and error styling remain unchanged.

The explicit fixture tests cover both selection directions without reissuing
service calls, reading a file again or making another download. Restore profile
IDs remain exact; count values retain the existing catalog's count formatting
and pluralization, including one versus multiple records. The handoff still
opens the exact returned profile only when the user chooses it.

The tests also preserve the already-working behavior for a language change
during pending unlock/restore work and for canceled restore reconciliation.
A canceled late reply does not create a success notice or handoff, retry stays
disabled while the outcome is uncertain, and an explicit inventory recheck
remains necessary. These are ordinary controlled functional cases and do not
claim a financial or adversarial reproduction.

## Executed validation

Runtime: Node `v24.22.3`, with physical dependencies in the isolated worktree.

| Executed check | Actual result |
| --- | --- |
| New regression suite against the unchanged base form | **21 tests: 3 passed, 18 failed**, zero skips/cancellations/todos |
| Same suite after the correction | **21/21 passed**, zero failures/skips/cancellations/todos |
| Eight focused form, panel, facade, locale and routing suites | **68/68 passed**, zero failures/skips/cancellations/todos |
| Four TypeScript projects | Passed |
| Import boundaries | Passed: **241 production sources / 148 visited core entry modules** |
| Build-policy suite | **58/58 passed**, zero failures/skips/cancellations/todos |
| Default static build | Passed: **12 files / 794,416 bytes** |
| Documentation consistency | Passed; semantic approval and publication remain false |
| Whitespace and complete tree comparison | Passed |

These scopes overlap and their counts are not added together. The original
18 failures remain in the retained regression log; no original result is
rewritten as a pass.

The test fixture compiles the actual locale runtime, complete catalog and
message/error views with explicitly enabled synthetic draft copy. It executes
the maintained TSX form handlers and stateless notice renderer with controlled
hooks, facade responses and DOM download effects. It qualifies this Node
presentation contract; it is not actual browser, Worker persistence, crypto or
physical-device acceptance. Those existing gates are separate.

The default output contains **95 document / 30 vault Worker / 4 QR Worker**
graph modules, with no asset-update implementation module. `ReleaseEnabled=0`,
`releaseAcceptance=false`, empty connection origins and `connect-src 'none'`
remain. The source catalog and semantic evidence pins were not changed.

## Durable evidence and remaining qualification

[The machine-readable receipt](vault-forms-locale-generation21.json) records
exact commands, source identities, all eight retained log hashes and default
artifact hashes. Logs are under
`docs/execution/vault-forms-locale-generation21-20261120/`.

Fresh independent review and the final composed-source hosted gates remain
with the coordinator. No local browser or long native/browser suite was run.
No remote ref, dependency, workflow, trust setting, release, deployment or
funds operation was changed.
