# Passive XMTP artifact intake

This packet records public artifact bytes and static side-effect triggers under
T90 / T84 R84-C. **Active evaluation remains blocked.** No XMTP provider, network,
gateway, wallet, inbox or production profile is selected. Trading stays disabled.

The [T50 source candidate](../../../docs/execution/profiles/04-optional-messaging.md)
is xmtp-js `8993ef24144532e53fdfcfd04eddf27dce8a5a53`. Its browser package calls
itself `7.0.0` and requires WASM
`1.11.0-nightly.20260603.89c3fc3`. Official published
`@xmtp/browser-sdk@7.0.0` instead requires `@xmtp/wasm-bindings@1.10.0` and records
unsigned `gitHead` `eb362c47b6ac92ec56fbae5c54b2a8c1ea4266cc`. All 46 packaged
SDK `src` files match that published Git tree; 39 match T50 and seven differ.
The candidate adds, among other changes, a different WASM call argument and
registration-visibility options. These are different snapshots despite the same
browser package version. The nightly archive exists; its unsigned `gitHead` is
libxmtp `89c3fc355b1f877c5031554e79a3ffe7ac532557`.

The manifest deliberately pins both requested artifacts for **comparison only**.
The complete five-package lock preserves the browser SDK's real nested WASM
`1.10.0`; it does not substitute the separately pinned nightly. It also retains
content-type-primitives `3.0.0` and its native node-bindings `1.8.0` dependency.
The SDK's optional `viem` peer is unresolved under ordinary npm resolution; no
omit, override, scanner exclusion or waiver was used. This lock is not a coherent
candidate runtime and is not a bundler configuration recommendation.

All five official archives match full SHA-512 SRI and npm P-256 registry
signatures, with altered-message rejection controls. Their signing key is current
and has no expiry in the retained registry snapshot. That snapshot also preserves
the unused expired historical key; no historical assertion is promoted to current
trust. The unsuppressed whole-lock npm audit reports **0 advisories** across all
five entries at this observation. Audit covers npm advisories, not every Rust crate
or vulnerability inside the compiled WASM/native binaries.

All five packages declare MIT and contain the complete MIT license text, retained
with hashes in [pins.json](pins.json). The exact upstream package licenses and a
distinct libxmtp root MIT notice are also recorded. This is a license-evidence
packet, not legal clearance or a complete embedded Rust/native dependency notice
review. Registry signatures authenticate archive integrity; unsigned `gitHead`,
publisher attestation URLs and matching manifests do not prove a reproducible
JS/WASM/native build. No attestation or binary rebuild was verified.

Static inspection of retained public bytes found these triggers:

| Entry point | Observed source behavior |
| --- | --- |
| `new Client(...)` / `new Opfs(...)` | Immediately constructs a module Worker from a bundled asset URL. |
| `Client.create(...)` | Constructs the Worker, obtains the signer identifier, initializes the client and registers unless `disableAutoRegister` is set. `build(...)` still initializes. |
| Worker action / `createBackend(...)` | Awaits WASM init. The generated loader fetches adjacent `bindings_wasm_bg.wasm`, instantiates it and invokes its start export. Backend defaults to `dev`; API/gateway overrides are inputs. |
| Low-level client creation | Looks up or generates inbox ID, defaults a database filename, passes an optional database key and enables device sync unless disabled. No offline flag is supplied by the inspected call. |
| `register()` | Requests identity association signature text, calls the supplied signer and sends registration to the Worker. Association is not spending consent. |
| Send / stream / history methods | Post Worker actions; streams may sync first. History methods select environment URLs and default archives to consent/messages, including disappearing messages. |
| T50 static inbox-update helper | Creates an ephemeral identifier and low-level client, performs a network query, then frees the WASM client. A null DB path does not make this a passive probe. |
| `close()` / stream disposal | Calls standard `Worker.terminate()` or sends `endStream`; this wrapper supplies no native closure completion promise or fixed deadline/pending-action cap, and close does not explicitly reject pending actions. |

Both WASM files were read as bytes only: header/version, hashes and finite import
section inventories were checked. They declare host imports for fetch, randomness
and OPFS handles. Generated JS exposes receiver/global fetch and OPFS access. This
does not enumerate or qualify all runtime requests or sockets. A main-window-only
fetch wrapper cannot establish Worker/WASM G05 routing. Worker logging and forwarded
error objects also need the repository's redaction and bounded lifecycle contract.

The following profile contracts remain absent: a coherent protocol/SDK/WASM build;
network/environment/gateway/server artifacts and routing for every execution realm;
wallet-to-inbox association validation and participant authentication; bounded
installation creation/revocation; conversation consent; negotiated trade-envelope
codec, limits, expiry and replay rules; G02 database/key ownership and G03 fresh-key
restore; cursor/history/retention/deletion semantics; generation/AbortSignal,
resource limits, late-receive disposal and registered redacted errors; and a named
independent browser/provider, interoperability, identity, privacy and retention
review. The [XMTP specification](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.1_message_adapters/spec-xmtp-messaging-adapter.md)
requires unsupported before SDK loading or identity signing when a reviewed
profile is absent. Convenience random EOA helpers are not production wallets.

Only lock resolution (`--package-lock-only --ignore-scripts`), official public
metadata/archive/source reads, full-lock audit and passive byte checks occurred.
No dependency tree was installed. No SDK import, constructor, init, registration,
key/inbox/database creation, Worker/WASM/native execution, provider selection or
SDK network traffic measurement occurred. Public intake downloads are not SDK
egress evidence. No no-egress, disposal or browser compatibility PASS is claimed.
Managed proxies, CA and TLS were preserved; root dependencies are unchanged.

`pins.json` binds all five archives, raw official metadata/keys/audit, complete
archive inventory, source comparison, license text, static observations and the
exact manifest/lock. The retained work evidence and four-file freeze support a
separate root review. There is no evaluator or install/run recipe in this passive
packet. Audit zero alone does not authorize active evaluation or activation.
