# P2P-offramp current implementation and remaining work — 2026-10-27

**Headline: approximately25–45% implemented for the agreed lean EVM release scope;55–75% remaining.** Low-to-medium confidence engineering estimate, not a measured fraction of future coding hours, a promise or production readiness. The app is an offline encrypted-profile/recovery foundation; no complete two-party custody trade is demonstrated. Largest gaps: noncustodial escrow/native chain observation (very high); trust→wallet send→journal reconciliation (high/very high); offer exchange and connected trade UI (high).

## Fixed snapshot and scope

Committed assessment source **9ec33bc3a0e8e35eb764a2a356ffef165bd8913b**, tree200e69c40f80372e1a99361563ed96debd7cd86c, branchwork/p2p-restore-commit-reconciliation-test-2026-10-26. It includes source465ea63d5391bfd924f12bf8aa5d22119d1e6ede and following documentation. Remote refs were not refreshed. This updates the SAME P1–P25 inventory from docs/reviews/FEATURE_GAPS_2026-10-26.md (prior source267df7da83af8d6b5b317a4245b3a8feffc96ce9); no new master plan. Unchanged rows inherit that review's depth, not a new exhaustive audit. A previous scored1908249snapshot/method is historical and not compared as progress/regression.

Later HOST07 work has2newfiles+one modified private fixture in the working tree and receives NO completion credit here. Current pending source hashes below are identifiers, not part of the committed scored snapshot. In that pending work,60focused/454aggregate/5policy/typesbuild and Chromium238assertions/document+Worker pass, but check:boundaries still fails1CROSS_PACKAGE_PRIVATE_IMPORT ofschemas/src/evm-agreement-protocol.ts. Original focused run has an unverified terminal outcome after a harness stall. Do not call HOST07integrated/fullyqualified or transfer its passed counts to this committed report. Existingprivateprotocol206browserassertions and fuzz4096cases remain source-bound historical evidence.

Both client-side/noncustodial architecture and ReleaseEnabled0/connectOrigins[] remain fixed. External chainRPC/peer/relay/smart-contract infrastructure is separate from an app-owned backend. No spend/livewallet/networkenablement, deployment or approved financial/trust policy is inferred.

## How the range is reproduced

Use the17implementation-capability rows with nonzero weights below (100assessmentpoints). Weights express the lean product critical path: escrow12,connectedUI9,wallet8; lower weights for auxiliary distribution/QR/docs. They are declared judgment weights, NOT canonical spec percentages or predicted engineering effort. Apply each row's current code-implementation interval: total=sum(weight×implementation%)/100=27.55–41.85%; round OUTWARD to5point boundaries→25–45%. Remaining=100−completion→55–75%. We do not average old percentages or count tests/files/specs as code. Prototype/library code gets partial credit; app-wired behavior gets more. Ordinary missing wiring remains engineering work even when production trust choices are pending.

P22end-to-endacceptance andP24audit/operations are reported separately with0codeweight, avoiding duplicate credit for building the same trade journey and later testing/auditing it. P20/P21/P23/P25 retain their distinct implementation requirements; P6trust vsP23distribution andP2backup vsP21QR are not double-counted. This denominator is the named lean release product, NOT all optional roadmap phases or an assertion every normative subclause was counted. Percentages for individual grouped features are deliberately broad; complete child-module work quantities remain unassessed.

**Release qualification is separate: not passed.** Zero complete two-party custody trade paths demonstrated; required custody/independent enabled-build audit, supported-device/wallet, trust/deployment and release signoffs remain open. Remaining audit/security effort% is unknown because enabled-system scope and findings do not yet exist. No implementation average makes a failed required gate acceptable.

## Lean feature table

E=ordinary engineering/review; A=required owner choice/permission,platform access or accountable external review. Gates column names the actual distinction; it does not label the whole feature owner-blocked. Paths are relative to the fixed repository snapshot. Percent remaining is implementation unless explicitly called acceptance/unknown.

