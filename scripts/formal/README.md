# Canonical EVM formal/refinement evidence

This local pipeline imports the unchanged `contracts/evm/src/BasicEscrow.sol`; it does not supply a replacement escrow or alter a production ABI, compiler recipe, deployment gate or default application. It produces review evidence, never deployment approval. It is separate from the existing ordinary/fuzz/invariant tests.

The dedicated `formal/CanonicalRefinement.t.sol` contains a `CanonicalSMT` composition over the actual escrow and an isolated `CanonicalNativeWitness`. The native witness funds the real contract, releases to a rejecting recipient, observes terminal state plus pending credit, then permits an unrelated caller to withdraw only to that fixed recipient. Donation surplus is explicitly separate from deposited principal. Its refined accounting test passes. Its strict `Released => already paid` assertion deliberately fails with `STRICT_TERMINAL_ALREADY_PAID`; the runner requires this exact failure and complete matching native traces. This is a reproducible `MODEL_IMPLEMENTATION_GAP` between the strict abstract baseline and intended push-to-credit behavior, not a theft defect. Failed compilation, missing tests, a different revert or an ambiguous trace cannot count as the witness.

Native replay uses `FOUNDRY_TEST=formal` for this process only. Running the default Foundry suite does not discover these deliberately failing witness tests. The runner never labels native tests or existing fuzzing as a formal proof.

## Pinned public tool

The locally provisioned Z3 is selected explicitly by trusted `FORMAL_Z3_ROOT` and `FORMAL_Z3_ARTIFACT` paths. It is not installed globally or added to system paths. Official artifact metadata is `https://pypi.org/pypi/z3-solver/4.12.2.0/json`:

- Artifact: `z3_solver-4.12.2.0-py2.py3-none-manylinux2014_x86_64.whl`, 55,679,642 bytes.
- Official artifact SHA256: `03921d3021cb6e5dbeaeb94634132a5fbf5403748aa21774efac4047e633af1e`.
- Binary SHA256: `112132c9f82751e663f5a5573957c678f9af821aaf376d0c5863e4f076370444`.
- Linux runtime library SHA256: `5ba701bbb32fc0923ee98b4adb1b246f7ef60c30fa62065514d8099955678101`.
- Package METADATA SHA256: `eb8d327ac5b681c48a7a74ae3f920487c203d188755e950265f680ee0938e8f5`; it identifies the MIT license. This is recorded package evidence, not legal release clearance.
- Actual version: `Z3 version 4.12.2 - 64 bit`.

The official wheel digest was checked before installation. The runner checks wheel, binary, runtime library and metadata hashes plus the actual version before and after analysis. The pinned Foundry1.5.1/solc0.8.30 recipe is checked separately using existing tooling.

The pinned solc binary cannot load a built-in Horn solver. Instead its actual SMTChecker emits hashed standard-JSON SMT-LIB2 requests, the pinned Z3 executable evaluates them, and the actual compiler consumes the bound responses. Each query must match its compiler-provided Keccak identity. Exact query/response hashes, compiler input/output hashes and source spans are retained. Genuine safe and unsafe source probes must both succeed before canonical analysis can count as evidence.

**CHC/HORN polarity is not ordinary satisfiability polarity:** consistency `sat` can represent safety, while `unsat` can represent error reachability. The pipeline uses actual source-bound compiler diagnostics to classify assertions; it never calls raw `unsat` a proof. Unknown answers, stderr, unsupported features, missing diagnostics, crashes and deadlines cannot become proof success.

### How compiler diagnostics are classified

Classification fails closed by solc error code. Only one diagnostic decides a property: the single 6328 or 9576 diagnostic at the assertion's exact file and byte span, read in solc 0.8.30's exact wording:

- 9576 `CHC: Assertion violation check is safe!` means the compiler reported the target safe (`SAFE_UNDER_COMPILER_MODEL`).
- 6328 `CHC: Assertion violation happens here.` means the compiler reported a violation (`ASSERTION_VIOLATION`).
- 6328 `CHC: Assertion violation might happen here.` means the target is unanswered (`UNANSWERED`). solc uses the same code for both, so a 6328 is never a violation by code alone.
- Other wording at the span is `UNRECOGNIZED`. Two diagnostics at one span are `CONTRADICTORY`. No diagnostic at the span is `UNPROVED`. All three are `PROOF_UNKNOWN`.

