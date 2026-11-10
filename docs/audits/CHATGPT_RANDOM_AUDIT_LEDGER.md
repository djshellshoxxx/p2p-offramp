# ChatGPT randomized independent security-audit ledger

This is a **read-only, source-inspection audit ledger**, not a security certification. It is intentionally isolated from primary development and documentation branches. No additional paid or independent ChatGPT worker was available; this audit was performed **sequentially by the same ChatGPT session**, not concurrently.

## Audit 001 — 2026-11-10

- Reviewed main commit: `300287dcde818a9d10ae301265d00bc7c0877bbb`.
- Selection procedure: enumerate 123 application/package JavaScript/TypeScript source files from `git/trees/main?recursive=1`, exclude test/spec/fixture paths, preserve ascending tree order. FNV-1a 32-bit hash of `300287dcde818a9d10ae301265d00bc7c0877bbb:no-ledger` = `3670998554`; selected index `hash % 123`: **`packages/schemas/src/evm-agreement-input.ts`**. No previous random-audit ledger existed on inspected main.
- Scope and trust boundaries: [`evm-agreement-input.ts`](../../packages/schemas/src/evm-agreement-input.ts), its [request parser](../../packages/schemas/src/evm-agreement-protocol.ts), and [input](../../packages/schemas/test/evm-agreement-input.test.mjs)/[request](../../packages/schemas/test/evm-agreement-protocol.test.mjs) tests. The package [public facade](../../packages/schemas/index.ts) does not export these private parser functions. This is a **structural-only snapshot parser**, not signature validation, trust bootstrapping, or escrow authorization.
- Inspection:
  - Lines 64–98 of input parser: fixed-key own data-record/array checks, exception handling around untrusted metadata traps, and array arity caps.
  - Lines 103–164: numeric/address/string bounds, 4 KiB instruction cap, 8-capability limit, native vs ERC-20 structure, and no claim that cross-field hashes are verified.
  - Lines 169–231: intrinsic `Uint8Array`/owned-signature copying, detached/resizable/shared backing rejection, and zeroization of allocated signature copies on the error path.
  - Request parser lines 64–72: version, operation, and request/generation bounds precede input-body parsing; the request does not grant execution authority.
  - Existing regression coverage: input tests lines 39–108 (owned copies, hostile properties, detach race), 140–205 (boundary rejects), 208–227 (injected copy failure clears outputs), and protocol tests lines 32–88 (headers and structured data failures).
- **New findings:** **none established** from this inspection. No exact reproducible new defect, impact, or exploit proof is available; do not invent a finding or claim the module is audited for release.
- Residual areas for deeper *future* testing (not alleged vulnerabilities): cross-realm and mutable-intrinsics behavior, environmental exception paths during secret wiping, runtime/wallet adapter ownership of returned signature bytes, and integration-level coupling of terms hashes to actual verified acceptance. The parser explicitly **does not** perform cryptographic verification.
- Validation: GitHub source and existing test cases were inspected. **No runtime regression tests or fuzzing were executed by this audit.** GitHub CI from other branches is not evidence that this audit exercised the selected module.
- Files modified in this lane: this ledger only; **no code changes**. Ownership of main, PR #61, and active Claude PR #65 remains undisturbed.
- Follow-up: audit a different previously unaudited source path next run, using the current commit SHA plus this ledger's selected path/ordinal to vary the deterministic seed. Inspect caller/test boundaries again. Revalidate earlier findings on changed source heads before carrying forward any security claim.

## Coverage tracking

| Entry | Source SHA | Path | Outcome | Local tests |
| --- | --- | --- | --- | --- |
| 001 | `300287dcde818a9d10ae301265d00bc7c0877bbb` | `packages/schemas/src/evm-agreement-input.ts` | Source-inspection only; no verified new defect | Not run |

This is not an authorization to accept funds, deploy, release, merge, suppress CI/security gates, or disclose a newly discovered vulnerability publicly.
