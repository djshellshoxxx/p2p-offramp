# Canonical EVM formal/refinement evidence

This local pipeline imports the unchanged `contracts/evm/src/BasicEscrow.sol`; it does not supply a replacement escrow or alter a production ABI, compiler recipe, deployment gate or default application. It produces review evidence, never deployment approval. It is separate from the existing 82 ordinary/fuzz/invariant tests.

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

## Narrow guard-logic proof

The runner separately compiles the unchanged canonical source to its actual compiler AST. It accepts only the exact storage alias, contiguous side-effect-free revert conditions and immediate canonical state assignment of release/refund; unknown AST forms, changed revert arguments, inserted side effects, changed enum values or a changed pinned canonical source fail closed. Every predicate carries its actual byte span and AST/source hashes. Four bounded QF_LIA queries cover release/refund disjointness, unauthorized release refusal, seller deadline coverage and exact-deadline refund admission over explicit EVM integer domains. UNSAT here means no violating predicate valuation; success is labeled only `PROVED_GUARD_LOGIC_ONLY`. Unlike the CHC consistency bridge, these are ordinary satisfiability queries. Modifiers, gas, actual execution, storage transitions, payout custody, bytecode and whole-contract correctness are excluded. Each exact query and response is retained; timeout or other answers stay unknown.

## Bounds, scope and remaining gaps

Each of the two compiler bridges allows at most 64 queries, 4 MiB per query, 32 MiB query text and eight compiler rounds (plus four guard queries; at most 132 queries overall). There are five seconds per solver query, 25 seconds per compiler invocation and a two-minute analysis/native budget. Process output is bounded; every invocation kills its owned process group on success, spawn error, timeout and output overflow, including unreferenced descendants with closed pipes. Standard input, output and diagnostics remain separate for the SMT bridge. Native gas/runtime assumptions, compiler abstractions, trusted known-contract calls, uint128 principal and fresh single-transaction actor scope are explicit in the property set. This does not establish arbitrary whole-contract interleavings, ERC20 behavior, Solana correctness, fiat receipt, network inclusion, hardware safety or external specialist review.

The full canonical SMT target currently can exceed the compiler's query-generation bound before emitting queries. That is recorded as `PROOF_UNKNOWN` with `COMPILER_TIMEOUT`, not a clean result. The strict payout-model gap also remains a promotion blocker until its active/pending/paid refinement is explicitly reviewed. New source, dependency, interface or artifact bytes invalidate prior evidence. Candidate models have a null `modelCommit` before integration and are bound by exact model/source hashes.

Run with Node child IPC capability (the sandbox may require loopback/network capability even though analysis itself makes no external request):

```sh
node --test scripts/tests/formal-evm.test.mjs
FORMAL_Z3_ROOT=/path/to/z3-package \
FORMAL_Z3_ARTIFACT=/path/to/pinned-wheel.whl \
FORMAL_FOUNDRY_ROOT=/path/to/foundry \
FOUNDRY_SOLC=/path/to/solc-0.8.30 \
node scripts/formal/evm.mjs /path/to/evidence
```

`report.json` and the retained actual native trace, SMT inputs, queries, responses and diagnostics live in the chosen workspace output directory. A successful evidence run may legitimately report a model gap and unknown proofs. No generated packet is authority to advertise or deploy for real funds.

Tool locations are configuration, never evidence: all selected binaries/artifacts retain identical pinned hashes and version checks. `FORMAL_FOUNDRY_ROOT` is optional; otherwise the existing Foundry `forge` on PATH is checked. `FOUNDRY_SOLC` uses the existing compiler override, falling back to `$HOME/.svm/0.8.30/solc-0.8.30`. Both Z3 paths are required; no managed-workspace tool directory is implicit. The optional positional CLI argument selects the evidence directory (default `.formal-evidence` under the repository). It must resolve inside the repository checkout; any other path stops with `FORMAL_OUTPUT_OUTSIDE_REPOSITORY` before anything is written.

## Finite one-property partition investigation

`node scripts/formal/evm.mjs --partitions /path/to/new-evidence` selects only the closed `NativeConstructor`, `UnauthorizedRelease` and `EarlyRefund` targets in that order. It uses the same explicit tool roots and existing compiler/query bridge. Each file imports the unchanged canonical escrow and contains one original check function copied byte for byte. The funded cases retain the original `_terms` helper and both `FormalOutsider` methods, including every amount, actor and time condition. The runner checks the original model hash and exact whole partition text, and records original/partition assertion and fragment byte spans and hashes. No stronger precondition, replacement escrow, altered assertion or additional target is accepted.

This mode runs the existing safe/unsafe operational probe, then makes at most one attempt per target. The probe and all targets share at most 64 queries, 32 MiB query text and eight compiler rounds, with the unchanged 4 MiB query, 25-second compiler, five-second query, 120-second total, process-output and source limits. The output directory receives an exclusive start marker to prevent an accidental rerun in that directory. A finite investigation stops at these bounds; it does not raise a deadline or retry a target to obtain a proof.

Partition classification requires nonzero queries, complete clean compiler/solver work and exact source-bound diagnostics. Missing queries, stderr, unsupported abstractions, timeout or incomplete results stay `PROOF_UNKNOWN`, even if a partial diagnostic names a violation. Raw SAT/UNSAT polarity never determines a partition result. The report binds committed ABI, canonical/model/dependency sources, assumptions, compiler inputs, tool artifacts and query/response identities; it makes no bytecode theorem.

Partition reports preserve the original whole-target UNKNOWN results, four guard-only proofs and `STRICT_TERMINAL_ALREADY_PAID` native-credit counterexample as separate evidence. This mode reruns neither the original whole target nor the native witness, deploys nothing and provides no whole-contract or production qualification. The original runner invocation above remains available for its separately scoped evidence.
