# P2P G16 pre-allocation guard — Claude proposal intake

2026-10-27 UTC. Sole P2P integrator: Codex coordinator. Broker proposal: **Claude Sonnet5.5**, request `req_011CgRk5c4hn9ntunsGVB6dD`; input assignment **P2P-G16-PREALLOC-01**. No additional paid call, credential/budget setup, worker or duplicate implementation was initiated here. Broker-reported accounting is retained, not independently billed/recomputed or used to reset the shared ledger.

## Exact provenance and ownership

- Packet/base `673006c1a9cb1e8a1e6eb1a665738b5312f3edc2`; both reserved file hashes verified before changes. Documentation-only descendants `ba070cfbf1d62a677da48b41b2e7027e63eec4d0` and `68354100e95f839966bef91aac2d22b026be8b07` preserved those bytes. The latter is the actual pre-implementation HEAD.
- Complete185-line/9085-byte proposal read through native Library: `libfile_79762651b9248191825f75d46520a9b0` version0, SHA256 `53b97a313f52a054eecfc81ef004c6cf53fe99c75f1474412bd6f1f417fcce46`. It was unexecuted/unvalidated on delivery.
- Both unified patches, source base hashes, proposed target hashes, headers/allowlist and `git apply --check` were independently checked. Only `packages/domain/src/trade-terms.ts` and `packages/domain/test/trade-terms.test.mjs` changed as code. The applied files match the exact broker-proposed byte hashes; no integrator logic rewrite or new oracle output.
- Original proposal, two exact patches, intake record and seven atomic terminal records/lossless gzip logs are under `../evidence/p2p-g16-preallocation-20261027/`. Detailed hashes/times/commands are in `../evidence/P2P_G16_PREALLOCATION_20261027.json`. Source/evidence commit and private delivery receipt follow.

## Behavior and review

`text(input,minimum,maximum,ascii)` now rejects a nonstring without coercion and rejects a primitive string whose UTF16 code-unit length already exceeds the existing UTF8 byte maximum **before** surrogate/ASCII scan and `TextEncoder.encode`. A valid UTF8 encoding cannot use fewer bytes than UTF16 code units. The existing post-encoding byte bound still rejects multibyte strings whose code-unit count fits but byte count does not. No truncation, Unicode normalization, serializer/crypto algorithm change, new protocol limit or financial policy.

All limits remain4096instruction UTF8bytes,64capability-ID ASCIIbytes,32version ASCIIbytes,16384private bytes,8sorted unique capabilities. Canonical vectors and all prior tests remain untouched. Oversized malformed strings now get LIMIT_EXCEEDED before deeper text validation, as the assigned contract requires; bounded malformed inputs still get INVALID_INPUT. Decimal guards already bounded input length and were not changed.

Four new synchronous regression tests cover instruction/capability sentinel non-entry into TextEncoder, ASCII/euro/surrogate-pair4096byte boundaries and over-byte-cap refusal, bounded invalid surrogates and nonstring no-coercion. The spy delegates all other encodings with the native receiver and restores the prototype in finally; tests are sequential within their Node file. No large allocation/time threshold or weakened deadline/KDF/case is used. This bounds only the encoder temporary; it does not remove a caller's existing string or implement pre-structured-clone intake.

## Actual RED/GREEN

1. Applied **test patch only**, verified production source remained exact packet base. `node --test packages/domain/test/trade-terms.test.mjs`: **8pass/2fail/0skip**,10tests, exit1. Both intended sentinel tests observed one oversized argument reaching TextEncoder. Other old and boundary/type cases passed. Exact original RED retained.
2. Applied the independently checked minimal source patch. Combined domain/EVM/bundle suite: **32pass/0fail/0skip**, exit0.
3. Private G16 browser fixture: Chromium154.0.8037.57 document and dedicated module Worker, **153assertions each**, same independent fixture hashes,0unexpected requests. Same-provider complete bundles remain labelled integration evidence.
4. `npm test`: **383pass/0fail/0skip**, exit0; four new tests explain379→383, not a feature-completion score.
5. `npm run build`: exit0, all4existing strict TypeScript configurations then Vite static build.
6. `npm run check:boundaries`: exit0,46production source/18core modules; no diagnostic in this run.
7. `npm run test:build-policy`: **5pass/0fail/0skip**, exit0.

Final source hashes stayed fixed across GREEN/focused/browser/aggregate/build/boundary/policy commands. Three golden files remain byte-identical to original base. Emitted app graphs exclude EVM verifier/wallet/Noble/qualification fixture; ReleaseEnabled0 and connectOrigins[] remain. Separate emitted-app UI, vault/runtime/reseal browser suites, Python/specs and other browsers/devices were not rerun. Recorded tests are engineering evidence, not independent audit, provider acceptance or release readiness.

## Restart and remaining gates

This narrow pre-allocation assignment is integrated and verified locally. No app/public facade, preview command/schema, wallet, dependency, security inventory or browser-support policy was changed. Native SHA/diagnostic RNG attribution and conditional review are recorded in `../reviews/G16_BROWSER_DISPOSITION_2026-10-27.md`; they do not authorize inclusion.

Next product work remains the separately reviewed typed intake before document→Worker cloning, strict result/error discrimination, Worker-owned lifetime/privacy and user-visible offline check. Existing ABI/registry/time/finality/trust/escrow/journal gates still govern trading. Do not repeat public EVM provider/vector research or call same-provider bundles independently qualified. Preserve original Python/non-Noble expected bytes and all later-preserved modules.

No GhostPay access, source push/CI, deploy/release, real funds, credentials/security/network changes, new software/environment or denied retry. Private checkpoint target remains `libfile_b5734354657c81919d25ed4930348dc9`, last confirmed version9; guard the next update and preserve complete predecessor bytes. Source commit follows; producer receipt records the exact uploaded checkpoint, not consumer retrieval or whole-repository Git restore.
