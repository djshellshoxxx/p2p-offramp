# Codespaces test lab and GitHub Pages release

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Provide an optional reproducible developer lab and a delayed static hosting target. Codespaces is not a trusted production node, privacy boundary or place for mainnet seeds. Pages publication occurs only for an approved signed static release.

## 3. Architecture and data contracts

LabRecipe records `{sourceCommit,devcontainerDigest,imageDigest,toolVersions,lockfileDigest,ports,fixturesDigest}`. Pin container images by digest and actual package/compiler versions at implementation; do not invent a tested version in this design. Include Node/package manager, EVM local chain, Solana local validator and test commands where supported by resource limits; unsupported local-validator targets use separately documented developer hosts. Generated fixture keys have conspicuous test-only labels and never reuse production identities. Forward only necessary ports, private by default; frontend may bind for container access but must not expose wallets/RPC on public internet.

## 4. Algorithms and lifecycle

Create fresh environment → install exact lockfile → run foundation tests → start isolated local chains → deploy test escrows → execute G24 synthetic journeys → export sanitized reports → destroy workspace secrets. No production credentials in dotfiles/devcontainer environment or prebuilds. Dependency cache keys bind lockfile/runtime and are not trusted executable evidence. Pages pipeline builds Vite with repository-relative base, verifies asset paths/reload behavior, includes static recovery portal and signs manifest outside untrusted build jobs. First publish a testnet-only shell; real-funds configuration is delayed until M2C independent review, chain parity, recovery, translations/accessibility and incident evidence pass. CI PR jobs cannot access publication/signing secrets.

## 5. Interfaces and integration

Developer commands and expected outputs are documented for clean checkout, environment creation, tests, validators and teardown. `LabRun` records command versions, seed fixture digest, chain IDs, test results and report hashes. Publish job accepts a preapproved manifest/artifact digest, never an arbitrary branch build. GitHub Pages host header limits and absence of runtime API/secrets are explicit; use content policy compatible with actual hosting capabilities. No browser code calls GitHub token-authenticated APIs to operate core trades.

## 6. Errors, abuse and residual threats

LAB_UNSUPPORTED, PORT_EXPOSURE, FIXTURE_PRODUCTION_KEY, BASE_PATH_BROKEN and PUBLISH_GATE_MISSING fail setup/publication safely. Codespaces limits and service availability vary; document actual measured requirements. Cloud operator/workspace compromise can read developer data, so use fake funds/transcripts. Deployment links do not prove signed content or on-chain correctness.

## 7. Verification and primary references

Rebuild from a fresh Codespace and from independent local environment, compare assets, execute synthetic EVM/Solana flows, test private ports, relative route reload, camera/clipboard fallbacks under hosted context and secret scan. Verify Pages output against signed manifest with independent tool. Record unsupported resource cases honestly; delayed publication is a gate, not a missing implementation workaround.

Primary references (exact implementation revisions must be pinned in the evidence record): [Development containers specification](https://containers.dev/implementors/spec/); [Codespaces port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace); [Vite GitHub Pages deployment](https://vite.dev/guide/static-deploy#github-pages).
