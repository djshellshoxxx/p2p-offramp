# Optional module capability and authority boundary

## 1. Metadata

- **Specification ID:** G14
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Allow later privacy/evidence/courier/arbitration modules without making them hidden core dependencies or granting authority over existing funded trades. Extensions are reviewed bundled code, not arbitrary remotely loaded plugins.

## 3. Architecture and manifest

```typescript
interface ExtensionManifestV1 {
  format: "p2p-offramp-extension";
  version: 1;
  id: string; // lowercase ASCII [a-z0-9-], 1..64 characters
  protocolVersion: number; // integer 1..65535
  coreApiVersion: 1;
  capabilities: readonly string[]; // registered names, max 16, no duplicates
  schemaHashes: readonly string[]; // canonical 32-byte lowercase SHA-256 hex
}
interface ExtensionInstance {
  manifest: ExtensionManifestV1;
  initialize(context: Readonly<ExtensionContext>, signal: AbortSignal): Promise<CoreResult<void>>;
  dispose(): Promise<void>;
}
interface ExtensionContext {
  readTrade(binding: TradeBinding): Readonly<TradeView> | null;
  proposeIntent(binding: TradeBinding, intent: unknown): CoreResult<string>;
}
```

Context exposes validated read/proposal methods, not raw spending keys, global wallet/provider references, storage DEKs or direct network clients. Module-specific evidence/intents have exact schemas registered before initialization; arbitrary JSON proposal data is rejected.

## 4. Negotiation and lifecycle algorithms

A build-time registry enumerates supported manifests. Runtime does not fetch executable code or import an ad-supplied URL. Core validates manifest format/version, exact coreApiVersion, capability names, limits and schema hashes. Missing/unsupported modules remain `unsupported` without affecting core trade exits.

Before offer acceptance, both parties select the exact extension ID/protocolVersion/capability/schema hash set, sorted lexicographically by ID with no duplicates. That immutable set is included in the canonical agreed terms and terms commitment under the terms spec. Basic trades use an empty set. The funding preflight rejects unrecognized or unavailable required capabilities. Optional display-only capabilities cannot become required settlement conditions after funding.

Initialize is once per active generation; failure disables that instance and aborts its jobs. Dispose revokes context handles, aborts network/workers via scoped service capabilities and removes subscriptions. A disposed instance cannot publish late results. No extension directly changes escrow or core reducer authority. An arbitration module requires a separately deployed opted-in escrow version; loading it in UI cannot give arbitrators rights in a basic escrow. Basic release/refund/recovery remains available when all optional modules are absent.

## 5. Interfaces and errors

Registry APIs are `resolve(id, protocolVersion): ExtensionInstance | null`, `negotiate(manifests): CoreResult<NegotiatedCapabilitySet>`, and `disposeAll(): Promise<void>`. `NegotiatedCapabilitySet` is the immutable sorted array of validated manifest identity/version/capability/schemaHash fields used in terms, with at most 16 modules. Unsupported version/name/hash returns UNSUPPORTED_VERSION or UNSUPPORTED_PROVIDER before signing. Runtime adapter/network failures return the module-specific error and preserve core exits. G13 governs error redaction; economic proposals still require core checks, durable G12 reservation and user wallet consent.

## 6. Threat assessment

A malicious bundled extension has same-origin JavaScript privileges; capability interfaces are architectural discipline, not a secure JS sandbox. Treat extension selection as a dependency/security review decision under G06. Downgrade attacks are prevented by immutable term commitments and unsupported-version refusal. A plugin cannot assert a proof/score is sufficient for settlement without the actual opted-in deployed contract enforcing it. Provider outage may block that opted-in feature but must never rewrite existing contract terms or trigger a hidden alternate adjudicator.

## 7. Verification and references

Build a core-only artifact with advanced packages physically absent; complete basic discover, fund, chat, manual release/refund and recovery. Test duplicate/oversized manifests, unknown API versions, changed schema hashes, unsupported requirements, empty/basic negotiation and immutable funded terms. Dispose during init/network/worker work and assert no late side effects. A fake extension proposal must not bypass signer/network/deployment/state checks. Sources: [development roadmap](../../../DEVELOPMENT_ROADMAP.md), [system authority](../module_0.4.1_system_boundaries/spec-system-context-contract.md), [G06 dependency policy](../../feature_0.9_security_assurance/module_0.9.1_dependency_provenance/spec-cryptographic-dependency-policy.md).
