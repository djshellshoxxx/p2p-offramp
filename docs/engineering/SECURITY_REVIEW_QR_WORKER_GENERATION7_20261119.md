# Generation 7: independent QR and Worker boundary review

Date: November 19, 2026, Pacific time (November 20 UTC).

## Outcome and source

This was a bounded, read-only security review of the maintained public QR flow and the offline vault Worker protocol. It found **no new High or Medium issue in the reviewed paths**. The existing local QR regressions passed **75/75** and the existing Worker/runtime/schema regressions passed **55/55**, with zero failures, skips, cancellations or todo in either qualified execution. No production source, test, dependency pin, workflow or coordinator state was changed.

| Identity | Value |
| --- | --- |
| Reviewed candidate | PR #205 |
| Exact source commit | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Exact source tree | `ce3c69ddc36245f756005c540e521a26a3ce59b8` |
| Review branch | `codex/p2p-security-review-g7-20261120` |
| Local checkout | `/workspace/scratch/6eace968c0df/p2p-security-review-g7` |

The source identity above is the input to this report, not a later integrated tree. Other workers' portal, draft-navigation, IndexedDB and Solana changes were not part of this review. A prior worker's unfinished Solana observation was not investigated or endorsed by this pass.

The reviewer read `docs/engineering/CONSOLIDATION_HANDOFF.md`, `consolidation-state.json`, the QR package documentation, the QR execution record and the relevant implementation/tests. No applicable `AGENTS.md` was found in this checkout or its workspace ancestors. The review used source inspection and existing local tests only. It did not interact with a deployed service, a public RPC/relay, a wallet or live funds.

## Inspected boundaries

### Public input and private state remain separate

`apps/web/src/qr/review-controller.ts` admits public text or a local image for a memory-only review. Its operations do not negotiate, restore, sign, send, persist records or navigate. `trusted-context.ts` derives chain admission from the current application owner and registry-reviewed terms; scanned content does not register another chain. The controller captures that context and checks it after asynchronous work, at confirmation and again before public copy/download/display.

The local recovery-fingerprint path structurally validates the selected container and hashes its original bytes. Its QR payload contains only the supported format, byte length and SHA-256. Matching bytes do not authenticate the container, decrypt it or establish recoverability. Tests verify different formatting produces a different fingerprint and that no restore/decryption capability is introduced.

`packages/qr/src/text-codec.ts` returns a frozen review whose authority is `none`. The application supplies no invite verifier and displays every import as unauthenticated. The package's injected verifier contract and signature stripping/profile refusals remain distinct from a deployed authentication mechanism. Public `originHint` values remain display-only. This review does not resolve the invite signing-key profile.

### Input bounds precede QR parsing and decoding

The inspected code retains these explicit bounds:

| Input | Bound and enforcement source |
| --- | --- |
| Canonical QR envelope | 2,048 decoded bytes, depth 8; `packages/qr/src/text-codec.ts`, `jcs.ts`, `envelope.ts` |
| Public text file | 64 KiB before the local read, then the codec's smaller text/envelope bound; `apps/web/src/qr/file-input.ts`, `review-controller.ts` |
| PNG/JPEG file | 2 MiB, at most 2,000,000 declared pixels and 4,096 on either edge before browser decompression; `image-header.ts` |
| Decoder frame | At most 1,000,000 pixels and 1,024 on either edge, with intrinsic buffer lengths checked before copying; `protocol.ts`, `decode-client.ts` |
| Decoder attempt | A one-second timer terminates the owned Worker; `decode-client.ts` |

The file path checks both the declared size and the returned buffer's intrinsic length, retains a physical read slot until the native promise/consumer settles, and clears the owned view afterward. Exact pasted/file text is preserved, including base45 spaces and a BOM that the codec must refuse. The codec checks canonical encoding, duplicate JSON keys, allowed fields, chain admission, payload hash and expiry before producing a review.

The image preflight rejects SVG, animated PNG chunks, malformed/trailing containers and excessive dimensions. Native bitmap dimensions are checked again before scaling. The tests exercised these local parser/lifecycle guarantees; they did not execute a browser's image decoder in this pass.

### Decoder ownership and narrow Worker messages

`decode.worker.ts` accepts only its fixed `decode` request shape with a positive safe request ID, bounded dimensions and an exact ArrayBuffer length. It replies with either bounded text or a fixed code. `decode-client.ts` checks the reply ID and shape and terminates the Worker after success, refusal, cancellation or timeout. Reentrant cancellation cannot release the physical slot while a factory may still return a live Worker. A failed termination retains admission rather than allowing another job.

The static artifact policy in `apps/web/scripts/qr-build-policy.mjs` admits exactly four decoder modules: the decoder entry, `decoder.ts`, `protocol.ts` and the pinned jsQR runtime. It excludes that runtime from the document and private-vault module graphs. This was source inspection of the maintained policy; **no new emitted artifact or browser qualification is claimed here**.