Every other diagnostic in the compiler output blocks the property, which then stays `PROOF_UNKNOWN`. This covers the warnings in the recorded runs: the abstraction warnings 8364 `does not yet implement`, 7650 `does not yet support` and 7737 `Inline assembly may cause SMTChecker to produce spurious warnings` (all in OpenZeppelin `SafeERC20`), and 3996 `CHC analysis was not possible`, which solc emits while a query is unanswered. It equally covers 5084 `not yet fully supported` and any code this list does not name. The only exception is the recognized 6328/9576 result of another declared assertion in the same file (the whole-target model has three). The benign-code allowlist is deliberately empty: no solc diagnostic has been shown harmless next to a proof claim. A widened message pattern (`does not yet support/implement`, `not (yet) (fully) supported`, `spurious`, `not possible`, `might happen`, `timeout` and similar) also runs as a second net over every diagnostic, so a sibling's unanswered target or an abstraction note in a counterexample still blocks. Blocking diagnostics are listed in each property's `unsupported` field. `toolReported` still records what the target diagnostic said.

The probe, the whole target and the partitions all use one classifier with the same clean-work gate: at least one query, every answer `sat` or `unsat`, and clean compiler and solver runs with no stop reason. `COUNTEREXAMPLE_FOUND` additionally needs native replay before anyone calls it an implementation defect.

**Deviation from the extracted source.** This harness was extracted byte for byte from `faf245e` (`origin/claude/vibrant-cray-ny4gum`), with the follow-up `2cb0817` (`origin/claude/loving-einstein-xgzvdy`); the harness files at `d55c9f9` match the content hashes in the first run's report. Independent review then found that the extracted unsupported-feature check, the regex `/not (?:yet )?supported|unsupported|not implemented|abstraction/`, matched none of solc 0.8.30's real abstraction warnings. `showUnsupported: true` also suppresses the one summary warning it would have matched. So abstracted work was classified `PROVED_UNDER_DECLARED_MODEL`. The code-based classification above replaces that check. Smaller changes since `d55c9f9`: bridge stop reasons are now specific, the Z3 pin takes injectable paths, solc is re-hashed after analysis, solc and z3 run with a minimal environment, the bounded process runner no longer waits for a pipe held by an escaped descendant, both modes claim a new evidence directory, and the guard proof gained satisfiable controls. The unit tests use diagnostics copied verbatim from the recorded run.

## Narrow guard-logic proof

The runner separately compiles the unchanged canonical source to its actual compiler AST. It accepts only the exact storage alias, contiguous side-effect-free revert conditions and immediate canonical state assignment of release/refund; unknown AST forms, changed revert arguments, inserted side effects, changed enum values or a changed pinned canonical source fail closed. Every predicate carries its actual byte span and AST/source hashes. Four bounded QF_LIA queries cover release/refund disjointness, unauthorized release refusal, seller deadline coverage and exact-deadline refund admission over explicit EVM integer domains. UNSAT here means no violating predicate valuation; success is labeled only `PROVED_GUARD_LOGIC_ONLY`. Unlike the CHC consistency bridge, these are ordinary satisfiability queries. Two control queries run first, and each must come back `sat`: the release predicate and the refund predicate must each be satisfiable over the same domain. Otherwise the four obligations could hold vacuously, and all four stay `PROOF_UNKNOWN`. Only a clean answer counts: exit code 0, no stderr, no timeout or output limit. Modifiers, gas, actual execution, storage transitions, payout custody, bytecode and whole-contract correctness are excluded. Each exact query and response is retained; timeout or other answers stay unknown.

## Bounds, scope and remaining gaps

Each of the two compiler bridges allows at most 64 queries, 4 MiB per query, 32 MiB query text and eight compiler rounds (plus two guard controls and four guard queries; at most 134 queries overall). There are five seconds per solver query, 25 seconds per compiler invocation and a two-minute analysis/native budget. These are wall-clock limits, so a loaded host can turn any row of the results below into `PROOF_UNKNOWN`. Only the recorded `report.json` binds a run. Process output is bounded. Every invocation kills its owned process group on success, spawn error, timeout and output overflow, including unreferenced descendants with closed pipes. A descendant that leaves the process group (for example through `setsid`) is not killed. It cannot stall the runner, though: after exit, timeout or overflow the pipes get one second to drain, then the run ends with `PIPE_HELD_OPEN`, which counts as a tool failure. Every bridge exit other than a round that requests no further query names a stop reason and is incomplete. Standard input, output and diagnostics remain separate for the SMT bridge. Native gas/runtime assumptions, compiler abstractions, trusted known-contract calls, uint128 principal and fresh single-transaction actor scope are explicit in the property set. This does not establish arbitrary whole-contract interleavings, ERC20 behavior, Solana correctness, fiat receipt, network inclusion, hardware safety or external specialist review.

The full canonical SMT target currently can exceed the compiler's query-generation bound before emitting queries. That is recorded as `PROOF_UNKNOWN` with `COMPILER_TIMEOUT`, not a clean result. The strict payout-model gap also remains a promotion blocker until its active/pending/paid refinement is explicitly reviewed. New source, dependency, interface or artifact bytes invalidate prior evidence. Candidate models have a null `modelCommit` before integration and are bound by exact model/source hashes.