| Feature | Implemented / exercised | Remaining and largest gap | Difficulty / reason | Gates | Evidence |
|---|---|---|---|---|---|
| P1. Encrypted vault/profiles G02 | Encrypted IDB, exact-envelope CAS, bounded profiles, create/unlock/inventory UI; native two-tab fixtures. | 10–25% — Supported-platform failure/recovery disposition. Cap16 stays intact. | High — durable local state under quota/interruption across supported browsers | Engineering; intended devices/browsers require access. | packages/storage/src/{vault-service,idb-vault-store}.ts; scripts/test-vault-browser.mjs |
| P2. Backup/fresh-profile restore/reseal/migration G03/G09 | Encrypted export/import, source-bound fresh-key reseal, interrupted restore reconciliation and restore→select→fresh-unlock UI exist. | 15–30% — Full crash/quota/cross-tab recovery matrix and migration disposition. Source never deleted as shortcut. | High — committed-but-unconfirmed outcomes and source retention | Engineering; human/device acceptance needs access. | packages/storage/src/{backup-service,migration-service}.ts; apps/web/src/ui/VaultForms.tsx; scripts/test-reseal-crash-browser.mjs |
| P3. Identity and purpose-scoped crypto G01/G06 | Purpose-bound private identity service/provider; public-data G16 digest/recovery fixtures and scoped review. | 40–65% — App wiring and secret signing/generation qualification; inventory has2accepted/4pending purposes. Public recovery review does not qualify secrets. | High — secret-bearing identity APIs need their own assurance | Engineering/reviewer evidence plus platform access; no inferred owner/provider approval. | packages/identity/src/{identity-service,noble-provider}.ts; security/crypto-inventory.json; docs/reviews/G06_UPSTREAM_REVIEW_2026-10-26.md |
| P4. Static client shell/Worker/rendering G04/G07 | React static shell, vault Worker bridge, safe rendering/CSP primitives, recovery forms and emitted-browser fixture. | 10–25% — Remaining composition/lifecycle and deployed framing/header proof. Trade pages scored separately, not twice. | Medium — emitted runtime and actual host protection must agree | Engineering; selected hosting/header verification is external. | apps/web/src/runtime/{app-runtime,worker-endpoint}.ts; apps/web/src/ui/Pages.tsx; packages/security/src/content-policy.ts |
| P5. State authority/errors/retries/extensions G08/G13/G14 | Authority/reducer, private journal diagnostic composition, revision/held-read/native-IDB cases, funded-payment fixture preflight and corrected thrown-clock/retry guards. | 30–50% — Real trade consumers/native observations, typed UI recovery and extension integration. Diagnostics are not a live state engine. | High — stale/unknown state must stay fail-closed when composed | Mostly engineering; actual chain/provider prerequisites elsewhere. | packages/domain/src/{authority,trade-composition,payment-preflight,errors,read-retry}.ts; docs/handoffs/P2P_COMPOSITION_BROWSER_2026-10-26.md; docs/handoffs/P2P_G13_RUNTIME_2026-10-27.md |
| P6. Signed registry/manifest trust G11/G15 | Exact-byte registry hash/parse/immutable lookup and negative fixtures. | 65–85% — Authenticated update/bootstrap trust and live deployment validation; validateLive absent. | High — hash equality alone is not trusted configuration | Engineering for fixtures/readers; actual trust root/deployments/assets need explicit choices. | packages/domain/src/registry.ts; packages/schemas/src/registry.ts; docs/handoffs/LEAN_RELEASE_SCOPE.md |
| P7. Network transport/privacy status G05/G23 | Default-deny broker, revocation/capability/request bounds. | 70–90% — Production driver, positive evidence issuer, streaming/redirect/socket limits and real routing. No working Nostr/Waku integration. | High — bounded network I/O and truthful route evidence | Engineering for disabled fixtures; endpoint/consent/trust choices before enablement. | packages/transport/src/policy.ts; packages/schemas/src/transport.ts |
| P8. EVM wallet authority/signing/submission G10 | Private EIP6963/EIP1193 discovery/adapter and hostile-provider fixtures. | 65–85% — App connection/consent/sign/send integration, registry/journal composition and wallet/device matrix. No submission UI. | High — account/chain/consent/session across wallet awaits | Engineering dependencies; live-wallet/device access and enablement permissions later. | packages/wallet/src/{discovery,evm-adapter}.ts; apps/web/src/app-services.ts |
| P9. Canonical signed terms/consistency G16 | Encoding, private commitments, independent EIP712/EOA known answers, complete private bundle verifier, bounded parser and strict private protocol; isolated Chromium parity. | 25–45% — Private host/real message lifecycle, narrow package boundary, app/consent/current-chain-time integration. EIP1271 unsupported unless later advertised. HOST07 is pending, not credited. | High — bind exact terms to current job/time/chain authority | Engineering/review first; scoped provider inclusion remains distinct from financial/trust decisions. | packages/domain/src/trade-terms.ts; packages/wallet/src/{evm-terms,evm-agreement}.ts; packages/schemas/src/evm-agreement-{input,protocol}.ts; docs/handoffs/P2P_PRIVATE_PROTOCOL_2026-10-27.md |
| P10. Durable intent journal/reconcile/retry G12 | Encrypted reservations/mark-sending/unresolved state and restart/terminal/reorg diagnostic composition fixtures. | 50–75% — Actual send/hash/chain-observation reconciliation, authoritative clearing/replacement and UI recovery. No automatic resend. | Very high — unknown outcomes cannot cause duplicate spend | Engineering for deterministic native evidence binding; provider/trust decisions before live operation. | packages/domain/src/{intent-journal,trade-composition}.ts; packages/schemas/src/intent.ts |
| P11. Noncustodial EVM escrow/settlement/readers G17/G18 | Canonical requirements/invariants; no implemented custody contract/trade path established in this checkout. State schemas are scored elsewhere. | 100% of executable custody path — Escrow contract, native/ERC20 accounting, ABI-backed observation, release/refund and direct recovery. | Very high — value conservation, expiry/refund and reorg authority | Substantial engineering; verified contract tooling/deployment/trust/funds permissions later. Foundry denial remains binding. | DEVELOPMENT_ROADMAP.md Phase2; 01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/; no tracked Solidity/Foundry runtime found |
| P12. Offers/relay exchange/private coordination G19–G21 | Specs and separately scored identity/transport foundations. | 100% of connected offer journey — Signed expiring offers, counterpart exchange/encryption, dedupe/reconnect/abuse and discovery UI. | High — two-party revision/replay/cancellation protocol | Engineering fixtures feasible; actual relay/transport policy choices before enablement. | DEVELOPMENT_ROADMAP.md; feature_1.4_order_discovery specs; apps/web/src/ui/Pages.tsx |
| P13. Connected trade/payment/recovery UI G22/G23 | Navigation includes offers/trade, but both are explicit unavailable routes. Generic shell credited inP4. | 95–100% — Trade state/amount/fee/expiry/risk screens, manual-payment claims, receipts and unknown-outcome timeline. | High — one coherent offer→fund→release/refund journey | Engineering after native lifecycle/contracts; rail/risk disclosures need applicable decisions. | apps/web/src/ui/{Pages.tsx,routes.ts,messages.ts}; DEVELOPMENT_ROADMAP.md |
| P20. Browser/mobile/wallet/a11y/localization | English responsive shell, accessible form primitives and local Linux/Chromium fixtures. | 75–95% — Declared support/refusal matrix, Safari/Firefox/mobile/wallet resume, real catalogs/RTL and accessibility acceptance. | High — representative devices, assistive technology and wallet resume | Engineering for support/UI; real devices/native-language reviewers are access gates. | security/browser-support.json; apps/web/src/ui/{VaultForms.tsx,messages.ts,app.css}; cross-device/localization specs |
| P21. Secure QR/interchange/scriptless recovery | Encrypted file backup fallback exists and is credited only inP2. | 100% of QR/portal-specific implementation — Typed QR decode/display/review, binding/replay/expiry controls and scriptless portal. No GhostPay QR code counted here. | Medium/high — bounded typed import plus explicit review | Engineering after admission to supported UI; no new sharing/trust policy assumed. | feature_0.12_product_completion QR/privacy-security specs; no qualified QR/portal module established |
| P22. Two-party EVM trade/recovery acceptance | Component/domain/native-IDB fixtures, not an end-to-end custody trade. | 100% of named complete-journey acceptance still unproven — Zero complete custody trade paths demonstrated; settlement/refund/unknown send/reload/reorg/direct recovery matrix. | Very high — fund→settle/refund and failure recovery in one system | Engineering P6–P13; verified local tools and later network/wallet permissions. | docs/handoffs/LEAN_RELEASE_SCOPE.md; DEVELOPMENT_ROADMAP.md Phase2 acceptance |
| P23. Reproducible distribution/update/origin recovery | Offline rebuild evidence, locked dependencies, emitted asset/graph/content policy and local checkpoint retention. | 60–85% of implementation; qualification separate — Signed distribution/rollback and real host/IPFS/origin recovery. Signature trust scored inP6, not twice. | High — signed updates/rollback and changed-origin recovery | Engineering; owner release key/origin/publication choices and authorization. | docs/evidence/g06-offline-repro-20261026.json; apps/web/scripts/build.mjs; deployment/rollback spec |
| P24. Independent security/operations/real-funds release | Scoped attributable AI reviews, bounded parser fuzz, source provenance/handoffs. No independent enabled-build/custody audit. | Unknown effort%; required acceptance remains open — Independent review/audit/findings closure, incident/support/rail-jurisdiction and explicit release permission. Cannot infer a security% from tests. | Very high — enabled custody system and audit scope do not yet exist | Engineering plus independent reviewers, accountable owner/operations and explicit later funds/deployment permissions. | docs/reviews/G06_UPSTREAM_REVIEW_2026-10-26.md; security/crypto-inventory.json; docs/handoffs/P2P_PARSER_FUZZ_2026-10-27.md |
| P25. User docs/attribution/supported claims | Substantial technical docs, recovery copy, reuse inventory, verified notices/provenance remediation and software-artwork descriptor. | 30–55% — User/release-bound claims manifest, docs/locale parity and full distributed-notice/remaining pin disposition. No legal clearance inferred. | Medium — match shipped journey, source and notices | Engineering/provenance work; license compatibility and owner operational claims remain separate. | docs/reviews/{FEATURE_GAPS_2026-10-26,REUSE_INVENTORY_2026-10-26}.md; attribution remediation; README.md |

