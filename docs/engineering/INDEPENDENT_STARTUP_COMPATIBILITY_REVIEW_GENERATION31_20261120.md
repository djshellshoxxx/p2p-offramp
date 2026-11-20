# Independent review — generation 31 startup compatibility

## Conclusion and exact scope

**No actionable Standards or Specification findings were established in this
bounded integration.** The frozen ordinary offline root now uses the maintained
startup presence probe and initialization guard, and App renders the maintained
compatibility notice after startup settles. Missing required APIs prevent
service initialization. Optional APIs remain optional, actual runtime refusal
remains authoritative, and presence does not become device or wallet support.

| Identity | Value |
| --- | --- |
| Baseline, G30 combined source | `3bfb7761b6ec430c8e437d117ec31007503f0d12` |
| Reviewed author source | `9c9b16b7e96737115f5fc61bddf8c31e277dd6f4` |
| Reviewed complete tree | `9eb643f1871e2e257cfdb37e3cfe6c95e46e86bd` |
| Author evidence | `faf70e3afadbeadd27106139ef2a5e3adf9197fb` |
| Author evidence complete tree | `1a7030517f06cbdfba0be5aa87a1c2b2e3c9577e` |

The independent review branch starts at the exact reviewed source. This record
adds documentation and evidence only. It does not claim a later coordinator
composition, publication, hosted acceptance or a main merge.

The [cross-device specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.2_cross_device/spec-responsive-mobile-wallet-and-browser-compatibility.md)
requires a local startup probe and unsupported/read-only mode when required APIs
are absent. Source inspection established that the helpers and notice existed
but lacked this ordinary application consumer. The bounded change addresses
that integration gap without claiming the wider mobile and wallet specification
is complete.

## Source review

The exact delta has four paths: two modified production files, one modified
adjacent fixture and one new composition test. Of 2,911 baseline Git entries,
2,908 remain exact; three existing entries change and one is added. The reviewed
tree has 2,912 entries, including 1,029 non-documentation entries, with no removal.

`OfflineRoot.tsx` captures the real `probeStartupCapabilities()` result in lazy
state, so rerenders and the controlled effect replay retain one snapshot. The
existing initializer is called through `startWithRequiredApis`. The same stable
snapshot is the startup effect dependency and is forwarded to App. The original
service ownership, pagehide, disposal and late-result handling remain intact.
The existing generic app-link value is still forwarded unchanged.

`ui/App.tsx` accepts the optional snapshot, defaulting to no snapshot for existing
compositions. It renders the existing notice only after startup finishes. The
notice distinguishes missing/unavailable required APIs from actual startup
failure and continues to resolve the selected catalog during render. Normal
successful startup adds no compatibility warning or certification claim.

Independent Git readback verified that the probe, guard, compatibility model,
notice, main entry and its native EVM/Solana branches, generic sharing helper
and leaf, Pages, locale catalog, packages and lockfile retain their exact
baseline identities. All other entries outside the four-path delta are exact.

The existing sharing fixture adds only a labeled inert startup probe because
that fixture already controls startup and does not run effects. Every original
sharing assertion remains intact. The new startup fixture executes the actual
root, App, probe, guard, notice and locale code; it supplies real fixture-global
property observations rather than an injected capability snapshot. Its separate
descriptor-preserving browser object correctly distinguishes missing values
from throwing/unavailable getters under Node's VM behavior.

## Independent execution and failure attribution

| Captured command or evidence | Actual outcome |
| --- | --- |
| Exact source and protected-entry check | Passed; complete `8e836…source` whitespace passed |
| Initial mixed maintained/reviewer selection | 54 reported tests: 53 maintained cases passed; one reviewer module-load failure before its four probes registered |
| UI TypeScript project | Passed on the clean frozen source |
| Reviewer probes after virtual-entry correction | Four fixture failures before root rendering because the VM omitted standard text codec globals |
| Corrected independent root probes | 4/4 passed; zero failures, skips, cancellations or todos |
| Author artifact readback after checker correction | All 45 indexed artifacts, 12 ordinary build assets and 136 graph references verified |

The 53 maintained passing cases comprise 23 new startup composition cases, six
existing probe cases, five startup guard/notice cases, nine sharing composition
cases and ten shell locale cases. They passed within the initial mixed command;
that command's overall exit was 1 because the separately authored reviewer
module could not load. The maintained cases were not repeated after the reviewer
fixture repairs. The later four-case command passed independently. This is not
a claim that one 57-case command or the complete suite ran successfully here.

