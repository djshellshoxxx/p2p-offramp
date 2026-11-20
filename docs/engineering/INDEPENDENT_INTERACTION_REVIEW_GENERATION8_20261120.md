# Independent generation 8 interaction and integration review

Date: November 20, 2026 UTC.

## Verdict and exact source

**No new reproducible product defect in the reviewed interaction scope.** The serial affected run passed **45/45** tests, including five new recovery-export continuation probes. No production source, package command, workflow, financial assertion, release policy or coordinator state was changed by this reviewer.

| Reference | Exact identity |
| --- | --- |
| Published PR #205 core input | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Consolidated source reviewed | `b67bd81e74b0f58338dc15bc694cd3a22b724cd4` |
| Consolidated source tree | `f2476312544b27fc5d8c44dcc16a30857e4e7381` |
| New test commit | `62d415121ad7c627c8684d4cd510b44c2b7bbaa1` |
| Tested tree including the new test | `30313fdb9fdfe48c55dccdb895c3b1456783e17d` |

The own worktree is `/workspace/scratch/6eace968c0df/p2p-bug-hunt-g8`, branch `codex/p2p-bug-hunt-g8-20261120`. It was created at the exact consolidated source. Physical pinned dependencies were copied only after verifying lockfile equality. The reviewer read the coordination handoff/state, generation 6 bug hunt, generation 7 navigation review and generation 5 independent composition review. No repository `AGENTS.md` was found in the searched worktree paths.

This report is an additional documentation-only commit after the tested tree. There was no remote mutation, deployment, browser launch, release or funded operation.

## Interaction review

The source review followed `App.tsx`, `OfflineRoot.tsx`, the trade draft and review controllers, `TradeDraftPanel.tsx`, `TradePages.tsx`, `RecoveryReferencesPanel.tsx` and their profile-selection interfaces. It checked the following ownership relationships:

- Draft fields and review consent remain tied to the current draft generation. Applying stored defaults replaces only the seven permitted fields, clears private parties/instructions/windows and removes the owned earlier review. It does not create a persisted review or transaction authority.
- Favorite opening still requires a completed fresh saved-review load and current registry review. The added route check does not bypass the existing saved-record identity check. A stale cached review remains insufficient to authorize a route.
- Profile selection retirement clears the review controller and draft controller through the existing subscriptions/layout synchronization. The integrated navigation handlers preserve the generation and mount checks introduced by the reviewed fixes.
- Recovery exports retain explicit item selection and consent, the exact preview buffer, the selected-profile scope, and a fresh revision-pinned read before download. Preview identity, profile scope and request sequence are checked after the await. Unmount clears the retained byte buffer and aborts a pending request.

Generation 5 already executed the reciprocal favorites/templates stale-revision probes and encrypted backup restore of both preferences. Those probes were read as historical evidence and were **not re-created or counted again**. The draft/review controllers and native preference/runtime authority code are byte-identical to the published PR #205 input in this consolidation.

## New coverage

`apps/web/test/recovery-references-ui-lifecycle.test.mjs` executes the maintained recovery panel's TSX handlers after the existing Vite/Oxc transform, using dependency-aware render hooks and a controlled facade reply. Its fixture is admitted by the real recovery-reference schema, and the downloaded positive case is parsed by the real recovery-export schema.

| Probe | Observed result |
| --- | --- |
| Explicit current export | One download, exactly equal to the selected preview bytes, after the expected offset/revision recheck; export remains an unverified reference. |
| Profile replacement before the next render | A held successful recheck cannot download the previous profile's preview, even when the returned reference content is identical. The next render clears the retained byte buffer and preview. |
| Lock before the next render | The held reply cannot download, and private preview bytes are cleared when the retired scope is rendered. |
| Unmount during recheck | Pending request is aborted and private preview bytes are zeroed before a late reply can complete; no download occurs. |
| Durable revision conflict | No download or automatic retry occurs; the preview is cleared and the failure is rendered. |

The profile/lock cases deliberately change the facade scope before rendering the component again. This checks the continuation's live scope guard independently of later UI cleanup. Returning identical reference content also prevents the page-equality check from masking a missing scope guard.

These are GREEN-on-existing-source probes, not a newly discovered defect or a RED/GREEN repair. During probe authoring, two draft assertions incorrectly required a request already completed and detached in `finally` to be aborted by later layout cleanup. Those assertions were removed; the contract is suppression of the download and retirement of private bytes. No production change was needed.

## Integration and gate preservation

