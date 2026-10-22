# Versioned documentation, education and claims

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Provide versioned user/developer documentation whose claims match verified behavior. Adoption features cannot obscure seller-withholding risk, fees, origin trust, privacy limits or recovery requirements. No claim of GhostPay visual/security parity follows merely from copying ideas.

## 3. Architecture and data contracts

DocsManifest: `{releaseId,sourceCommit,locale,topic,sourcePath,implementedCapabilities,reviewers,lastVerifiedRelease,linkReportDigest}`. Source Markdown lives under docs/wiki-source; actual wiki synchronization requires an enabled destination and authorized publication workflow. Topics cover quick start, escrow authority, wallets/chains, backup/recovery, QR/mobile, privacy/metadata, fees/refunds, evidence/disputes, accessibility/localization, scams, release verification, developer setup, architecture/contracts, testing, audit scope and incident response. Each topic labels implemented, testnet-only, proposed or unsupported behavior.

## 4. Algorithms and lifecycle

Derive behavior examples from exact release capability/deployment registries and reviewed acceptance evidence. A ClaimsRegister stores `{claimId,text,scope,evidenceDigest,limitations,reviewer,approvedRelease}`; no claim “anonymous”, “trustless fiat”, “audited” or “guaranteed recovery” may publish without a precise justified scope, and basic manual escrow cannot support those absolute claims. Explain seller release before expiry and refund to seller at/after expiry before onboarding payment. Cite specific audit report/artifact scope if one exists. GhostPay references are inspiration only; actual visual assets/styles/screenshots need provenance/license review before reuse or parity assertions. Fee calculators use canonical minor/base units and clearly identify network versus protocol fees.

## 5. Interfaces and integration

Docs CI checks local links, source/example consistency, locale key parity, release references and code examples against the intended artifact; semantic review remains human. Demo onboarding uses fake funds and visible test mode. Favorites/templates remain local encrypted where private. Referrals may share generic app links without trade/counterparty identifiers and have no hidden fees/tracking; any future analytics requires separately specified consent/data lifecycle. Documentation exports include offline recovery checklist and public deployment fingerprints, not sample real secrets.

## 6. Errors, abuse and residual threats

DOCS_STALE, CLAIM_UNSUPPORTED, EXAMPLE_INVALID and LICENSE_UNKNOWN block affected publication. Wiki content can drift after sync; signed releases bind source docs hashes and identify external mutable wiki as guidance. Link checking cannot certify remote content or legal applicability. Stale screenshots, misleading privacy badges, dark patterns and seed-requesting support instructions are explicit threats.

## 7. Verification and primary references

Reviewer follows quick-start and independent recovery from a clean device using test funds; another reviewer checks all safety/fee/privacy statements against evidence. Test offline docs, keyboard/screen-reader navigation, locale fallback and no analytics requests. Release check ensures unsupported optional modules are labeled and no proposed feature appears as implemented. Publication and real-funds claims remain pending appropriate gates.

Primary references (exact implementation revisions must be pinned in the evidence record): [GitHub wiki documentation](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis); [WCAG 2.2](https://www.w3.org/TR/WCAG22/); [SPDX license identifiers](https://spdx.org/licenses/).
