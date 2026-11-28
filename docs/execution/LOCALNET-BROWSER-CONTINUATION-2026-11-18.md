# Localnet browser continuation and send-evidence review — 2026-11-18

## Outcome and source

The exact PR #168 baseline `2a623d7248dcfd35d215b50738c01846143c704a` built successfully against the pinned local Anvil escrow/relay fixture, but Chromium still could not launch under the default execution permissions. **No browser journey passed or ran.** No escalation or alternate launch workaround was attempted.

A test-evidence weakness was independently corrected in `02c3e93dcb87d6c876e2f019f693e0fc8b06fc9e`: the browser and native-controller harnesses had accepted a durable journal marker based only on matching calldata. They now require the complete physical transaction and its current-profile send provenance. Application and contract production source are unchanged by this scoped repair.

## Observed browser blocker

Command: `npm run test:localnet:browser`, with the pinned Foundry 1.5.1 (`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`) and solc 0.8.30 (`f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`) supplied through the existing `FOUNDRY_BIN` and `FOUNDRY_SOLC` controls. Node was 24.22.1.

The real local fixture passed compiler/runtime identity checks, deployed only to disposable chain 31337, and the Vite localnet build completed. The harness then launched `/usr/bin/chromium` using its existing options. Chromium exited with SIGABRT before any context or page existed:

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

The complete build and launch failure is retained in [baseline-localdeps.log](evidence/localnet-browser-continuation-20261118/baseline-localdeps.log). An initial dependency setup attempt used an external `node_modules` symlink, which the module-boundary policy correctly refused. The recorded attempt uses an actual in-checkout copy of the identical locked dependencies. No admission policy was changed.

## Evidence assertion repair

The old harness selected a `broadcast-unknown` journal record if its serialized `preparedRequest.data` equalled the wallet request's calldata, then checked only the origin profile. It could therefore report a durable marker for the wrong wallet account, recipient/token, native value, nonce, or chain when calldata was unchanged. This was a weakness in the test's assurance, **not a reproduced application substitution vulnerability**.

The new test-only `assertLocalnetSendMarked` independently reconstructs the six physical EIP-1193 fields (`from`, `to`, `data`, `value`, `nonce`, `chainId`) from the durable prepared request. It refuses omitted or additional wallet fields and ambiguous marker matches. The selected marker must be version 2, belong to the current profile, contain a valid persisted send timestamp, match the journal account and nonce, and still have a null transaction hash immediately before the send.

The helper deliberately does not call the application's request projector to validate that same projector. It checks exact request evidence; it is not a substitute for contract semantics, token policy, peer acceptance or wallet authorization.

## Validation

| Check | Result and scope |
| --- | --- |
| Mutation tests against extracted original calldata-only predicate | **7 failed, 3 passed**, demonstrating the evidence gap; [RED log](evidence/localnet-browser-continuation-20261118/marker-red.log) |
| `node --test apps/web/test/localnet-send-evidence.test.mjs` after repair | **10 passed, zero failures/skips**; full native/approval request, field substitutions, omissions/extras, ambiguous or older-profile markers, and provenance/account/nonce checks; [GREEN log](evidence/localnet-browser-continuation-20261118/marker-green.log) |
| `npm run test:localnet:controller` with repaired assertion | **12 passed** using real Anvil and encrypted relay traffic, **12 signing prompts, 4 sends and 4 exact durable markers**, including release, uncertain broadcast, fresh-profile restoration and refund; [native log](evidence/localnet-browser-continuation-20261118/controller-green.log) |
| `node --check scripts/test-localnet-browser.mjs` | Passed syntax check; no browser execution inferred |
| `git diff --check` | Passed |

The new unit file is included by the existing `apps/web/test/*.test.mjs` glob in `npm test`; no CI exemption or new optional-only gate was introduced. The native-controller result uses encrypted in-memory storage. It does not qualify browser IndexedDB, DOM, actual browser Worker lifecycle, physical wallets, public testnets, or the combined pending ERC-20 feature.

`ReleaseEnabled=0` is retained. Hosted browser qualification on the exact integrated source is still required. This work did not change release settings or publish a deployment.
