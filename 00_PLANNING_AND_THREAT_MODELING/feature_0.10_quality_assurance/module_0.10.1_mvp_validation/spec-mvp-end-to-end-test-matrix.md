# G24 MVP end-to-end validation

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Validate a recoverable standalone basic trade on EVM and Solana, with all optional privacy/proof/map/courier/arbitration packages absent. Tests use local/dev/test networks and fake fiat; no real payment or mainnet secrets enter automated tests.

## 3. Architecture and data contracts

TestCase record: `{id,requirement,chain,asset,wallet,browser,device,locale,routeMode,initialState,faults,steps,expectedAuthority,expectedUi,evidence}`. Record exact wallet/browser/OS versions and device hardware at execution. Target list includes Chromium/Firefox/WebKit automation plus physical Android and iPhone/iPad wallet handoff, keyboard, VoiceOver/TalkBack and 320px/400% zoom. A support claim requires an actual passing combination; unsupported combinations are visible and cannot sign.

## 4. Algorithms and lifecycle

Journeys: onboard → backup/restore verification → wallet connect → create/discover/accept canonical terms → seller funds → finalized funding → exchange encrypted payment instructions → simulated buyer fiat payment → seller release before chain deadline → finalized receipt/export. Separate journey: seller withholds, deadline passes, any caller triggers refund solely to seller. Run native and each allowlisted ERC-20/SPL configuration independently. Adversarial rows: wrong network/account, stale revision/quote, malicious amount/recipient, allowance mismatch, duplicate funding, token transfer failure, disallowed token extension, expiry-1/equality/+1, dropped/replaced/reorged/expired transaction, RPC split view, relay duplicates/offline, encrypted message tampering and unknown broadcast. Restart at every journal transition; reconcile authoritative chain state before enabling another submission.

## 5. Interfaces and integration

Use deterministic adapter fault injection for timing and protocol errors, plus real test-network/wallet integration for actual serialization/signature/handoff. Capture sanitized event timeline, source/artifact hashes and chain transaction identifiers only in explicit test evidence. Assert visible seller-withholding warning before buyer payment, no fiat-finality claim from chat/screenshot/proof, no optional-provider request in core-only build, and no direct connection when G05 strict routing is unsupported. Cross-origin restore must create fresh G03 data keys while recovering records and pending intents.

## 6. Errors, abuse and residual threats

A failed invariant, unexplained console/network secret leak, unresolved critical/high finding or untested mandatory wallet/chain is a release blocker. TIMEOUT does not mean transaction failure; test reconciliation after delayed inclusion. Automation cannot substitute for physical camera, deep-link, background eviction or assistive technology validation. Fixtures must never teach production to bypass validation.

## 7. Verification and primary references

Evidence includes per-row results, testnet receipts, screenshots/accessibility observations, network capture showing route policy, crash checkpoints and independent reviewer signoff. Repeat only affected rows after bounded changes, then complete the final core-only regression at the signed artifact. No row is passed by this document; implementation, target execution and independent review remain pending.

Primary references (exact implementation revisions must be pinned in the evidence record): [Playwright browsers](https://playwright.dev/docs/browsers); [WCAG 2.2](https://www.w3.org/TR/WCAG22/); [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193).
