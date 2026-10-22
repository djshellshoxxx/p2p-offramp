# Sybil and counterparty collusion threat model

## 1. Metadata

- **Specification ID:** TH05
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Separate valid cryptographic identities from unique humans and honest counterparties. The basic protocol has no proof of personhood and no reputation-based release authority. Anonymous reputation and jury mechanisms are optional later capabilities.

## 3. Architecture and observation matrix

| Adversary action | Basic mitigation | Residual risk |
|---|---|---|
| Create many signing keys | Bounded local ingestion and relay limits | Identities remain cheap; not unique humans |
| Self-trade to gain reputation | No core reputation scoring/settlement privilege | Later scoring needs its own economics |
| Flood valid advertisements | Bounded size/count/expiry; local blocking | Censorship/availability and relay collusion remain |
| Colluding buyer/seller history | Treat history as claims unless independently verified | Authentic history may still be wash trading |
| Malicious fiat-paid claim | Seller alone releases before timeout | Seller may still withhold after actual fiat receipt |

No event signature, membership proof or nullifier is a general proof of honesty or noncollusion.

## 4. Required algorithms and invariants

Verify event authenticity and scope before processing, then apply independent resource limits. The same logical order ID cannot overwrite incompatible terms silently; a signed update must follow its version/lifecycle rule. Client blocks are local preferences, not a global blacklist. Blocking never deletes the recovery path for a funded trade or hides refund deadlines. Core disables all score-dependent fund release, whitelisting of contract destinations, and automatic trust based on relay popularity. Future anonymous reputation must bind action domains and consume nullifiers using the separately approved protocol; no ad hoc identity-counting heuristic is permitted as Sybil resistance.

No new cryptographic primitive or ZK circuit is defined in this threat model.

## 5. Interfaces and failure recovery

Define adversarial fixtures by actor key, order IDs, event sizes, signed terms and timing; never by inferred real-world identity. Local moderation decisions use exact validated public identity/event references inside the encrypted preference store. Export/report requires explicit user action and data minimization; no automatic account/address uploads. A flood-limited result is `LIMIT_EXCEEDED`, not a claim that a user is fraudulent. The relay resilience spec determines operational buffer/concurrency caps before implementation.

## 6. Threat assessment

An attacker can pay fees or create apparently normal history; neither cost nor signatures alone establish unique counterparties. Proof systems enforce their specified relation, while issuer/group administrator trust remains. Arbitrators may collude; they are absent from basic funded escrow. Social reports can be weaponized to censor honest users. Preserve chain exits and evidence boundaries even for locally blocked contacts.

## 7. Verification and references

Generate thousands of distinct valid identities and duplicated/conflicting offers under bounded harness budgets. Assert deterministic deduplication, bounded queues and continued access to funded-trade recovery. Test a blocked seller still appearing in an existing trade timeline; no signing or release authority changes. Test valid signatures carrying fake reputation scores and forged issuer references: they must not gain privilege. Optional modules must rerun the basic core-only suite.

Normative project dependency: [development roadmap](../../../DEVELOPMENT_ROADMAP.md). See G01–G06 for key, vault, backup, content, transport and dependency enforcement. Threat models define required properties; passing fixtures is not a whole-product security certification.
