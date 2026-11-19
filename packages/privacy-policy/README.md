# Local feature policy and mode plan

This optional package evaluates inert local proposals against constructor-owned compiled catalogs and the existing native G05 broker/G14 registry. It is not imported by the ordinary app. It cannot select endpoints, load code, authorize wallet spending, alter funded terms, change vault encryption, or deny reconciliation, release, refund, watch-only reads or recovery export.

## Status (what exists, and what does not)

Optional reference package under D7 (accepted 2026-11-18). Nothing in the default
build, `apps/web` or any core package imports it (the web policy controller uses
`packages/schemas` instead); `test/optional-boundary.test.mjs` fails if that
changes, and `test/authority.test.mjs` checks that it has no wallet, exchange,
escrow or network surface, a fixed public API with no spend/release/refund function,
and that evaluations report `economicAuthority: false`. Removing the directory
leaves core trading and every existing exit unchanged.

| Layer | State |
| --- | --- |
| Model | Present: strict policy parser, diff, plan evaluator over a compiled catalog, and a scoped mode controller, all over the existing G05 broker and G14 registry. |
| Adapter | None of its own. It consumes the constructor-supplied native broker and registry; it adds no provider, endpoint, signer or storage. The default catalog and registry contain no advanced providers. |
| Wired feature | None. The ordinary app does not call it. A proposal is inert; `canPrepare` is a configuration prerequisite only and never authorizes spending, changes funded terms, or blocks reconciliation, release, refund, watch-only reads or recovery export. |
| Qualified behaviour | Local conjunction logic over fixtures only. No browser privacy claim, protected badge, approved provider, anonymity guarantee, independent review or release approval. |

Unfinished integration, with the exact blockers: there is no production advanced
provider or approved catalog (the registry is empty by design), actual browser
static loading is an unbrokered path that blocks strict mode, and no G14-to-G16
wire commitment is defined. Each needs a selected provider profile and reviewed
catalog supplied by the owner; none is invented here. The accepted spec is
`05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.9_security_configuration/module_5.9.1_feature_policy_engine/spec-feature-policy-schema.md`.
Tests import `packages/relay/test/support/harness.mjs` (core test support); the
dependency points from this optional package into core, never the reverse.

`parsePolicy` accepts strict UTF-8 JSON up to 32 KiB. Version 1 has exactly `format`, `version`, `policyId`, `revision`, `required`, `optional`, `disabled`, `mode`, and `profileIds`. There are at most 32 capability entries **in total** across the three sets. Each reference has `name`, `protocolVersion` and `schemaHash`. The document is a proposal; its names and flags are never runtime authority.

A runtime is issued only by `createPolicyRuntime` using actual constructor-owned G05/G14 services and a frozen compiled catalog of at most 64 nodes. The catalog binds capabilities to local modules, protocol versions, schema hashes, provider profiles, channels, dependencies and conflicts. G14 manifests activate atomically: a disabled companion capability or an unmapped extra schema hash blocks the module. There is no G14-to-G16 wire commitment here. Cloned or imported runtime-status objects are rejected. `evaluatePolicy`/`validatePrivacyPlan` and `diffPolicy` return immutable core results. `canPrepare` is only a local configuration prerequisite: all native preflight, terms, custody, journal and wallet-consent checks still apply.

`createModeController().requestMode` performs activation: freeze the old generation, invalidate actual broker permits, dispose the old native registry, create/initialize a fresh generation-owned registry, then re-evaluate before publishing active. Cancellation and disposal hold one physical transition until ignored native initialization drains. Lowering strict to ordinary needs an explicit trusted user choice outside the imported proposal; outage never performs that transition. Evidence loss freezes new scoped preparation, with no automatic fallback.

The default catalog/registry has no advanced providers. Actual browser static loading is an unbrokered path and blocks strict mode. A constructor can describe a narrower non-browser fixture with no such path; unit coverage then proves local conjunction logic, not browser privacy or an approved provider. No protected badge, anonymity guarantee, production activation, release approval or independent crypto review is supplied.
