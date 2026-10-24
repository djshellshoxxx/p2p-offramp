# Static frontend package and runtime architecture

## 1. Metadata

- **Specification ID:** G07
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Build one recoverable React/TypeScript/Vite static client with replaceable wallet, chain, relay and storage adapters. Domain state and invariants must be testable without a DOM, network or real wallet. No SSR/server API or operator-held secret is required by core.

## 3. Architecture and import boundaries

| Path | Responsibility | Permitted dependencies |
|---|---|---|
| apps/web | Accessible React UI, route coordination, composition root | Public interfaces of packages |
| packages/schemas | Runtime validators, canonical encodings, fixed types | No React/provider/DOM/network |
| packages/domain | Pure state machines, authority, terms, validation policies | schemas only |
| packages/storage | G02/G03/G09 crypto and IndexedDB boundary | schemas, Web Crypto, IDB |
| packages/transport | G05 route broker and bounded I/O | schemas; injected fetch/socket implementations |
| packages/chain-evm | EVM preparation/reconciliation | domain/schemas/transport; selected SDK |
| packages/chain-solana | Solana preparation/reconciliation | domain/schemas/transport; selected SDK |
| packages/wallet | G10 external-wallet adapters | schemas/domain; approved providers |
| packages/relay | Validated discovery/chat adapters | domain/schemas/transport; approved protocol library |
| packages/extensions | Optional G14 registry, separate entry points | Public core interfaces, approved opt-in packages |

No source file imports another package's private paths. Composition root injects side-effectful services. Domain/schema packages reject imports of React, browser globals, SDKs, Node runtime libraries and provider objects. Core production entry points do not import advanced extension packages.

## 4. Build and routing algorithms

Use strict TypeScript with noUncheckedIndexedAccess and exactOptionalPropertyTypes. Select exact supported React/TypeScript/Vite/runtime versions during implementation, pin a lockfile and record them under G06; this spec does not claim versions have already been installed or reviewed. CI runs frozen install, import-boundary check, typecheck, unit tests, build and static browser smoke tests.

Vite emits relative asset paths. Use hash-based client routes so static deep links do not require server rewrites; public URLs never contain vault secrets, payment instructions or transaction signing payloads. A URL/QR can prefill validated public data but cannot execute a wallet command. Unknown routes show a safe recovery/navigation page. Browser startup begins locked/watch-only, validates release/network configuration, initializes routing policy, then creates services; no wallet connect or permission prompt occurs automatically.

Production has no service worker in the first core release. Offline read-only behavior means the already loaded app may show explicitly stale authenticated state; it does not promise offline installation or fresh chain state. Enabling a service worker later requires cache/update/secret-retention specifications and review. No source maps containing private development fixtures or credentials ship in the public artifact. Static configuration contains only public values.

## 5. Interfaces and lifecycle

The application composition root owns a disposable service container: storage, backup, identities, transport, wallets, chain adapters, relay and extension registry. A single `start(publicConfig): Promise<CoreResult<AppServices>>` validates config before services with network authority initialize. `dispose(): Promise<void>` aborts jobs, locks keys, closes sockets/IDB, invalidates handles and subscriptions. React components receive view models and explicit commands, not keys/providers. Routes are home, offers, trade/<opaque local ID>, recovery and settings; a trade route resolves through validated local bindings and cannot treat a URL contract address as an approved deployment.

Boundary validation failure produces a fixed error page with local recovery/export where available. Missing Web Crypto/IDB secure context disables encrypted private operations; do not fall back to plaintext persistence. Missing chain/provider capability yields explicit unsupported state. Assets and optional modules failing to load must not reset user data.

## 6. Threat assessment

Static hosting avoids server custody but does not make delivered JavaScript trustworthy. Host/build compromise, malicious dependencies, XSS, misleading wallet requests and origin changes remain risks. Apply G04 CSP/content boundaries and signed release/update verification. Secrets in build env become public if embedded; CI must scan artifacts and use explicit public-config allowlists. Relative paths and hash routes support multiple base paths but do not solve IndexedDB isolation across origins; G03 file recovery is required.

## 7. Verification and references

Boundary tests intentionally import a provider or React into domain and must fail. Build a core-only artifact and inspect its dependency graph for advanced modules/server code. Browser tests cover root and nested-path static hosts, hash deep-link reload, IPFS-style base paths, missing chunks, denied storage, offline recovery, locked startup and disposal during async work. Assert zero automatic wallet prompts and no private data in URL/localStorage/cache. Accessibility and responsive/mobile matrices remain separate required specs. Sources: [Vite static deployment](https://vite.dev/guide/static-deploy), [TypeScript compiler options](https://www.typescriptlang.org/tsconfig/), [G04 content policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.12_browser_security/module_5.12.1_content_boundary/spec-client-content-security-policy.md). Framework versions and browser support need evaluated implementation evidence.
