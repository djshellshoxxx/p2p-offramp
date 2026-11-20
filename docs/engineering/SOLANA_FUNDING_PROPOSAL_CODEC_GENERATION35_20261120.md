# Generation 35 — local SOL funding proposal codec

Date: 2026-11-20. Source: `4228040248963389d7dae28881f1db2927ca54ec`; tree: `cbdc2f8d4335d356fa70a21edbcd37ec916cf2f2`.
Base: reviewed G34 consolidated source `0b7832d1c5b348a0755d59152442d0318d4a620c`.

## Result and scope

An inactive app-profile codec now parses a public seller-direct local SOL proposal and creates or decodes its private vault record. The public document contains exactly `format` and all fifteen immutable G16 `terms`. The maintained G16 encoder supplies validation and binary identity. Equivalent JSON layouts normalize to one frozen representation. Public and decoded private payloads are capped at 4,096 and 8,192 bytes, respectively.

Only two source paths are added: `apps/web/src/solana-localnet/funding-proposal.ts` and `apps/web/test/solana-localnet-funding-proposal.test.mjs`. Every base entry is preserved; the final source has 1,035 entries outside documentation, including the existing two Gitlinks. The codec has no consumer, command, facade export, wallet grant, persistence operation or native planning capability.

## Record contract

The creator requires the controller's independently installed `parseSolanaLocalnetConfig` result. It matches genesis and program address, derives the binding from installed network/deployment IDs and the canonical terms hash, and records seller role, a nonzero original profile ID, registry/program-data/artifact digests, asset ID, and historical endpoint/margins. These copied pins do not authenticate a registry and never install imported executable configuration.

The stable record ID is the lowercase first sixteen SHA-256 bytes of the domain-separated record-format/full-binding JSON array. Decoding checks the exact wrapper/body shapes, canonical full binding and terms hash, original profile/provenance representation and recomputed ID. All returned objects are detached and frozen. Caller bytes, configuration fields and record wrappers are captured before asynchronous hashing yields; own getters are not invoked. Arbitrary Proxy reflection traps are outside that inertness claim.

The record is a `PrivateRecordV1` value for the existing vault encryption boundary; the codec itself neither encrypts nor writes it. Its payload retains original provenance through fresh-key backup restore. Stored endpoint and margin values remain readable historical data even when a future installed configuration differs. A later controller must compare them and preserve the original entry rather than silently relabeling it.

Parsing establishes data consistency only. Canonical non-core capabilities and expired term data remain readable. The accepted G34 shared funding planner still owns new-funding eligibility. No buyer acceptance, present escrow state, wallet ownership, prepared capability or funding outcome is asserted.

## Verification

| Check | Exact result |
| --- | --- |
| Initial missing-feature baseline | 78 cases: 1 G16 fixture control passed, 77 failed |
| First implementation | 77/78 passed; one endpoint error-normalization failure retained |
| Final focused suite | 82/82 passed; zero failed, cancelled, skipped or TODO |
| First-tree UI TypeScript | Passed before the narrow error normalization |
| Frozen-source TypeScript | All four maintained projects passed, including the UI project containing the inactive module |
| Import boundaries | Passed: 244 production files, 155 core modules |
| Full main-baseline whitespace | Passed without exclusions |

The initial implementation correctly rejected a nonlocal retained RPC URL, but the existing config helper threw its generic configuration error. A narrow wrapper now reports the codec's `INVALID_INPUT` failure. The original 77/78 output and exact source patch remain retained. Four additional final cases cover exact public/private size boundaries, domain-separated full-binding identity and readable historical provenance; the 82-case command is not represented as the original 78-case baseline.

Positive and negative cases cover all immutable terms, canonical binary hashing, whitespace/key-order normalization, malformed/duplicate/prototype JSON, native asset restrictions, noncanonical integers/keys/digests, forbidden public claims, wrapper/ID/binding/provenance tampering, origin validation, alias mutation and own getter refusal. Counters establish zero selected clock/random/network/wallet/storage operations in the codec.

The compatibility case uses the actual encrypted vault and backup services with an in-memory store. The current recovery controller ignores the bounded unknown proposal record, admits and reads an ordinary funded recovery document, and restores both records with the proposal payload and original profile unchanged. Wallet connect/sign/send counts stay zero. The native RPC fixture is scripted; this establishes no browser, validator, live-chain or physical-wallet acceptance.

The final focused and boundary commands ran on a complete uncommitted execution tree identical to the frozen source tree. All four TypeScript projects and full whitespace ran after source commit. Seven execution snapshots are reconstructed from exact full binary patches. Full logs and patches, the runner and final source patch use deterministic gzip with raw and compressed SHA-256 identities.

## Continuation boundary

Later admission must enforce full-binding/escrow collision checks, union quota across proposal and funded recovery records, immutable duplicate provenance, installed-configuration compatibility, and existing lease/epoch/CAS guards. Later preparation and confirmation must retain the original bound trade/prepared handle/session/epoch and preserve exact one-shot wallet grants. Only finalized escrow observation may materialize a normal funded recovery record while retaining the proposal. Existing recovery import remains funded-only, and existing native journal/restore authority is unchanged.

No full-repository suite, build, browser/validator/financial run, dependency install, external target, deployment or release was performed. `ReleaseEnabled=0`. Independent review and combined publication/acceptance remain coordinator-owned.

## Evidence

- [Machine-readable receipt](../execution/solana-funding-proposal-generation35-20261120/receipt.json)
- [Execution snapshot reconstruction](../execution/solana-funding-proposal-generation35-20261120/execution-snapshot-verification.json)
