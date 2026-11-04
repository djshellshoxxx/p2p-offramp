# Completion decision reconciliation

This is a source-observed reconciliation of the ten topics named by the completion
plan, not ten newly approved ADRs. The normative [client-side ADR](../../adr/ADR-CLIENT-SIDE-2026-10-24.md)
and [roadmap](../../../DEVELOPMENT_ROADMAP.md) retain their authority. This record
does not supersede them, choose a business operator or grant release approval.
Source and specification identities are frozen in the adjacent
[G24 source inventory](../acceptance/g24-coverage.json). Its `sources` entries are
the observed working bytes, including an explicit dirty snapshot; old execution
receipts retain their own scope. Changes require affected references to be reviewed
again. Reviewers and approved release are unset in this packet.

The topic identifiers below match the requested ADR-001 through ADR-010 list;
they are index labels, not a second ADR numbering system. An existing normative
decision is distinguished from an unresolved deployment or business choice.

## ADR-001 — Escrow and dispute authority

**Recorded boundary.** Roadmap decisions 1, 2 and 6 and the actual canonical
`contracts/evm/src/BasicEscrow.sol` provide seller release strictly before the
chain deadline to the bound buyer; anyone can trigger refund at or after the
deadline solely to the bound seller. Terminal payout failure records credit for
the same immutable beneficiary. No app operator, oracle, jury, upgrade, pause or
destination override exists in this contract. Off-chain acceptance is client
consent; the canonical ABI does not verify both acceptance signatures. The
existing [G16 pending decision](../../governance/PENDING-DECISIONS.md) remains open.

**Alternatives and threat tradeoffs.** A privileged operator or arbitration path
could change settlement outcomes but adds trusted custody authority. Automatic
fiat-proof settlement changes the evidence and liveness model. Both require
separate specified versions; neither is secretly added to basic escrow. A seller
can receive fiat and withhold release; no software warning removes that risk.

**Consequences and reversal.** Preserve canonical ABI, trade IDs and original
deployment recovery. A stronger protocol requires an independently reviewed new
immutable deployment and explicit consent on new terms. Never migrate authority
over already-funded trades. Accountable owner: escrow/protocol maintainer;
independent security reviewer is required before enabled deployment. Next action:
resolve the existing acceptance-versus-ABI packet, then test compatible old/new
clients and exact deployed bytecode; this document makes no selection.

## ADR-002 — Fiat settlement evidence trust

**Recorded boundary.** The roadmap manual-settlement decision and G17/G30 keep
fiat receipt separate from crypto finality. Chat, screenshots, user attestations
and authenticated receipt content cannot establish irreversible fiat settlement.
The seller alone decides the basic pre-expiry release. Finalized crypto funding
and G18 chain-time guidance precede any buyer payment instruction.

**Alternatives and threat tradeoffs.** A bank/notary/proof provider may authenticate
a precisely defined observation, with issuer, parser, freshness, revocation and
chargeback assumptions. A centralized settlement operator adds different legal,
privacy and custody risks. Neither solves adversarial finality by its name.
The existing [proof profile intake](../profiles/01-proof.md) records missing choices.

**Consequences and reversal.** Keep proof output advisory until a separately
reviewed rail/source/notary/authorization policy exists. Bind any future capability
only into new unfunded terms; preserve manual exits for old trades. Accountable
owner: fiat-evidence policy maintainer with rail/security reviewers. Next action:
select the actual rail and exact observation/finality semantics in the existing
packet, then obtain scoped interoperability and adversarial evidence. No rail,
provider or settlement authority is approved here.

## ADR-003 — Jurisdictions and payment rails

**Unresolved choice.** The [assurance packet](../assurance/README.md), empty
`role-facts.json` and `jurisdiction-matrix.json` deliberately do not invent an
operator, jurisdiction, fiat handler, fee recipient or approved payment rail.
Static source properties do not settle legal applicability.

**Alternatives and threat tradeoffs.** Software-only publication, operating relay
or order services, collecting fees, handling fiat/cash, and controlling a separate
deployment are distinct operational facts. Treating all as one exemption hides
regulatory, consumer, sanctions and privacy obligations; claiming universal
licensing would likewise be unsupported. Payment rails have separate reversibility
and evidence policies.

**Consequences and reversal.** Accountable owner: the actual future operator,
currently unspecified, with qualified jurisdiction/rail counsel. Next action:
complete source-backed LEGAL02 role facts and jurisdiction scope using existing
schemas, then obtain a current scoped assessment. Any role/fact revision
invalidates affected assessments and advertised availability. Restrict or remove
new offers for an affected unsupported profile while preserving original exits;
do not claim a legal exemption or approve a rail from this document.