Run with Node child IPC capability (the sandbox may require loopback/network capability even though analysis itself makes no external request):

```sh
node --test scripts/tests/formal-evm.test.mjs
FORMAL_Z3_ROOT=/path/to/z3-package \
FORMAL_Z3_ARTIFACT=/path/to/pinned-wheel.whl \
FORMAL_FOUNDRY_ROOT=/path/to/foundry \
FOUNDRY_SOLC=/path/to/solc-0.8.30 \
node scripts/formal/evm.mjs .formal-evidence/run-1
```

`report.json` and the retained actual native trace, SMT inputs, queries, responses and diagnostics live in the chosen workspace output directory. A successful evidence run may legitimately report a model gap and unknown proofs. No generated packet is authority to advertise or deploy for real funds.

Tool locations are configuration, never evidence. They are pinned to different strengths:

- Z3: the wheel, binary, runtime library and METADATA are SHA-256 pinned, and the reported version and license are checked, both before and after analysis. The hashes after analysis must equal those taken before.
- solc: the shared Foundry check (`scripts/sepolia/lib.mjs`) checks its SHA-256 before analysis, and this runner re-hashes it afterwards.
- forge: there is no hash pin, only the pinned version and commit string from `forge --version`, checked by the shared library, which this harness does not change.

`FORMAL_FOUNDRY_ROOT` is optional; otherwise the existing Foundry `forge` on PATH is checked. `FOUNDRY_SOLC` uses the existing compiler override, falling back to `$HOME/.svm/0.8.30/solc-0.8.30`. Both Z3 paths are required; no managed-workspace tool directory is implicit. solc and z3 run with a fixed minimal environment, not the ambient one.

The optional positional CLI argument selects the evidence directory. The default is `.formal-evidence` (`.formal-partition-evidence` for `--partitions`) under the repository, and both defaults are git-ignored. The path must resolve inside the repository checkout and outside its git directory. Symlinks are resolved on the deepest existing ancestor, and the created directory is resolved again before the first write, so a link inside the checkout cannot lead writes outside it. Any other path stops with `FORMAL_OUTPUT_OUTSIDE_REPOSITORY` before anything is written. The directory must be new or empty. Each run writes an exclusive start marker before any tool runs (`run-started.json` or `tranche-started.json`), so a rerun into a used directory stops with `FORMAL_OUTPUT_IN_USE` and cannot leave a stale `report.json` beside newer partial files. Programmatic callers get the same checks. Other paths inside the checkout, including tracked directories, are accepted, so prefer the ignored defaults or a new subdirectory of them.

## Finite one-property partition investigation

`node scripts/formal/evm.mjs --partitions .formal-partition-evidence/run-1` selects only the closed `NativeConstructor`, `UnauthorizedRelease` and `EarlyRefund` targets in that order. It uses the same explicit tool roots and existing compiler/query bridge. Each file imports the unchanged canonical escrow and contains one original check function copied byte for byte. The funded cases retain the original `_terms` helper and both `FormalOutsider` methods, including every amount, actor and time condition. The runner checks the original model hash and exact whole partition text, and records original/partition assertion and fragment byte spans and hashes. No stronger precondition, replacement escrow, altered assertion or additional target is accepted.

This mode runs the existing safe/unsafe operational probe, then makes at most one attempt per target. The probe and all targets share at most 64 queries, 32 MiB query text and eight compiler rounds, with the unchanged 4 MiB query, 25-second compiler, five-second query, 120-second total, process-output and source limits. The output directory receives an exclusive start marker to prevent an accidental rerun in that directory. A finite investigation stops at these bounds; it does not raise a deadline or retry a target to obtain a proof.

Partition classification uses the same classifier and clean-work gate as the whole target (see "How compiler diagnostics are classified"). It requires nonzero queries, complete clean compiler/solver work and exact source-bound diagnostics. Missing queries, stderr, unsupported abstractions, any diagnostic other than the target's own, timeout or incomplete results stay `PROOF_UNKNOWN`, even if a partial diagnostic names a violation. Raw SAT/UNSAT polarity never determines a partition result. The report binds committed ABI, canonical/model/dependency sources, assumptions, compiler inputs, tool artifacts and query/response identities; it makes no bytecode theorem.

Partition reports preserve the original whole-target UNKNOWN results, four guard-only proofs and `STRICT_TERMINAL_ALREADY_PAID` native-credit counterexample as separate evidence. This mode reruns neither the original whole target nor the native witness, deploys nothing and provides no whole-contract or production qualification. The original runner invocation above remains available for its separately scoped evidence.