## Preserved optional/post-lean features — outside overall denominator

These are the existingP14–P19groups, not newly cancelled work. Grouped review does not establish each child source's absence; no qualified integrated path is established. Do not count research candidates/specifications as implemented code.

| Existing feature group | Estimated qualifying implementation remaining | Difficulty / largest gap | Gate and next bounded later work |
|---|---|---|---|
| P14 Solana/SPL parity |95–100%; exhaustive child source unassessed|Very high — account/token-program/PDA/finality and custody parity|Engineering plus selected token-program/wallet/tool access; later native validation fixtures.|
| P15 Stealth/reputation/private pools |Unknown exact%; substantially all qualified integration unestablished|Very high — scheme/public-input/privacy/custody assurance|Explicit later scheme/issuer/root/pool choices; later capability-bound fixtures.|
| P16 Fiat/zkTLS proofs |95–100%; no working provider/rail integration established|Very high — authenticated freshness/replay is not fiat settlement|Provider/rail access and evidence trust choices; advisory-only fixtures later.|
| P17 Meetup/courier/locker |Unknown per module; no qualified product integration established|Very high — physical fraud/location privacy/hardware/custody|Field/hardware/operational consent and custody decisions; outside current implementation.|
| P18 Arbitration |95–100%; no qualified tribunal established|Very high — bounded appeal, incentives and escrow authority|Explicit opt-in economic/authority policy and separate custody review.|
| P19 Partial fills/liquidity/advanced messaging/growth |Unknown per feature; no qualified integrated capability established|High — selected protocol/UI/recovery differs by feature|Product admission after single-fill basic EVM trade; no combined speculative percentage.|