Independent Git comparisons against PR #205 established the following:

| Surface | Result |
| --- | --- |
| Consolidated change set | Exactly 17 changed paths, comprising five production paths plus their tests/reports. |
| Production file provenance | Every changed production file is byte-identical to its reviewed input listed below. |
| npm interface | All 56 commands, all other `package.json` metadata, and `package-lock.json` are byte-identical. |
| Hosted workflows | All six workflow files are byte-identical, including financial job budgets and browser gates. |
| Native financial source/gates | All 65 contract entries, including the Foundry gitlink, and nine selected EVM/Solana financial scripts are unchanged. This is preservation evidence, not execution of those financial gates. |
| Default/runtime authority | Main entry, OfflineRoot, AppServices, Worker endpoint, runtime schema, Vite/build configuration, both trade controllers, recovery panel and distribution staging source are unchanged. |
| Release defaults | AppServices still starts with `ReleaseEnabled: 0` and empty connect origins; runtime schema still rejects any nonzero release flag. The default OfflineRoot still uses `noApprovedRegistry`. |
| Separate optional modules | The nine optional package subtrees are absent from both compared core trees. This review does not qualify the coordinator's separate optional composition. |

| Production path | Reviewed input whose bytes are retained |
| --- | --- |
| `apps/web/src/ui/trade/TradeDraftPanel.tsx` | `7517fe457ac8110e5e21b2944074f3c84317d554` |
| `apps/web/src/ui/trade/TradePages.tsx` | `7517fe457ac8110e5e21b2944074f3c84317d554` |
| `packages/chain-solana/src/submit.ts` | `dde7345e1ee2e722344d6f27dd8bd952c285d520` |
| `packages/security/src/release-update-store.ts` | `8a7e5e539cd33e398daa987ddc7c5256bac8be8f` |
| `scripts/portal/build.mjs` | `4966938d1f5803048c55f7d698b3ad76f9be4ec0` |

The IndexedDB cancellation and Solana reconciliation algorithms belong to the other generation 8 reviewers. Their byte provenance was checked here; their substantive correctness is not a conclusion of this interaction review.

## Executed validation

The final serial run passed **45/45**, with zero failures, cancellations, skips or todo, in 5,350.348914 ms on Node 24.22.3. It comprises five new recovery lifecycle checks, fifteen existing UI navigation checks, two real draft-navigation contract checks, thirteen template-controller checks, eight favorites-controller checks and two independent favorite reopening checks.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  apps/web/test/recovery-references-ui-lifecycle.test.mjs \
  apps/web/test/trade-ui-navigation-lifecycle.test.mjs \
  apps/web/test/trade-draft-navigation-contract.test.mjs \
  apps/web/test/trade-templates-controller.test.mjs \
  apps/web/test/saved-review-favorites-controller.test.mjs \
  apps/web/test/saved-review-favorites-independent.test.mjs
```

`git diff --check` passed before the test commit. The repository's existing `npm test` glob already discovers the new file; no command or workflow addition was necessary.

| Evidence | SHA-256 |
| --- | --- |
| `verification-bug-g8/affected.log` | `b1f1bca068aeb48b4dcefcd6340fb62ceb6c0ac2f43c184fa782c6441df3386e` |
| `verification-bug-g8/preservation.json` | `0391b3aec05788736f6e1baf3207d08ea3c228dbfc8b122e5783f6776b3279cc` |
| New maintained test source | `e1e0100367d8ae09f69667273da4920b76b89566f346f50be118c6abd6ca3dbc` |

The execution evidence directory is `/workspace/scratch/6eace968c0df/verification-bug-g8`. These are local file digests, not signatures or hosted-result claims.

## Limitations and successor handoff

The new tests exercise maintained component handlers with controlled render hooks. They do not implement a browser DOM, React scheduler, native Worker isolation, download manager, IndexedDB persistence or focus/layout qualification. Existing controller tests additionally execute their maintained registry/builder/controller code where specified by those fixtures. No full repository, type, build, browser or financial gate was run by this worker; the coordinator owns those checks on the final composition.

A useful fresh successor target is the **exact final published core head's browser journeys** for favorites, template draft replacement and recovery export retirement, with actual route/profile changes during held replies. The successor should bind its result to that source and inspect outstanding hosted browser/financial gates. Repeating unchanged generation 5 CAS probes or these now-covered handler interleavings would not address that remaining qualification. The local browser restriction remains unresolved here; no managed-environment bypass was attempted.
