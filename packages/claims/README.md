# Scoped privacy claim descriptions

`PrivacyClaimV1` is the canonical DATA02 description. `CLAIM_CATALOG` is the maintained, deliberately small implementation inventory; its local source/test references are not semantic acceptance or crypto approval. Documentation stores the canonical records once. `CLAIM_COPY_BINDINGS` maps those IDs to actual UI source-catalog keys; `claimCopyText` reads their detached text using descriptors without evaluating accessors. These consistency bindings grant no display or review authority. `projectClaimsRegister` derives the 0.12.7 editorial projection without a second editable text or limitation list.

`claimFor` returns absent or downgraded descriptions by default. `canDisplayTestedClaim` requires an explicitly injected maintained trust seam, a current exact source/evidence/profile scope, and current coverage. The seam must compare the **entire canonical claim**, source revision, evidence digest and current runtime profile against maintained review evidence, and must invalidate on any change. Never construct it from imported reviewer strings, timestamps, provider self-attestations or documentation hashes. No default trusted seam, approved record, economic authority, route authority or release gate exists here. A malicious application composition can of course replace its own trust callbacks; deserialized input cannot grant that authority.

Inputs are detached, frozen, plain records with bounded UTF-8, lists, identifiers and paths. Byte parsing reuses the shared strict JSON parser, including duplicate-key/depth/size rejection.

## Current evidence and copy

Both display APIs require the current documentation validator's two freshness lists. Pass `report.stale` as `staleEvidencePaths` and `report.staleClaims` as the final argument:

```ts
canDisplayTestedClaim(claim, scope, trust, report.stale, report.staleClaims);
claimFor(claims, capability, scope, trust, report.stale, report.staleClaims);
```

An unchanged evidence file does not make a claim current when its bound UI copy changed. Either a matching evidence path or a matching claim ID refuses tested display; lookup preserves the description but downgrades it to `proposed` with `reviewedAt: null`. Missing, malformed, sparse, accessor-backed or oversized lists also refuse tested display. The bounds match the validator: 128 evidence rows plus the copy source, and 64 claim IDs. Entries are detached through own data descriptors, so supplied array methods and accessors cannot suppress a stale match.

This intentionally tightens the API: old calls that omit either freshness list no longer grant tested status. Empty lists must come from a successful current validation, not replace a missing or failed check. Freshness is a veto, not approval; the maintained trust, exact scope, canonical-content verification and final currentness recheck are still required. No default application composition or approved claim is added.
