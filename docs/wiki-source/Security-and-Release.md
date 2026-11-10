# Security and release verification
**Status: not released.** ReleaseEnabled is 0. Trading is disabled in every build. No real-funds readiness is claimed. Offline signed release verification and test-only wallet execution exist. Still open: approved live trust and bootstrap, qualified deployments, and independent audit. The escrow package has no recorded Forge fuzz suite, Slither result or external audit (see [packages/escrow-evm README](../../packages/escrow-evm/README.md)).

Never deploy to real funds before escrow invariant tests, fuzzing, browser and mobile compatibility testing, threat-model review, dependency/license review and independent audit. Require signed release manifest and deployed bytecode checks. Explicitly document fiat finality, dispute authority, custody and metadata leakage.

Manual settlement: the crypto seller funds escrow; the buyer pays fiat outside the app; only the seller can release crypto, and a dishonest seller can withhold release. At expiry the crypto refunds to the seller. No fiat proof or jury is part of the basic escrow.

No-script portal is read-only; it cannot safely substitute for client-side signing. Public documentation must distinguish planned features from shipped and audited features. See [Milestone Status](Milestone-Status.md). Report vulnerabilities privately using the repository's published security disclosure process when available.
