# T98 distinct final review

Approve the scoped local native reorg delta. No blocking findings.

The new ordinary case actually finalizes one fund, reverts only the owned pre-fund chain snapshot, mines a different canonical inclusion-height block and confirms receipt/transaction/funding removal while nonce/balance roll back and escrow code survives. A fresh encrypted client first recovers the old finalized record, reconciles once to durable reorged with original hash/prepared identity/nonce, and a second fresh client plus direct vault decode retains that state. Exactly one initial wallet send occurs; no later wallet capability calls, new intent or replacement preparation.

Both actual native runs pass10/10, retain all prior9 checks, match their log/JSON/source bindings and finish owned cleanup. All45 root source pins match current bytes; the sole author/root pin difference is the harness. Root comparator inverse restores frozen author ff5ade6b… exactly; original9-case body/assertions/cleanup bytes are unchanged. Block bounds remain80; normal local completion does not qualify arbitrary provider deadlines.

| Source | SHA256 |
|---|---|
| Baseline | 11c4f60533ccefe031b7b177470bf87afedecbfe47bbee5311df681f1f559f1a |
| Frozen author | ff5ade6ba499d5f5c9b4ad6781bbbb196202fae5f02532edf3d724dd738ecb4c |
| Reviewed current root | a363fa1b44184ec2cf7b65c53da9a0e8cd94af56a1893371b74b538f13f1cdbf |

This supplies actual local G24-TX-REORGED evidence, not production finality/fork/provider/wallet certification. No tests, native runs, solver attempts, source/ledger edits or commits by this reviewer; root integrates the result.