`capture-controller.ts` holds camera ownership across the permission request and live stream, stops late streams after cancellation, and stops all obtainable tracks on disposal. `ui/QrPanel.tsx` discards captured state on profile/scope changes, page hiding and unmount. The camera tests used controlled local ports, not a physical camera.

### Offline vault protocol and profile ownership

`packages/schemas/src/runtime.ts` keeps a fixed command union, requires `ReleaseEnabled: 0` and an empty connection-origin list, snapshots exact own data fields, bounds byte copies, and reconstructs fixed error codes/message keys. Generic record, network and signer commands are absent. Saved reviews, favorites, templates and recovery-reference projections retain their purpose-specific schemas and limits.

`apps/web/src/runtime/worker-endpoint.ts` validates commands before creating private services, rejects replayed/future-generation commands, serializes private jobs and checks the selected profile/lease. Lock, timeout and disposal suppress stale private replies. The document runtime checks operation, request ID, generation and requested profile again before publishing a reply. It separately binds encrypted-export bytes to the requested profile. Pending metadata excludes passphrases, configuration and private byte arrays.

The document activity handler checks `event.isTrusted`; polling and synthetic activity cannot extend its idle deadline. The Worker retains its own monotonic idle check, and an expired selection cannot be revived by queued activity. These statements are covered by the executed local runtime and endpoint tests, including late uncancellable work and wrong-profile replies.

## Executed verification

Environment: Node `v24.22.3`. The dependency tree was physically copied from the coordinator's checkout only after `package-lock.json` compared equal. `node_modules` is a directory, not a cross-checkout symlink. No dependency version or lockfile changed. This is reuse of the existing pinned installation, **not** a fresh `npm ci` result.

Both qualified groups ran serially with `--test-concurrency=1` to limit shared-host load.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  packages/qr/test/base45.test.mjs \
  packages/qr/test/codec.test.mjs \
  packages/qr/test/envelope.test.mjs \
  packages/qr/test/jcs.test.mjs \
  packages/qr/test/jcs-array-proxy-error.test.mjs \
  packages/qr/test/display-group-size.test.mjs \
  apps/web/test/qr-image.test.mjs \
  apps/web/test/qr-camera.test.mjs \
  apps/web/test/qr-review.test.mjs
```

Result: **75/75 passed**, zero failure/skip/cancellation/todo; `16742.488015 ms`.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  packages/schemas/test/runtime.test.mjs \
  packages/schemas/test/runtime-templates.test.mjs \
  apps/web/test/worker-endpoint.test.mjs \
  apps/web/test/app-runtime.test.mjs \
  apps/web/test/pending-metadata.test.mjs
```

Result: **55/55 passed**, zero failure/skip/cancellation/todo; `27049.533022 ms`.

An initial invocation before copying dependencies exited 1 because the codec/envelope test oracles import `@noble/curves` through the maintained Nostr package. That missing local dependency was an environment preparation failure, not a reproduced product defect and not a qualifying execution. Its log is retained separately. No source change was needed for the qualified rerun.

Logs remain under `/workspace/scratch/6eace968c0df/verification-security-g7`:

| Log | SHA-256 |
| --- | --- |
| `qr-scoped.log` — initial missing-dependency attempt | `34aac7e0c243aa1e6214e1fff868d9b14e54b6d5dd8509e7fc7ce55b12b66b99` |
| `qr-qualified.log` | `6c2ae4e2ad3abf717dea77beb49d70ce0db5dac53cd0e1471ebe759cda33a45b` |
| `worker-boundary-qualified.log` | `619b4f7921ce72434ff0575d502f30c3b946b6b2305dd1215f0216b71bf387ae` |

## Limits and fresh-worker handoff

No new blocking finding was established in this scope, and no speculative concern was promoted to a vulnerability. This is not a whole-application security assessment or a certification of browser/native behavior. The existing tests exercise local unit/component ports, strict parsers, actual package code and the test vault's cryptography/storage adapter. They do not establish physical-device qualification or a hardened host filesystem/browser.

The following work remains distinct:

1. The coordinator must bind hosted browser/native outcomes and independent integration review to the final combined source/tree. This report does not transfer PR #205 component results to a later candidate.
2. A future QR reviewer should use the actual emitted browser journey when its environment is available, with the production decoder Worker and private Worker. Preserve the existing public-only/no-authority assertions and refusal cases.
3. The physical phone/camera/print/low-light matrix remains unfilled by this pass. Its limits cannot be inferred from bounded parser tests.
4. Authenticated trade invites still require an explicitly chosen key profile and independently reviewed binding. Do not replace the current unauthenticated labels or infer authentication from a matching payload hash/fingerprint.
5. When purpose-specific Worker operations change, repeat the affected schema, request-metadata, wrong-profile and lock/cancellation tests on that new exact source. This report is not approval for a generic vault or network operation.

No local Chromium launch, broader build/typecheck/full-suite run, public network query, remote Git mutation, deployment, release, credential change or financial operation was performed by this reviewer. The final report commit changes only this document.