## ADR-004 — Identity and optional anonymity

**Recorded boundary.** G01 key separation and the client-side ADR keep spending
authority in external wallets and separate messaging/storage purposes. The core
has no app-owned user-account database. Public discovery reveals agreed metadata;
NIP-44/17/59 protect new private message content, not all traffic metadata. NIP-04
is disabled for new conversations. Alias or encryption is not verified identity
or a promise of anonymity.

**Alternatives and threat tradeoffs.** Reusing spending keys across messaging and
storage increases correlation and compromise impact. Central account/KYC services
add data collection and recovery authorities. Fully ephemeral messaging loses
offline reliability and cannot guarantee deletion from recipients or relays.
Production wallet-to-messaging identity binding remains an explicit peer-carrier
decision in the existing governance packet.

**Consequences and reversal.** Keep purpose boundaries and authenticated historical
records; no hidden identity provider. Accountable owner: identity/protocol
maintainer. Next action: resolve the production peer identity/carrier contract and
test impostor/replay/recovery cases. Future opt-in identity requirements need
explicit data lifecycle, consent, new-profile compatibility and fresh-key recovery;
they cannot retroactively relabel old identities or authorize existing escrows.

## ADR-005 — Transport and spam defense

**Recorded boundary.** Roadmap transport honesty and G05 distinguish direct,
enforced-private, unsupported and unknown routing. Strict unsupported routing
refuses without a direct fallback. Browser policy cannot prove an external
wallet's routing. G21 relay bounds and local UI quotas are resource controls;
five offers/minute, ten candidates/minute and one admitted import/crypto job are
not network Sybil defenses or user identity.

**Alternatives and threat tradeoffs.** Direct routing reveals endpoint/IP metadata.
A native Tor/I2P companion changes the trusted component and availability model;
a label or configured proxy URL cannot establish enforcement. External CAPTCHA
or fingerprinting adds tracking and accessibility risk and is not selected.
The existing [Tor](../profiles/06-tor.md) and [relay allocation](../profiles/03-relay-allocation.md)
packets retain the missing profile decisions.

**Consequences and reversal.** Quotas must preserve reads/recovery and retain
physical admission until cancelled native work drains. Accountable owners:
transport and abuse-control maintainers. Next action: independently qualify the
actual enforcing component/route channels and captured failure paths before any
private-route claim. Revoke affected leases/capabilities on policy change; require
explicit revalidation. Never silently downgrade a strict user's route.

## ADR-006 — Hosting and origin trust

**Recorded boundary.** The client-side ADR selects React/TypeScript/Vite static
assets plus a native Worker, not an app server. G15 verifies a release against an
independently maintained trust root; replacing same-origin key plus signature is
not bootstrap. IndexedDB is origin-scoped. Scriptless portal source, local
two-pass staging and two-origin fixtures are engineering evidence, not live host
qualification. The maintained key is currently unset; funds remain disabled.

**Alternatives and threat tradeoffs.** Mutable HTTPS hosts, IPFS/CID gateways and
offline copies have different availability, executable-origin and update risks.
Next.js static export is a documented alternative needing a new architecture
decision, not a second maintained frontend. Pages header limitations cannot be
resolved by assuming an ignored `_headers` file is enforced. An app-owned dynamic
backend conflicts with the normative boundary.

**Consequences and reversal.** Accountable owner: release maintainer and actual
host operator, with independent trust/distribution review. Next action: resolve
the existing G15 policy, original deployment and hosting/witness records. Preserve
old compatible complete recovery artifacts and authenticate changed origins
independently; restore with fresh keys. Rollback cannot lower an accepted trust
sequence or change original escrow exits. Unsigned staging cannot approve a host,
archive/CID format, key rotation, publication or new funding.

## ADR-007 — Encrypted backup

**Recorded boundary.** G02/G03 and the actual vault/backup services require
authenticated encrypted private persistence and fresh-key restore into a separate
profile. A checksum/export/unlock is not proof that a current complete backup was
authenticated or retained off-device. The current-backup fact is Worker-owned and
bound to exact profile/revision/session; restoring requires new verification.

**Alternatives and threat tradeoffs.** Plaintext backups disclose secrets. Seed
transport conflates spending/messaging/storage recovery. Cloud account recovery
introduces another custodian and is not core. Public fingerprints can detect a
change only with a trusted comparison; they do not grant a download capability.
An unlocked same-origin malicious script and loss of all copies remain risks.

