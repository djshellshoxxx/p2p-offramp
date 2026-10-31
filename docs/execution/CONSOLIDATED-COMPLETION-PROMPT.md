# Consolidated completion prompt

Continue `p2p-offramp` from local intake `8ff3d28`. The user authorizes consolidation
of all unmerged compatible work, completion of unfinished features that need no
human input, and a whole-repository code audit. The user explicitly requires
trading to remain disabled. This is the execution contract for the consolidated
pass; the earlier autonomous prompt records the preceding local-only pass.

1. Inventory every published remote head and local-only work. Preserve source,
   history and evidence through ancestry-preserving integration. Resolve semantic
   conflicts against the normative client-only, noncustodial architecture. Keep
   the incompatible custodial ledger separate and record absent unpublished
   objects honestly. Keep different deployed escrow ABIs explicitly separate.
2. Inspect actual source and owner lean scope before choosing unfinished work.
   Finish fresh-key messaging identity adoption without changing keys, silently
   unlocking, or granting signing authority. Preserve legacy encrypted records.
3. Prove the canonical local acceptance path end to end: native signed discovery,
   real NIP-17/44/59 exchange, exact locally reviewed bytes, both acceptances,
   G12 durable send markers, canonical native escrow funding, release/refund and
   authoritative native reconciliation. Use an in-process relay boundary and
   private loopback Anvil only, with documented worthless test keys. Include
   altered terms/replay/unknown-result failure paths. Never treat a relay message
   or restored journal string as chain authority.
4. Audit every executable first-party source after integration: schemas, domain,
   storage/crypto/backup/migration, identity/wallet, transport/relay/exchange,
   browser runtime/UI, release verification, build/dependencies/CI, contracts and
   native tooling. Divide coverage among independent reviewers. Reproduce and
   fix actionable issues, add meaningful regressions, and independently review
   fixes and the final acceptance harness.
5. Run appropriate unit/type/build/boundary/spec/browser/native-chain checks using
   the real pinned toolchain. Record exact counts and limits. Publish a reviewable
   integration branch and PR, qualify the exact head in hosted CI, and merge only
   when existing gates permit. Never weaken a security gate, fabricate approval,
   select production trust keys, deploy, spend funds or enable wallet submission
   in the shipped app. Maintain `ReleaseEnabled=0` and `connectOrigins:[]`.
6. Report delivered behavior, ancestry/exclusions, audit findings and resolutions,
   concrete verification, hosted merge status and remaining external/deferred
   gates. Do not call the complete product or a real-funds release finished.

Current evidence and results belong in
[the consolidated audit](CONSOLIDATED-AUDIT-2026-10-30.md) and
[the original-head inventory](CONSOLIDATED-ANCESTRY-2026-10-30.json).
