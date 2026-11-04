# T38-H maintained support tools

Fresh semantic read of all nine assigned tools: **1,281 lines / 109,105 bytes**. Exact per-file checks and limits are in JSON. No script/test/probe was executed and no source/ledger was edited during this baseline.

Inventory SHA256: `b8a558e62f0a15b84bae740b37af98353dba5d9661460824ac5b48964d8eefe9`.

## Findings

**TOOLS-001 · P2 · `scripts/check-import-boundaries.mjs:63`:** Every directory-read failure is swallowed. Missing/unreadable requested sources can disappear while a readable App entry yields graphChecked=true and a passing partial result. Fail incomplete collection and create intentional empty fixture roots explicitly.

**TOOLS-002 · P3 · `scripts/vectors/check_g16_evm_openssl.py:19`:** Empty vectors or no acceptance rows exit success after verifying zero signatures. Refuse zero expected signature work while retaining genuine fixtures and negative signature controls.

Root admitted T93 narrow four-file fixes after this immutable source-only baseline. No current source omission, invalid committed fixture or product compromise was established.

## Scope and limits

The seeded fuzzer has eight deterministic bounded synthetic families, exact error/owned snapshot checks, private metrics, restored intrinsics and exclusive output outside source; no hard parser sandbox or unused noSigCopy allocation guarantee is inferred. The initializer’s complete 162-row literal manifest has six fields and unique safe existing paths; preservation/symlink/noclobber behavior was reviewed, never executed. Reference vector tools use trusted synthetic inputs/public keys and record provenance without qualifying providers. Receipt polling is one-hash/read-only with bounded logical wait, not physical RPC cancellation. TSX hooks are test transpilation, not type checking/runtime isolation.

Historical repro tools/vendor examples remain archived evidence. This review is not fresh professional certification, provider/device interoperability or proof that no defect exists.

| File | SHA256 | Semantic checks |
|---|---|---|
| `scripts/check-import-boundaries.mjs` | `34b2013a7967c6cdb1abfc13d274ab3140f3a3b110ce148bcdab368e2050a724` | AST import/reexport/dynamic/require extraction, relative containment/private facades, core global/import restrictions, transitive optional-module graph, enumeration/errors/cleanup |
| `scripts/fuzz-evm-agreement-input.mjs` | `4fa379e441356d7476dfae17da05802ad784fe0066bc28916c215329c7a47b5c` | all eight deterministic families, genuine error/refusal oracle, accepted frozen/owned snapshot checks, resource intrinsic restoration, bounded private metrics, CLI output containment/exclusive creation |
| `scripts/initialize-specifications.sh` | `8f232f561819fcd80116fc8d368cf269e68af897169ea9dd34ddc0474b14a320` | shell flow/quoting, all literal manifest rows, safe path components, preservation/noclobber, symlink refusal, master catalog/placeholder limits |
| `scripts/vectors/check_g16_evm_openssl.py` | `efd62a22e2fbd5c973fbc5248658216fcd4492106c6cfd63b3837c0acd154cb3` | offline dependency boundary, synthetic key/public key, DER signature conversion, prehashed digest verification, empty workload outcome |
| `scripts/vectors/g16_evm_independent.mjs` | `650483be964b74bb94980f88dd9044e09ed3fd72b43b2477e9bdd6dca63a117a` | independence from App/Noble, offline exact versions/licenses, source/lock provenance, EIP712 order/domain layout, six synthetic boundary cases, signature verify/recovery |
| `scripts/vectors/g16_vectors.py` | `f8bac7350d8d681972c2217b43b3c1996ec065b424e8559d28133920f83093c1` | private agreement canonical bytes, LP/UTF8/capability order, base58 keys, Solana endian/native/SPL layout, synthetic maximum values, check/write modes |
| `scripts/test-support/fixture-receipt.mjs` | `1b376fc97e2afdabfd8ecb56b6c56347c148454926fd8f3edd156856ab5f9822` | same-hash read only, 40 read/39 null wait cap, 5s monotonic read deadline, post-await checks, strict result/sanitized errors |
| `scripts/test-support/register-tsx.mjs` | `ddead2643c4c755753b0cf357ffb4dad12241cb7b34ba5997f62807f37b34370` | local loader registration, test-only side effect |
| `scripts/test-support/tsx-hooks.mjs` | `4a9d9bbbe692840bc290126b4c905f08d90c7747728db7e8731c5cc4a3679ebe` | file TSX-only interception, nonmatching delegation, Vite Oxc fixed transform, ES module short circuit |
