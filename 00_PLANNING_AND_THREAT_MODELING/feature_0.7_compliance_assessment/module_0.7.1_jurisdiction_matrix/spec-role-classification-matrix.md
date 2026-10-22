# Operational role and control classification facts

## 1. Metadata

- **Specification ID:** LEGAL02
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Record actual control, custody, compensation and activity facts before jurisdiction-specific assessment. Prevent a shared repository label from hiding materially different publishers, hosts, liquidity providers, couriers, arbiters and payment processors.

## 3. Facts schema and authority

```typescript
interface RoleFactsV1 {
  version: 1;
  id: string;
  role: "publisher" | "host" | "relay-operator" | "matcher" |
    "liquidity-provider" | "payment-processor" | "courier" | "arbiter";
  controlsSpendingKeys: boolean;
  canRedirectEscrow: boolean;
  canChangeExistingTerms: boolean;
  handlesFiat: boolean;
  holdsPhysicalCash: boolean;
  receivesFees: boolean;
  setsCounterpartyTerms: boolean;
  selectsCounterparties: boolean;
  deploymentIds: readonly string[];
  jurisdictionsClaimed: readonly string[];
  evidencePaths: readonly string[];
  revision: number;
}
```

A participant may hold several roles, each with separate facts. Unknown facts are not coerced to false; an incomplete intake remains unassessed and cannot produce a finalized RoleFactsV1. Evidence distinguishes source/deployed authority from operator assertions. The basic core has external spending wallets and immutable escrow; optional fee/collateral/arbitration profiles need separate fact sets.

## 4. Classification workflow

For each operation, enumerate actors and collect control facts with technical evidence: keys, deployed bytecode/IDL, upgrade authority, signing policy, fiat accounts, cash custody, matching rules and compensation. Review facts for contradictions and attach LEGAL01 jurisdiction assessments rather than assigning a universal legal label. Hash the validated versioned facts through the release canonicalization policy and bind assessment references to that exact revision.

If code, governance, fee model, routing, physical custody or private-key authority changes, increment revision and invalidate affected jurisdiction entries. A title such as volunteer courier or neutral software publisher cannot override observed cash handling or control. Public release documentation discloses enabled roles and authority; private counterpart identities are not part of this public fact record. Avoid inferring legal entity/person identities from wallet addresses or pseudonyms.

## 5. Interfaces and failure recovery

`validateRoleFacts(input)` rejects unknown fields, missing boolean facts, unsafe revisions, unbounded strings and missing evidence references. IDs are 1..64 ASCII characters, at most 32 deployments/jurisdictions and 64 evidence paths per role. `diffRoleFacts(old,next)` emits changed operational fields and affected assessment IDs; it does not decide legal obligations. The assessment UI/report states unassessed whenever evidence is incomplete. No runtime chain privilege is granted by an accepted role record.

## 6. Threat assessment

Self-reported decentralization, undisclosed key shares, dummy reviewers and contract proxies can misrepresent control. Verify authority with deployed artifacts and signer arrangements, retain unresolved discrepancies and do not replace evidence with declarations. Legal/control facts may change without a source-code change, so periodic review and incident-triggered invalidation remain necessary. Publicly documenting role facts must not leak personal transaction details.

## 7. Verification and sources

Test multi-role actors, missing facts, contradictory key/control claims, proxy changes, fee additions, physical custody changes and unchanged code with changed operator facts. A new revision must invalidate assessment bindings while preserving old records for traceability. No pseudonym or null identity may auto-approve a role. Sources: [LEGAL01 matrix](spec-jurisdiction-requirements-matrix.md), [FINTRAC guidance](https://fintrac-canafe.canada.ca/guidance-directives/guidance-directives-eng), [administrative authority](../../feature_0.6_protocol_governance/module_0.6.1_change_control/spec-administrative-authority-model.md). Legal classifications remain jurisdiction-specific qualified-review outputs, not protocol facts.