**Consequences and reversal.** Accountable owner: storage/recovery maintainer.
Next action: retain exact schema/crypto vectors and independently exercise complete
current-file authentication, cross-origin restore and pending-intent reconciliation.
Any format/crypto change needs versioned readers, downgrade refusal, independently
reviewed migration and preserved original recovery. Never overwrite the source or
silently reinterpret unknown consumer records. No support contact may request a
seed or passphrase.

## ADR-008 — External wallets and mobile

**Recorded boundary.** Spending authority remains in explicit external wallets.
Wallet discovery is not automatic connection or permission. Account/network,
deadline, native state and unresolved journal intents are revalidated on return;
a deep link or wallet response is not finality. Capability probes are distinct
from tested compatibility. Current local browser/native fixtures do not certify
physical wallets or Solana support.

**Alternatives and threat tradeoffs.** In-app spending keys increase secret and
custody exposure. Injected providers and mobile session connectors have different
permissions, return-origin, expiry and relay trust. A wallet name alone supplies
none of those properties. Existing [mobile intake](../profiles/05-mobile.md)
retains the unselected connector/session profile.

**Consequences and reversal.** Accountable owner: wallet/compatibility maintainer;
physical device reviewer must record exact hardware/OS/browser/wallet versions.
Next action: choose the real connector profile, then test cancellation, lock/app
switch, expiry, disconnect, storage loss and manual fallback on each advertised
combination. Disable unsupported signing paths while keeping read/export/recovery;
on connector replacement invalidate sessions and reconcile pending native state,
never auto-resubmit. Do not retroactively certify an emulated device.

## ADR-009 — Optional advanced privacy

**Recorded boundary.** Roadmap decisions 3–6 and G14 make proof/reputation,
stealth, privacy routing, maps/couriers and arbitration optional. Core-only trade
and original exits cannot require them. An extension can affect only new terms
that bind its exact capability/version/policy; later installation cannot gain
authority over funded basic trades.

**Alternatives and threat tradeoffs.** A monolithic mandatory provider graph adds
availability, privacy and upgrade failure coupling. Automatically inferring
interoperability from a generic protocol name hides actual encoding, custody and
identity choices. The eight existing provider/profile packets already record those
choices; offline mathematical or synthetic lifecycle comparisons are bounded
engineering results, not enabled profiles.

**Consequences and reversal.** Accountable owner: each capability maintainer plus
the extension-contract maintainer. Next action: resolve only the exact applicable
profile and obtain independent native/provider/crypto evidence before advertising
it. Keep disabled descriptors truthful. Removal or revocation blocks new use,
preserves original compatible exits and recovery, and triggers affected plus final
core-only regression. This reconciliation does not pin actively changing optional
T58/T59/T61 work as final or claim broad M3–M6 completion.

## ADR-010 — Monetization and fees

**Recorded boundary and unresolved choice.** The actual canonical BasicEscrow
accounts for exact principal to its immutable beneficiary; it has no protocol-fee
recipient or operator sweep. Network gas and fiat/provider fees are separate from
that fact. No operator revenue model, referral commission, protocol fee schedule,
payment-rail fee or commercial availability is approved by repository code.

**Alternatives and threat tradeoffs.** No protocol fee, explicit fixed or
percentage fees, optional service charges and generic referrals have different
incentives, rounding, privacy and legal effects. Hidden spread, tracking referrals
or fees inferred from screenshots would undermine exact amount/recipient consent.
Do not retrofit a fee or change payout destination in an existing escrow.

**Consequences and reversal.** Accountable owner: the actual future business
operator, currently unspecified, with protocol and qualified legal reviewers.
Next action: define canonical integer fee units, payer/recipient, rounding,
refund/deadline behavior and disclosure for an actual proposed new profile; test
conservation before any opt-in deployment. A future policy/version change applies
only to new explicitly accepted terms and must preserve old fixed-principal exits.
No business decision or fee collection is performed here.

## Remaining acceptance and dependency order

The existing dependency plan remains M0 → M1 → M2A and separate M2B → M2C;
M3–M6 consume core extension contracts and their own prerequisites. A local
engineering slice may proceed with trading disabled before production acceptance;
it does not make an unaccepted mandatory predecessor accepted. Reuse the existing
source-derived coverage/DAG and acceptance evaluator; this document adds neither
`canStart` nor another promotion engine. Root owns the final combined source and
test receipt. Named independent review, Solana/native token parity, supported
wallet/device combinations, reviewed safety locales, WCAG assessment, authenticated
release/deployment and operational drill evidence remain explicit open gates.
