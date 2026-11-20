# Public QR display, capture and review — execution record

## Scope

This increment adds a complete local public QR workflow to the ordinary Recovery page: render an explicitly reviewed symbol; read one camera frame, a bounded PNG/JPEG, exact pasted text or an exact public text file; inspect the complete decoded fields; explicitly confirm the local review; and compare an encrypted backup or offline reference file with a public byte-length/SHA-256 fingerprint. No file is decrypted, restored, uploaded or merged into domain state. No QR command connects a wallet, creates a trade session, prepares a transaction or sends funds. `ReleaseEnabled=0` and the existing offline CSP remain unchanged.

The source base is `bf71ca1e5e8dbdd8c1f83d5fde3c9f4f8ad8ba1e`. Initial camera, file/review and image/Worker tests were committed RED at `6b12b0ac72f4d22084ff2f8b1e53a397719aad2b`. The new application consumer uses the current `packages/qr` public facade. It does not copy the fixes from PR #171 (`5984dc823c25399a001b5f059c79db89f51a1324`) or #172 (`56b904e5c4fba36a4688ab8411123926c90d1e28`), and does not waive their separate Tier B bot-review requirements.

## Boundaries and lifecycle

- Public inputs pass through the existing exact D6 text/envelope codec. File decoding uses fatal UTF-8 with BOM preservation, so a leading BOM, space or newline cannot silently change into an accepted canonical code. Public text files are capped at 64 KiB before reading; the decoded envelope cap stays 2,048 bytes.
- PNG/JPEG files are capped at 2 MiB and complete bounded headers are checked before native decompression. Source dimensions are at most two million pixels and 4,096 on either edge. The decoder receives at most one million pixels and 1,024 on either edge. SVG, animation and malformed/trailing containers are refused. Decoded dimensions are checked again.
- A global physical file lease survives cancellation until native reading and its consumer settle. A global camera lease spans permission and active preview; late streams are stopped, and remounting cannot start a concurrent permission prompt. A global decoder lease spans reentrant input/factory/scheduler callbacks; a late-created Worker is terminated before it can receive work. A failed termination keeps admission closed.
- Real decoder work runs in one newly created module Worker per attempt, with a one-second deadline and exact bounded request/reply shapes. The Worker is terminated after every terminal outcome. Pixel buffers are cleared where still owned. Route departure, hiding, profile selection changes, explicit discard and unmount revoke local state and camera/decoder work.
- Chain-bound codes use only networks in the current registry-reviewed terms. Scanned values cannot expand this set. Profile/registry context is captured and checked around asynchronous work and at confirmation/export. Default builds without reviewed network terms still support chainless fingerprints.
- Every review is explicitly unauthenticated. The invite signing-key profile remains unresolved. Confirmation records only a bounded in-memory request-ID dedupe entry and enables public display/copy/download or exact local fingerprint comparison. It creates no authenticated session or economic authority.
- Fingerprints contain the selected format, exact byte length and SHA-256 only. File contents and filename are excluded. Structural validity and equal bytes do not authenticate a file or establish recoverability. Comparing a valid reformatted backup intentionally reports different bytes.

## Dependency and emitted graph

[The decoder intake](../../security/intake/qr-decoder/README.md) pins jsQR 1.4.0, the archive integrity, upstream release commit, exact runtime source hash, Apache-2.0 license and dated runtime audit. The npm and upstream distributed runtime files matched byte for byte. No runtime transitive dependency is introduced.

The only decoder graph modules are `apps/web/src/qr/decode.worker.ts`, `decoder.ts`, `protocol.ts`, and `node_modules/jsqr/dist/jsQR.js`. The document/private-vault graph cannot import the decoder runtime. The separate `qr-graph-worker.json` binds its emitted asset and exact dependency hash. License completion includes the worker-only dependency in the ordinary third-party attribution file. Existing private-Worker and default/demo graph checks are retained.

The initial offline `npm ci --ignore-scripts` attempt was killed with exit 137; its cause remains unestablished. Local verification uses physically copied pinned dependencies plus the verified cached jsQR archive. It is not a fresh-install PASS. Hosted CI must perform a clean `npm ci --ignore-scripts`.

## Execution status

