# P2P raw-byte asset inventory milestone — 2026-10-27

Local source **2327719605dfd8dd59b4a1d5a8e99761053509e4**, tree **b4571cf779cf4ea5d85af893c758aec7eb0cf68b**, follows clean documentation checkpoint 37174cc5773599809c9e254a32599ea837cdedac. One integrator; no new workers, paid calls, dependency changes, publication or GhostPay edits. PRIVATE-TRANSPORT09 stays broker-owned/read-only and untouched.

## Completed

`apps/web/scripts/build.mjs` counts and SHA-256-hashes the actual file Buffer before UTF-8 text-policy inspection. Sorted paths, path/count/decoded-size restrictions, private-key refusal, Worker/license/graph checks remain. Returned inspection byte total now reflects raw file bytes. No cryptographic primitive/profile or release authority changed.

`apps/web/scripts/artifact-policy.test.mjs` adds owned temporary seven-file bundles: binary, malformed UTF-8 and ordinary multibyte text exact inventories plus binary private-key refusal. Synthetic notices are scanner prerequisites in tests, not distributed licenses.

## Actual evidence

Tests-first `node --test apps/web/scripts/artifact-policy.test.mjs`: exit1, 5 pass/2 fail before implementation, reproducing four bytes→eight and five bytes→thirteen with incorrect hashes. RED log retained; command start time was not separately captured. After fix `npm run test:build-policy`: exit0, nine pass. Tests passed before committing identical source bytes.

Frozen-source shared runner: seven suites passed, exit0, no skips/timeouts/source drift. `npm test`454/454; `npm run build` including four strict TypeScript projects; boundaries49 production/19 core modules; `test:browser` native storage/CAS/recovery/Worker/CSP/crash fixtures; `test:web:browser` root/nested/IPFS-style paths, header/meta builds, repeated-build byte match and source-retaining UI recovery; Python12/12; spec audit173 documents/zero broken links. Linux Chromium154 only. Exact commands/times/log hashes/cleanup are in [evidence](../evidence/P2P_ASSET_BYTE_20261027.json) and raw logs beside it. Private G16 document/Worker qualification was not rerun here.

## Next reproducible slice

While source was frozen, a separate owned fixture confirmed another existing exact-inventory defect: root filename `__proto__` is accepted but disappears in plain-object lookup maps (seven actual files, six reported). This is independent of broker09, trust keys, deployment, cryptographic providers and app inclusion. Add tests first for prototype-looking paths and policy checks on that path; minimally use maps without inherited setters. Candidate ownership remains the same two build/test files. No fix has yet been applied for this second defect. Do not manufacture a signature/bootstrap approval or signed-release claim.

No full G15 or off-ramp acceptance claimed. ReleaseEnabled remains0/connectOrigins[]; signed release, production trust/deployment and live trading remain closed. Existing source/HOST07/seeded campaigns and all old failure evidence are retained. Next reviewer should verify exact HEAD/status, read this evidence, then continue the bounded path-completeness regression.