## Results on 2026-11-18 at 398a1c3

These are formal evidence with unknowns. They do not show that the contract is correct, and they are not release approval. Both reports have `releaseEnabled` and `productionApproval` set to false. Both runs used the clean, committed tree at `398a1c3`, the harness with the fixes described above. Later commits change only tests and documentation; `scripts/formal/evm.mjs` is unchanged since `398a1c3`.

Toolchain, as recorded in both `report.json` files:

- forge `1.5.1-v1.5.1` (`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`).
- solc 0.8.30 (SHA-256 `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`).
- Z3 4.12.2 from the pinned wheel (SHA-256 `03921d3021cb6e5dbeaeb94634132a5fbf5403748aa21774efac4047e633af1e`). It was fetched with a hash-checked `pip download --require-hashes` into a fresh Python 3.12.3 virtualenv, then unpacked so that `bin/z3` (copied from the wheel's `.data/data/bin`), `z3/lib` and the `dist-info` directory sit under `FORMAL_Z3_ROOT`. The binary, library and METADATA hashes matched the pins above.
- Node 24.22.3.

The host was shared and heavily loaded during both runs (load average about 30 to 47 on 4 CPUs). That matters because every bound is a wall-clock limit. Default `forge test` in `contracts/evm` still runs 89 tests.

| Mode | Property | Result class | `toolReported` | Why |
|---|---|---|---|---|
| Native witness | strict terminal state vs push-to-credit | `MODEL_IMPLEMENTATION_GAP` | n/a | `STRICT_TERMINAL_ALREADY_PAID: 0 != 1000000000000000000`; native refinement `TEST_EVIDENCE_PASSED` |
| Whole target (CHC bridge) | all three properties | `PROOF_UNKNOWN` | `UNPROVED` | the compiler stopped with `COMPILER_TIMEOUT` before requesting any query (0 queries, no diagnostics) |
| Guard controls (2 QF_LIA queries) | release and refund predicates admissible | `CONTROL_SATISFIABLE` for both (`sat`) | n/a | both controls held, so the guard results below count |
| Guard logic (4 QF_LIA queries) | release/refund disjoint, unauthorized release refused, seller deadline coverage, exact-deadline refund | `PROVED_GUARD_LOGIC_ONLY` for all four (`unsat`) | n/a | guard predicates only, see above |
| Partition | `EVM-NATIVE-ASSET-NOT-TOKEN` | `PROOF_UNKNOWN` | `SAFE_UNDER_COMPILER_MODEL` | clean, complete work (1 query, `sat`; 2 clean compiler rounds), but the output carries 39 abstraction warnings: 29 × 8364, 6 × 7650 and 4 × 7737, all in OpenZeppelin `SafeERC20` |
| Partition | `EVM-UNAUTHORIZED-RELEASE-ATOMIC` | `PROOF_UNKNOWN` | `UNANSWERED` | the only solver query hit the 5 s timeout (`SOLVER_UNKNOWN`). The compiler reported a possible violation ("might happen") with 3996 and no counterexample, beside the same abstraction warnings |
| Partition | `EVM-EARLY-REFUND-ATOMIC` | `PROOF_UNKNOWN` | `UNANSWERED` | same as the row above |

In both runs the operational probe classified its safe assertion `PROVED_UNDER_DECLARED_MODEL` and its unsafe assertion `COUNTEREXAMPLE_FOUND`, using 2 probe queries each. The partition run used 5 queries in all (2 probe and 3 target queries), 6 compiler rounds and 3 target attempts, all within its bounds. The overall whole-target report result is `MODEL_IMPLEMENTATION_GAP`. The model commit is null and compiled bytecode is not checked.

Report digests (SHA-256 of `report.json`): whole target `7fdced394e095b4b3f12112920342b9ee87e3f1d0fa155d881802c86fa29c64a`, partitions `c6dabe11406b78e3c715cb83f34745edc6f8141a538e57b8411bc2690fd5dfd5`. The evidence directories are git-ignored and not committed.

**Withdrawn earlier classification.** The first run on 2026-11-18 (base `eef9a80`, harness `d55c9f9`) classified `EVM-NATIVE-ASSET-NOT-TOKEN` as `PROVED_UNDER_DECLARED_MODEL`. That came from the defective unsupported-feature check and is withdrawn: replaying that run's recorded diagnostics through the fixed classifier gives `PROOF_UNKNOWN`. Its other rows did not change. It also described the funded partitions as "tool reported a violation", but solc only reported an unanswered target. Earlier partition evidence is recorded at `origin/claude/loving-einstein-xgzvdy-m0-s12-evidence:docs/execution/qualification/evm-formal-partitions.json`. It is linked here, not imported, and it predates this fix.
