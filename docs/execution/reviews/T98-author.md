T98 is frozen for root review. The existing native reconciliation command passed all ten checks on its first modified run. The original nine cases, assertions, limits, and cleanup remain byte-exact outside the additive header and new case.

Producer: scripts/test-evm-reconcile-local.mjs
Before SHA-256: 11c4f60533ccefe031b7b177470bf87afedecbfe47bbee5311df681f1f559f1a
After/executed SHA-256: ff5ade6ba499d5f5c9b4ad6781bbbb196202fae5f02532edf3d724dd738ecb4c
Exact source delta: /workspace/work/t98-native-reorg.patch (SHA-256 d0ca039306936a20a1f015267ceec43b082053da65efca20f52f0cd331d6120c).

Command: PATH=/workspace/work/t87-native-diagnostic/node24.22.1:/workspace/work/foundry-1.5.1:$PATH FOUNDRY_BIN=/workspace/work/foundry-1.5.1 FOUNDRY_SOLC=/workspace/work/foundry-1.5.1/solc-0.8.30 FOUNDRY_OFFLINE=true npm run test:evm:reconcile
Log: /workspace/work/t98-native-reorg-first.log (exit0, SHA-256 016a0b5d628cfab6e743b45218d26df55249612a65c5f08ce163fc7e5e282552).

Node v24.22.1, npm11.9.0, Foundry/Anvil1.5.1 b0a9dd9 and offline solc0.8.30 were measured and hashed. No package, production, ABI, policy, or Node isolation setting changed. Only the admitted existing npm alias was run; no full suite, provider/solver probe, or duplicate runner was used.

One explicit lifecycle fund at nonce 13 reached a successful receipt at block 0x25 with its exact canonical block hash at or below the actual finalized head. Native finalized escrow state matched the distinct terms; the encrypted G12 journal recorded finalized. After closing that client, the owned pre-fund snapshot was reverted and 3 alternate blocks were mined at a changed timestamp. Native old receipt and transaction became null; the original inclusion height had a different canonical hash; latest/finalized trade state was absent; nonce returned to 13 and the escrow balance reverted while BasicEscrow code remained intact.

A fresh client recovered the retained finalized intent and reconciled it through the actual native EIP-1193 reader and createEvmTxLifecycle to receipt-evidenced reorged. Exactly one encrypted CAS/revision persisted that transition. Another fresh client unlocked/decrypted the same journal and recovered reorged with the original hash and prepared bytes. Intent IDs stayed unchanged. The actual wallet wrapper observed accounts/chain preflight plus exactly one initial eth_sendTransaction, and zero wallet calls during finality, rollback, reconciliation, or both recoveries.

Original hash: 0x7822d24ea9e0e622df5266d9803f4c16c3da5f449004effabe8a3f2a1fbc0067
Original receipt block hash: 0xd86a9d0bc4eac8e605c9c20ddc6165fbf7b52ac0ab9fceb0288ec1267f3e2538
Alternate canonical block hash: 0x2f65195368a9cd26ec9fc601ffe383a0e589cc40465a374c4495b2825bf6818d
Native BasicEscrow runtime SHA-256: 5e7635cb4625feb12a1b1ab4bc15c21952bd6e98d1f635b1d947caf2d3cae336, equal to the pinned-compiler output artifact.

All 45 conservative source/dependency input pins remained unchanged across the run. The source tree included pre-existing root documentation edits; this is not a clean-tree receipt. The old harness SHA matches the recorded HEAD source. Syntax and scoped diff checks passed.

Owned cleanup was observed after exit: Anvil PID 195162 is absent from /proc and /tmp/g12-reconcile-Qg9HMO is absent. Existing finally cleanup is unchanged; the earlier killed-client case still awaits/asserts its SIGKILL exit. No native failure or RED was encountered and no retry was needed.

This is bounded local fake-funds evidence for G24-TX-REORGED. It does not qualify mainnet finality, production, real funds, all possible forks, or an absorbing reorged state under future explicit reconciliation.

Machine-readable packet: /workspace/work/t98-native-reorg.json
Ownership of the frozen existing harness is returned to root. No commits were created.
