# Security policy

## Status

P2P Offramp is pre-release, development-only software. **It is not approved for real funds.**
`ReleaseEnabled=0`, the default connection-origin allowlist is empty, no production registry or
trust root is approved, and no production escrow deployment exists. Do not use this software
with real assets.

## Supported versions

| Version | Supported |
|---|---|
| Unreleased development branches | Security reports accepted; no security support or fix timeline is promised |
| Any tagged release | None exists yet |

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**:

1. Use GitHub's private vulnerability reporting for this repository
   (repository **Security** tab → **Report a vulnerability**).
2. If that button is not available, open a public issue that says only
   "requesting a private security contact" — **no technical details, proof of concept,
   affected file names, keys or addresses** — and wait for a maintainer to reply privately.

Include, in the private report: affected commit SHA or branch, component, preconditions,
reproduction steps (local fixtures or a local chain only), impact, and any suggested fix.

Never include real private keys, seed phrases, wallet backups, personal data or real
counterparty information. Use synthetic keys and local test chains only.

No response-time commitment, bounty or safe-harbour terms have been accepted by the owner
yet. This document does not grant permission to test against third-party infrastructure,
public relays, public RPC providers or other people's wallets.

## Scope

In scope: escrow contracts in `contracts/`, TypeScript packages in `packages/`, the web app
in `apps/web/`, build/release tooling in `scripts/` and `.github/workflows/`.

Out of scope: third-party wallets, RPC providers, Nostr relays and hosting providers
(report those to their maintainers), and findings that require the user to disable the
application's documented safety defaults.

## Handling

Maintainers triage privately, assign a severity, prepare a fix with a regression test and
independent review, and publish an advisory once a fix is available. Open security findings
and release blockers are tracked in `docs/execution/` audit documents; see
`docs/execution/BLUE-TEAM-AUDIT-2026-11-15.md` for the current non-release disposition.
