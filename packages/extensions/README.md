# Bundled extension registry

Offline G14 implementation for reviewed build-time modules. The application does
not import this package. An empty registry is valid; no optional module is needed
for basic escrow exits. It loads no remote code and exposes no wallet, key,
storage, network client or direct reducer mutation.

`createExtensionRegistry()` returns a `CoreResult`. Registrations are detached
plain objects with an `instance` containing own data properties `manifest`,
`initialize` and `dispose`, plus an optional trusted `validateProposal` parser.
Capability names must be explicitly registered by the build. The manifest's
capability and schema-hash sets are sorted and immutable; at most 16 of each and
16 negotiated modules are supported. These implementation bounds are conservative
local limits, not an interoperability claim about future extension profiles.

`resolve(id, protocolVersion)` returns a managed facade, never the original
instance. Initialize it with the core's read/proposal ports and a native
`AbortSignal`. Reads are detached validated `TradeView` snapshots. Proposals are
disabled during initialization; afterward a configured parser must validate the
input and return a declared `schemaHash` plus parsed `value`. Only the detached
`{schemaHash,value}` reaches the core proposal port. That port still owns all
account, chain, deployment, state, G12 reservation and wallet-consent checks. A
proposal reference is not spending approval. Missing parsers refuse proposals.

One registry owns one generation. Initialization runs once; repeats cannot rebind
its context. Retire the owner generation, cancel its lifetime signal or call
`disposeAll()` to revoke mediated context immediately and abort initialization/
jobs. Disposal drains pending initialization and module cleanup; a nonsettling
trusted module can delay that drain but cannot use the revoked context. Create a
new registry with fresh bundled instances for a later generation. Owner hooks
must call disposal on generation transition; a false/throwing `isCurrent` hook
also retires the registry when observed. Modules remain responsible for honoring
their signal and cleaning up resources they own.

This is architectural discipline for trusted same-origin bundled code, not a
JavaScript sandbox. No mapping from the G14 negotiated set to G16
`{id,version,policyHash}` is specified here. Nothing in this package encodes
funding terms, installs an extension in the app or grants authority over existing
funded trades. Synthetic tests establish local behavior, not professional review
or a funds-enabled release.