## Fresh versus retained evidence

CommittedFUZZ08source465ea63:26selftests passed;4096uniquev2generated/mutated cases(seed1592598566),1352valid+2744mutations/512perfamily; no parser counterexample. Quick256and replay81overlap deep corpus, not additional unique credit. Three reproduced harness defects corrected and originalREDs retained. Corpus labels are not measured branch coverage; no automatic shrinking/coverage-guided/full-security-audit claim. Earlier436rootaggregate/5policy/typesbuild/boundary passes and unchangedappgraphs are recorded with exact command snapshots. These counts explain evidence scope only; they add0numerical implementation points.

Source-bound later evidence updates the old gap report primarily forP2(restore→select→fresh-unlock join),P5(diagnostic composition/native cross-tab/revision and throwncallback fixes),P9(private bounded parser/protocol/browser qualification),P24(actual seeded test tooling) andP25(attribution remediation). They do not turn missing trading/UI/contracts into a finished product. Current app offers/trade pages explicitly renderUnavailablePage. RegistryService has exact hash/load/lookup but no validateLive; custody implementation/complete two-party flow is not established. No new root/compiler/Foundry/network/Library-download attempt was made for this report.

## Machine-readable weights, ranges and pending source identity

```json
{
  "assessedCommit": "9ec33bc3a0e8e35eb764a2a356ffef165bd8913b",
  "assessedTree": "200e69c40f80372e1a99361563ed96debd7cd86c",
  "branch": "work/p2p-restore-commit-reconciliation-test-2026-10-26",
  "priorReportSource": "267df7da83af8d6b5b317a4245b3a8feffc96ce9",
  "method": "judgment ranges over existing lean product capability groups; explicit weights; no test/file/spec-count credit; no effort/hour promise",
  "weightedImplementationRaw": [
    27.55,
    41.85
  ],
  "roundedImplementation": [
    25,
    45
  ],
  "roundedRemaining": [
    55,
    75
  ],
  "qualification": "not passed; no full custody trade demonstrated; total remaining assurance effort unknown",
  "pendingHostNoPercentageCredit": {
    "packages/wallet/src/evm-agreement-host.ts": "d83e7639b864cef03f2cb833a81b70153cbbf068259b9c7fb17883e40d8d9050",
    "packages/wallet/test/evm-agreement-host.test.mjs": "cc696c816013c5bd02274ed7cbcc970740b532a1672c030686332d9ee954930b",
    "scripts/fixtures/g16-browser.mjs": "4cbbb6283bf7c238b9e6133564f84a24813e808927efb5f4033d40b123270426"
  },
  "weights": {
    "P1": 6,
    "P2": 7,
    "P3": 5,
    "P4": 5,
    "P5": 6,
    "P6": 7,
    "P7": 6,
    "P8": 8,
    "P9": 7,
    "P10": 7,
    "P11": 12,
    "P12": 7,
    "P13": 9,
    "P20": 3,
    "P21": 2,
    "P22": 0,
    "P23": 1,
    "P24": 0,
    "P25": 2
  },
  "rows": [
    {
      "id": "P1",
      "feature": "Encrypted vault/profiles G02",
      "codeImplementationRange": [
        75,
        90
      ],
      "estimatedRemaining": "10\u201325%",
      "difficultyReason": "High \u2014 durable local state under quota/interruption across supported browsers",
      "implemented": "Encrypted IDB, exact-envelope CAS, bounded profiles, create/unlock/inventory UI; native two-tab fixtures.",
      "gaps": "Supported-platform failure/recovery disposition. Cap16 stays intact.",
      "gates": "Engineering; intended devices/browsers require access.",
      "evidence": "packages/storage/src/{vault-service,idb-vault-store}.ts; scripts/test-vault-browser.mjs"
    },
    {
      "id": "P2",
      "feature": "Backup/fresh-profile restore/reseal/migration G03/G09",
      "codeImplementationRange": [
        70,
        85
      ],
      "estimatedRemaining": "15\u201330%",
      "difficultyReason": "High \u2014 committed-but-unconfirmed outcomes and source retention",
      "implemented": "Encrypted export/import, source-bound fresh-key reseal, interrupted restore reconciliation and restore\u2192select\u2192fresh-unlock UI exist.",
      "gaps": "Full crash/quota/cross-tab recovery matrix and migration disposition. Source never deleted as shortcut.",
      "gates": "Engineering; human/device acceptance needs access.",
      "evidence": "packages/storage/src/{backup-service,migration-service}.ts; apps/web/src/ui/VaultForms.tsx; scripts/test-reseal-crash-browser.mjs"
    },
    {
      "id": "P3",
      "feature": "Identity and purpose-scoped crypto G01/G06",
      "codeImplementationRange": [
        35,
        60
      ],
      "estimatedRemaining": "40\u201365%",
      "difficultyReason": "High \u2014 secret-bearing identity APIs need their own assurance",
      "implemented": "Purpose-bound private identity service/provider; public-data G16 digest/recovery fixtures and scoped review.",
      "gaps": "App wiring and secret signing/generation qualification; inventory has2accepted/4pending purposes. Public recovery review does not qualify secrets.",
      "gates": "Engineering/reviewer evidence plus platform access; no inferred owner/provider approval.",
      "evidence": "packages/identity/src/{identity-service,noble-provider}.ts; security/crypto-inventory.json; docs/reviews/G06_UPSTREAM_REVIEW_2026-10-26.md"
    },
    {
      "id": "P4",
      "feature": "Static client shell/Worker/rendering G04/G07",
      "codeImplementationRange": [
        75,
        90
      ],
      "estimatedRemaining": "10\u201325%",
      "difficultyReason": "Medium \u2014 emitted runtime and actual host protection must agree",
      "implemented": "React static shell, vault Worker bridge, safe rendering/CSP primitives, recovery forms and emitted-browser fixture.",
      "gaps": "Remaining composition/lifecycle and deployed framing/header proof. Trade pages scored separately, not twice.",
      "gates": "Engineering; selected hosting/header verification is external.",
      "evidence": "apps/web/src/runtime/{app-runtime,worker-endpoint}.ts; apps/web/src/ui/Pages.tsx; packages/security/src/content-policy.ts"
    },
    {
      "id": "P5",
      "feature": "State authority/errors/retries/extensions G08/G13/G14",
      "codeImplementationRange": [
        50,
        70
      ],
      "estimatedRemaining": "30\u201350%",
      "difficultyReason": "High \u2014 stale/unknown state must stay fail-closed when composed",
      "implemented": "Authority/reducer, private journal diagnostic composition, revision/held-read/native-IDB cases, funded-payment fixture preflight and corrected thrown-clock/retry guards.",
      "gaps": "Real trade consumers/native observations, typed UI recovery and extension integration. Diagnostics are not a live state engine.",
      "gates": "Mostly engineering; actual chain/provider prerequisites elsewhere.",
      "evidence": "packages/domain/src/{authority,trade-composition,payment-preflight,errors,read-retry}.ts; docs/handoffs/P2P_COMPOSITION_BROWSER_2026-10-26.md; docs/handoffs/P2P_G13_RUNTIME_2026-10-27.md"
    },
    {
      "id": "P6",
      "feature": "Signed registry/manifest trust G11/G15",
      "codeImplementationRange": [
        15,
        35
      ],
      "estimatedRemaining": "65\u201385%",
      "difficultyReason": "High \u2014 hash equality alone is not trusted configuration",
      "implemented": "Exact-byte registry hash/parse/immutable lookup and negative fixtures.",
      "gaps": "Authenticated update/bootstrap trust and live deployment validation; validateLive absent.",
      "gates": "Engineering for fixtures/readers; actual trust root/deployments/assets need explicit choices.",
      "evidence": "packages/domain/src/registry.ts; packages/schemas/src/registry.ts; docs/handoffs/LEAN_RELEASE_SCOPE.md"
    },
    {
      "id": "P7",
      "feature": "Network transport/privacy status G05/G23",
      "codeImplementationRange": [
        10,
        30
      ],
      "estimatedRemaining": "70\u201390%",
      "difficultyReason": "High \u2014 bounded network I/O and truthful route evidence",
      "implemented": "Default-deny broker, revocation/capability/request bounds.",
      "gaps": "Production driver, positive evidence issuer, streaming/redirect/socket limits and real routing. No working Nostr/Waku integration.",
      "gates": "Engineering for disabled fixtures; endpoint/consent/trust choices before enablement.",
      "evidence": "packages/transport/src/policy.ts; packages/schemas/src/transport.ts"
    },
    {
      "id": "P8",
      "feature": "EVM wallet authority/signing/submission G10",
      "codeImplementationRange": [
        15,
        35
      ],
      "estimatedRemaining": "65\u201385%",
      "difficultyReason": "High \u2014 account/chain/consent/session across wallet awaits",
      "implemented": "Private EIP6963/EIP1193 discovery/adapter and hostile-provider fixtures.",
      "gaps": "App connection/consent/sign/send integration, registry/journal composition and wallet/device matrix. No submission UI.",
      "gates": "Engineering dependencies; live-wallet/device access and enablement permissions later.",
      "evidence": "packages/wallet/src/{discovery,evm-adapter}.ts; apps/web/src/app-services.ts"
    },
    {
      "id": "P9",
      "feature": "Canonical signed terms/consistency G16",
      "codeImplementationRange": [
        55,
        75
      ],
      "estimatedRemaining": "25\u201345%",
      "difficultyReason": "High \u2014 bind exact terms to current job/time/chain authority",
      "implemented": "Encoding, private commitments, independent EIP712/EOA known answers, complete private bundle verifier, bounded parser and strict private protocol; isolated Chromium parity.",
      "gaps": "Private host/real message lifecycle, narrow package boundary, app/consent/current-chain-time integration. EIP1271 unsupported unless later advertised. HOST07 is pending, not credited.",
      "gates": "Engineering/review first; scoped provider inclusion remains distinct from financial/trust decisions.",
      "evidence": "packages/domain/src/trade-terms.ts; packages/wallet/src/{evm-terms,evm-agreement}.ts; packages/schemas/src/evm-agreement-{input,protocol}.ts; docs/handoffs/P2P_PRIVATE_PROTOCOL_2026-10-27.md"
    },
    {
      "id": "P10",
      "feature": "Durable intent journal/reconcile/retry G12",
      "codeImplementationRange": [
        25,
        50
      ],
      "estimatedRemaining": "50\u201375%",
      "difficultyReason": "Very high \u2014 unknown outcomes cannot cause duplicate spend",
      "implemented": "Encrypted reservations/mark-sending/unresolved state and restart/terminal/reorg diagnostic composition fixtures.",
      "gaps": "Actual send/hash/chain-observation reconciliation, authoritative clearing/replacement and UI recovery. No automatic resend.",
      "gates": "Engineering for deterministic native evidence binding; provider/trust decisions before live operation.",
      "evidence": "packages/domain/src/{intent-journal,trade-composition}.ts; packages/schemas/src/intent.ts"
    },
    {
      "id": "P11",
      "feature": "Noncustodial EVM escrow/settlement/readers G17/G18",
      "codeImplementationRange": [
        0,
        0
      ],
      "estimatedRemaining": "100% of executable custody path",
      "difficultyReason": "Very high \u2014 value conservation, expiry/refund and reorg authority",
      "implemented": "Canonical requirements/invariants; no implemented custody contract/trade path established in this checkout. State schemas are scored elsewhere.",
      "gaps": "Escrow contract, native/ERC20 accounting, ABI-backed observation, release/refund and direct recovery.",
      "gates": "Substantial engineering; verified contract tooling/deployment/trust/funds permissions later. Foundry denial remains binding.",
      "evidence": "DEVELOPMENT_ROADMAP.md Phase2; 01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/; no tracked Solidity/Foundry runtime found"
    },
    {
      "id": "P12",
      "feature": "Offers/relay exchange/private coordination G19\u2013G21",
      "codeImplementationRange": [
        0,
        0
      ],
      "estimatedRemaining": "100% of connected offer journey",
      "difficultyReason": "High \u2014 two-party revision/replay/cancellation protocol",
      "implemented": "Specs and separately scored identity/transport foundations.",
      "gaps": "Signed expiring offers, counterpart exchange/encryption, dedupe/reconnect/abuse and discovery UI.",
      "gates": "Engineering fixtures feasible; actual relay/transport policy choices before enablement.",
      "evidence": "DEVELOPMENT_ROADMAP.md; feature_1.4_order_discovery specs; apps/web/src/ui/Pages.tsx"
    },
    {
      "id": "P13",
      "feature": "Connected trade/payment/recovery UI G22/G23",
      "codeImplementationRange": [
        0,
        5
      ],
      "estimatedRemaining": "95\u2013100%",
      "difficultyReason": "High \u2014 one coherent offer\u2192fund\u2192release/refund journey",
      "implemented": "Navigation includes offers/trade, but both are explicit unavailable routes. Generic shell credited inP4.",
      "gaps": "Trade state/amount/fee/expiry/risk screens, manual-payment claims, receipts and unknown-outcome timeline.",
      "gates": "Engineering after native lifecycle/contracts; rail/risk disclosures need applicable decisions.",
      "evidence": "apps/web/src/ui/{Pages.tsx,routes.ts,messages.ts}; DEVELOPMENT_ROADMAP.md"
    },
    {
      "id": "P20",
      "feature": "Browser/mobile/wallet/a11y/localization",
      "codeImplementationRange": [
        5,
        25
      ],
      "estimatedRemaining": "75\u201395%",
      "difficultyReason": "High \u2014 representative devices, assistive technology and wallet resume",
      "implemented": "English responsive shell, accessible form primitives and local Linux/Chromium fixtures.",
      "gaps": "Declared support/refusal matrix, Safari/Firefox/mobile/wallet resume, real catalogs/RTL and accessibility acceptance.",
      "gates": "Engineering for support/UI; real devices/native-language reviewers are access gates.",
      "evidence": "security/browser-support.json; apps/web/src/ui/{VaultForms.tsx,messages.ts,app.css}; cross-device/localization specs"
    },
    {
      "id": "P21",
      "feature": "Secure QR/interchange/scriptless recovery",
      "codeImplementationRange": [
        0,
        0
      ],
      "estimatedRemaining": "100% of QR/portal-specific implementation",
      "difficultyReason": "Medium/high \u2014 bounded typed import plus explicit review",
      "implemented": "Encrypted file backup fallback exists and is credited only inP2.",
      "gaps": "Typed QR decode/display/review, binding/replay/expiry controls and scriptless portal. No GhostPay QR code counted here.",
      "gates": "Engineering after admission to supported UI; no new sharing/trust policy assumed.",
      "evidence": "feature_0.12_product_completion QR/privacy-security specs; no qualified QR/portal module established"
    },
    {
      "id": "P22",
      "feature": "Two-party EVM trade/recovery acceptance",
      "codeImplementationRange": null,
      "estimatedRemaining": "100% of named complete-journey acceptance still unproven",
      "difficultyReason": "Very high \u2014 fund\u2192settle/refund and failure recovery in one system",
      "implemented": "Component/domain/native-IDB fixtures, not an end-to-end custody trade.",
      "gaps": "Zero complete custody trade paths demonstrated; settlement/refund/unknown send/reload/reorg/direct recovery matrix.",
      "gates": "Engineering P6\u2013P13; verified local tools and later network/wallet permissions.",
      "evidence": "docs/handoffs/LEAN_RELEASE_SCOPE.md; DEVELOPMENT_ROADMAP.md Phase2 acceptance"
    },
    {
      "id": "P23",
      "feature": "Reproducible distribution/update/origin recovery",
      "codeImplementationRange": [
        15,
        40
      ],
      "estimatedRemaining": "60\u201385% of implementation; qualification separate",
      "difficultyReason": "High \u2014 signed updates/rollback and changed-origin recovery",
      "implemented": "Offline rebuild evidence, locked dependencies, emitted asset/graph/content policy and local checkpoint retention.",
      "gaps": "Signed distribution/rollback and real host/IPFS/origin recovery. Signature trust scored inP6, not twice.",
      "gates": "Engineering; owner release key/origin/publication choices and authorization.",
      "evidence": "docs/evidence/g06-offline-repro-20261026.json; apps/web/scripts/build.mjs; deployment/rollback spec"
    },
    {
      "id": "P24",
      "feature": "Independent security/operations/real-funds release",
      "codeImplementationRange": null,
      "estimatedRemaining": "Unknown effort%; required acceptance remains open",
      "difficultyReason": "Very high \u2014 enabled custody system and audit scope do not yet exist",
      "implemented": "Scoped attributable AI reviews, bounded parser fuzz, source provenance/handoffs. No independent enabled-build/custody audit.",
      "gaps": "Independent review/audit/findings closure, incident/support/rail-jurisdiction and explicit release permission. Cannot infer a security% from tests.",
      "gates": "Engineering plus independent reviewers, accountable owner/operations and explicit later funds/deployment permissions.",
      "evidence": "docs/reviews/G06_UPSTREAM_REVIEW_2026-10-26.md; security/crypto-inventory.json; docs/handoffs/P2P_PARSER_FUZZ_2026-10-27.md"
    },
    {
      "id": "P25",
      "feature": "User docs/attribution/supported claims",
      "codeImplementationRange": [
        45,
        70
      ],
      "estimatedRemaining": "30\u201355%",
      "difficultyReason": "Medium \u2014 match shipped journey, source and notices",
      "implemented": "Substantial technical docs, recovery copy, reuse inventory, verified notices/provenance remediation and software-artwork descriptor.",
      "gaps": "User/release-bound claims manifest, docs/locale parity and full distributed-notice/remaining pin disposition. No legal clearance inferred.",
      "gates": "Engineering/provenance work; license compatibility and owner operational claims remain separate.",
      "evidence": "docs/reviews/{FEATURE_GAPS_2026-10-26,REUSE_INVENTORY_2026-10-26}.md; attribution remediation; README.md"
    }
  ],
  "sourceReviewLimits": "Reuses priorP1\u2013P25 gap inventory, latest affected handoffs and named entrypoints; no fresh exhaustive child-spec/security audit; remote refs not refreshed; absent private tasks/plan.md is not claimed recovered"
}
```