The first reviewer fixture used a null-prefixed library entry that Vite rejected
before plugin resolution. Its correction uses an ordinary synthetic entry path
resolved to a virtual module by the plugin. The next run loaded the module but
stopped all four cases before root rendering because its VM omitted
`TextEncoder` and `TextDecoder`, which the maintained schema module expects.
Adding those standard fixture globals fixed that setup. Neither correction
changed production, maintained tests or behavioral assertions. Both unsuccessful
outputs and both exact pre-correction scripts are retained with raw and compressed
hashes; they are reviewer harness evidence, not product regressions.

The four independent probes execute the maintained OfflineRoot, presence probe,
guard, fixed schema failure and generic URL helper. Their App child is explicitly
inert, while React scheduling and eventual startup results are controlled. They
check a stable read-only snapshot across changed API presence and a fresh mount;
throwing optional getters alongside an authoritative storage refusal; a newer
startup succeeding before the retired older startup returns; and a final
pagehide followed by late success. The last two cases count state-setter attempts
after retirement, verify disposal of the correct owned service and suppress
stale service publication. API operation traps remain unused. Controlled effect
replay is not a native React or browser execution claim.

The maintained composition additionally exercises every required API as missing
and unavailable, optional denial, actual refused/thrown initialization, live
locale guidance, unchanged app-link propagation and persisted/nonpersisted
pagehide handling. The probe performs property inspection, not Worker
construction, storage opening, file I/O, permissions, clipboard writes, sharing,
camera capture or network activity. Its snapshot remains untested, uncertified,
with unverified storage and no economic-action permission.

## Author evidence and ordinary artifact readback

The independent checker verified author evidence ancestry and all 47 docs-only
changed paths. It rehashed and decompressed all 45 indexed retained artifacts,
including all 11 original command outputs, source patches, command receipts and
the separate final whitespace evidence. The final baseline receipt binds the
corrected 23-case fixture to the frozen test bytes while both production files
match original G30 bytes: four lifecycle controls pass and 19 missing-integration
assertions fail. Frozen checks 07–11 have empty patches and exact source hashes.

The author's failed wired fixture runs (21 pass / 11 fail, then 26 pass / 6 fail),
minimal VM diagnostic and corrected 32/32 result remain retained with their
actual causes. The final author adjacent selection is 77/77, including all new
cases; UI TypeScript, boundaries and 58/58 build policy pass. These are author
results independently read back, and overlap this review's maintained selection.
They are not additional full-suite tests.

All 12 actual ordinary assets, totaling 817,257 bytes, match the author receipt.
All three retained graphs match the emitted files, and their 136 module hashes
match either the frozen tracked Git blobs or the actual immutable dependency
bytes. Document/vault-Worker/QR membership is 102/30/4. All four compatibility
modules are present in the document graph and absent from the vault Worker graph.
The vault Worker remains `assets/vault.worker-yOnLqpF_.js`, SHA-256
`d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`.
`ReleaseEnabled` remains zero; signed release and release acceptance remain false.

The first graph-readback script incorrectly attempted `git show` for ignored
`node_modules` files. The corrected checker hashes those actual author/reviewer
dependency files directly, verifies equal bytes, and retains Git-blob binding
for tracked modules. Its original script and unsuccessful output are preserved.
That evidence-checker correction did not change or skip a module hash assertion.
This readback is not a second build, browser run or proof of native reachability.

## Retained evidence and integration limits

The [machine review receipt](startup-compatibility-independent-review-generation31.json)
records exact commands, times, source identities, source scope, protected blobs,
author artifact verification and every retained raw/compressed hash. The evidence
folder includes readable final scripts and the exact unsuccessful script versions.
Gzip output uses `mtime=0` and preserves complete logs, including failed runs.

Dependencies were prepared as an immutable physical hardlink copy of the existing
G30 directory. Sample device/inode and content checks are retained. No package
installation, dependency mutation or cross-worktree import symlink occurred.

No full suite, native browser, real Worker/storage, physical-device or financial
journey ran in this reviewer worktree. The draft locale fixture does not qualify
a translation. Coordinator combined-source qualification and publication remain
subsequent work; a separate source-bound supplement must verify those results.

This standalone D8 Tier B integration still requires the accepted CodeRabbit or
Qodo pass with findings answered, applicable current-source/current-target checks,
and a guarded merge/readback. This independent review does not replace that named
review. No deployment, release, trust provisioning, wallet authority or optional
activation follows. Audit PRs184–186 and optional PRs224–232 retain their owners.