| Gate | Local result | Scope |
| --- | --- | --- |
| Focused QR lifecycle, UI, graph and outside-scanner tests | PASS 28/28 | Includes all 25 frozen matrices, the 2,048-byte envelope, rotation/inversion/damage, late camera and Worker callbacks, owned-pixel cleanup and contradictory graph claims |
| Combined existing QR codec + new application + locale/content policy regressions | PASS 142/142 | No failures or skips; includes an independent text oracle for the browser fixture |
| Existing and additive build-policy suite | PASS 53/53 | Default/demo/testnet separation, actual localnet build, private-Worker boundaries, dependency/source/asset pins, import graph, retained-artifact comparison and locale placeholders |
| Four-project `npm run typecheck` | PASS | Root, runtime, Worker and UI projects; decoder Worker checked with Worker libraries separately from the UI |
| Final default and demo emitted builds | PASS | Separate pinned decoder Worker and license attribution; one private-vault Worker; `ReleaseEnabled=0` |
| Actual emitted QR browser attempt | BLOCKED before first page | Build passed, then Chromium aborted at `process_singleton_posix.cc:297`: `socket() failed: Operation not permitted`; ptrace was also refused |
| Fresh local `npm ci --ignore-scripts` | BLOCKED attempt | Exit 137, cause unestablished; later local gates used verified dependency reuse, not a successful fresh install |
| Hosted fresh install / actual emitted browser | PENDING | Required on the published exact head; no local browser journey is claimed as PASS |
| Physical device/camera/print/low-light matrix | NOT RUN | [Explicit unfilled matrix](qr-physical-device-matrix.json) |

The [evidence index](qr-public-evidence-2026-11-19/index.json) records full log hashes, original local paths and readable committed copies. It binds the reviewed production/test paths by SHA-256. Committed log copies strip terminal color escapes, trailing line whitespace and trailing blank lines only; the original outputs remain separately identified. Repeated tests are not summed as distinct test coverage.

Earlier failed attempts are retained. The initial three application test files failed before implementation. Later regressions reproduced a lost live-camera lease, reentrant Worker factory/input/scheduler revocation, BOM/file parity, incomplete pixel cleanup on early refusal, and contradictory graph authority flags. The first outside-scanner run failed because its test rasterizer read nibble-padded frozen rows as whole bytes, dropping odd final nibbles; correcting that independent rasterizer made all 25 symbols readable without modifying the codec or decoder. Its UI escaping assertion also initially mistook inert `onerror=` text inside an escaped ARIA label for an executable attribute; the corrected assertion distinguishes attribute values from attributes. The all-five review-label test already passed and is recorded as added coverage, not a reproduced source defect.

The first default build refused hyphenated locale keys. Catalog keys now use underscores with a typed view for unchanged protocol keys; neither the locale validator nor the CSP was relaxed. A later TypeScript check rejected the duplicated inline mapped return type; a single named mapped type resolves that error without changing emitted behavior. The first build-policy run exposed obsolete synthetic fixtures with array-valued core graphs; those fixtures now use the same version/modules object shape as real emitted graphs, and malformed graph input is explicitly refused. No existing policy assertion was removed.

No retry with altered Chromium flags, replacement browser, mock page, mocked decoder, or weakened runtime restrictions was used to manufacture browser success. The final harness closes each completed independent context to bound hosted browser resources; its execution still requires hosted CI.

The additive browser command is `npm run test:qr:browser`, also appended to the existing `test:web:browser` command. It builds the ordinary emitted app and uses its real SVG display, image primitives, module decoder Worker, private-vault Worker and IndexedDB. The test reads a screenshot of the app's own generated symbol, independently decodes the downloaded public text, checks PNG and JPEG ingestion, full review and explicit confirmation, backup/reference equality and inequality, exact-text/file refusals, no wallet/network/private-domain authority, late camera permission/remount cleanup and actual vault-lock clearing.

The browser fixture's camera permission schedules are synthetic, backed by real canvas MediaStreams. Its hidden-document signal is deterministic fixture input. Those checks qualify app composition and cleanup only. They do not claim physical camera permission, iOS/Android/browser-device support, printing, low light, or phone performance. The 1,024-byte generation target and M-level choice retain their physical-device qualification requirement.

## Reviews and external gates

Independent current-byte source review found and helped reproduce two reentrant lifecycle defects and the file/BOM parity discrepancy; regression tests preceded those fixes. The reviewer subsequently found no further High/Medium issue in the reviewed lifecycle and public UI/export scope, and read the emitted-browser harness and intake. This statement is preliminary until the final independent verdict is bound to the checkpoint tree. Root owns publication, exact-head hosted gates and final independent integration review.

The D6 invite signing-key profile, authenticated negotiation handoff, PR #171/#172 Tier B reviews and physical-device scan matrix remain separate gates. This increment makes none of those claims and preserves production trust and disabled release state.
