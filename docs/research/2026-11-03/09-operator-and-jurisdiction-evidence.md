# Operator, jurisdiction and privacy evidence still needed

Research date: **2026-11-03, America/Vancouver**; sources retrieved 2026-11-04 UTC.
Scope: the operator/jurisdiction/rail and public-claim portion of `Q-RELEASE`.
Status: a factual review packet, not a legal determination or activation approval.

## Finding

The missing work is an **actual operating-model description tied to the selected launch jurisdiction and payment rail**. Generic labels such as noncustodial, decentralized, peer-to-peer or software artwork do not supply that description. No intended launch market or legal operator was established by this research. Canada is examined as a concrete reference case; it is not assumed to be the only applicable jurisdiction.

The repository already calls for operator/jurisdiction/rail evidence in [CURRENT-REMAINDER.json](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json). Its [client-side ADR](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/adr/ADR-CLIENT-SIDE-2026-10-24.md) specifies a static application without an app-owned custody/account backend, while acknowledging external wallets, chains, RPC and relay infrastructure. Those are useful technical facts to present to a qualified jurisdiction reviewer; they do not decide every regulatory question.

## 1. What the primary sources establish

| Topic | Verified source position | Facts still needed for this project |
| --- | --- | --- |
| Virtual-currency services in Canada | FINTRAC lists fiat/virtual-currency exchange and virtual-currency transfer among MSB services; the statute distinguishes Canadian business presence and certain foreign services directed to Canadian clients. [O1] [O2] | Who offers which service; business presence; actual customers/marketing; who accepts instructions or handles funds; revenue and agency relationships |
| Retail fiat payment activities | The Bank of Canada's four-part assessment covers payment functions, fiat/prescribed-unit EFT activity, geographic scope and exclusions. Section 2 includes functions beyond holding funds, such as initiation and facilitation of instructions. [O3] [O4] | Whether any operator or optional integration actually initiates, authorizes or facilitates fiat instructions; whether activity is incidental; which exclusions apply |
| Securities/platform analysis | CSA guidance considers both the asset and the contractual rights/delivery arrangement. Its 2020 notice explicitly says there is no bright-line test for immediate delivery; the current overview continues to describe case-specific application. [O5] [O6] | Exact assets, escrow economics, enforceable user rights, actual delivery/control, liquidity/credit products and any continuing platform dependence |
| Personal-information handling | Joint Canadian privacy guidance emphasizes understandable collection purposes, recipients and consequences, accessible choices and renewed consent for significant changes. It also notes differences between applicable laws. [O7] | Data-flow map for each enabled artifact, organization/provider roles, actual logging/retention, optional-feature consent and recovery/deletion limits |

These are separate assessments. A conclusion about one category must not be copied into another. For example, an assessment of virtual-currency exchange does not automatically settle the fiat payment-function question, and local encryption does not describe what an external relay or proof provider receives.

## 2. Prepare one precise operating-model packet

The next researcher should obtain the following facts from the owner and selected deployment design. Unknown fields should stay unknown rather than being filled from the repository name.

| Fact group | Minimum record | Why it changes the review |
| --- | --- | --- |
| People and entities | Intended publisher/operator, actual locations, accountable contact and contractual relationships | Determines which activities belong to which person/entity |
| Markets | Intended user locations, distribution/marketing footprint, language and support commitments | Narrows applicable jurisdiction work |
| Product behavior | Read-only demo, manual peer exchange, payment initiation, managed matching, custody, optional dispute/liquidity service | Different enabled capabilities create different factual questions |
| Money and instructions | Who holds or can move each asset; who receives instructions; fees, spreads, subscriptions or commissions | Describes economic activity rather than labels |
| Assets and rails | Exact chain/token and bank/payment method; account/business eligibility; rail participant agreements | Prevents broad “supported payments” claims |
| Contract rights | Original escrow participants, deadline, release/refund rights and any separate optional authority | Connects code to user rights and operational dependence |
| Infrastructure | Who operates the hosted client, registry signer, relays, RPC, proof/notary and archival copies | Identifies actual control and information recipients |
| Incident/support | Published security contact, ability to suspend discovery/new enrollment, key compromise recovery and old-exit support | Identifies operational powers and limits |

**Recommendation:** produce a factual flow diagram and a short signed-off operating narrative for the selected release. Have the jurisdiction reviewer assess that concrete packet. Keep technical changes needed for legal or rail requirements separate from unapproved assumptions; do not add a central identity/account server as a guessed solution to an unasked regulatory question.

## 3. Payment-rail research should be specific

The EVM/settlement and payment-proof reports establish why blockchain inclusion, a bank-page proof and a seller's receipt confirmation are different observations. The operator packet should add the selected rail's own rules and the participating bank/provider terms. The research questions are:

1. Is the intended transaction permitted for the actual account type and business model?
2. What does each displayed payment state mean, and who can later reverse or dispute it?
3. Which party can obtain authenticated evidence of credit, debit, recipient and transaction identity?
4. What happens to refunds, mistaken recipients, fraud reports and account freezes?
5. Which limits, currencies, availability windows and cross-border restrictions apply?
6. What private information is exposed to the counterparty, bank, relay, proof service or support operator?

These are requests for primary rail evidence, not assumed universal chargeback periods. Public FAQs may be useful for basic semantics but cannot replace the actual account/provider agreement. No bank account, rail or production policy is selected by this report.

## 4. Privacy claims and deletion

Prepare a per-capability table of data collected, processed, stored, transmitted and recoverable. Include browser state, wallet metadata, relay events, public order advertisements, RPC queries, gateway requests, proof witnesses, device links and optional diagnostics. Distinguish local encrypted storage from remote metadata visibility.

The joint consent guidance supports giving users concise information about recipients and purposes at the moment a consequential choice occurs, with optional processing separately selectable. [O7] **Project recommendation:** pair each feature's actual data-flow observations with its UI copy and cancellation/withdrawal behavior. A consent toggle alone is insufficient evidence of what the system stops doing.

The remainder retains an unresolved whole-profile deletion contract, while existing backup copies and relay-held data have their own lifecycles. Therefore a future deletion flow should identify precisely which local records it removes, what recovery the user gives up, which copies survive and which remote deletion claims cannot be verified. The optional privacy report investigates that engineering question; this report does not authorize deletion of any existing profile.

## 5. Evidence that closes this research gap

| Deliverable | Completion evidence |
| --- | --- |
| Operating-model fact sheet | Named accountable owner; selected markets/rails/features; explicit unknowns and source documents |
| Jurisdiction review | Qualified reviewer assesses the stated facts and records scope, date, assumptions and conditions |
| Rail profile | Official rail rules plus actual provider terms, state meanings and reversal/dispute handling |
| Privacy record | Artifact-specific data-flow evidence, selected provider terms, retention/recovery behavior and reviewed copy |
| Change trigger list | Re-review when custody, fiat initiation, fees, matching, assets, markets, proofs, arbitration or data recipients change |

This work need not stop independent protocol, testnet or documentation engineering. It does prevent research from substituting a generic exemption assertion for missing facts. The useful next step is a concrete packet for the selected operating model, not a broad worldwide legal survey before a market has been chosen.

## Sources and limits

All listed sources were opened/read. No conclusions are drawn about jurisdictions outside the bounded Canadian example, and the complete body of Canadian financial/privacy law was not reviewed.

| ID | Source | Date/status and relevance |
| --- | --- | --- |
| O1 | [FINTRAC: Money services businesses](https://fintrac-canafe.canada.ca/msb-esm/msb-eng) | Live regulator guidance; services and business/geographic criteria |
| O2 | [PCMLTFA, section 5](https://laws-lois.justice.gc.ca/eng/acts/P-24.501/section-5.html) | Official consolidated statute; displayed current-to 2026-10-19, amended 2026-03-26; scope of covered persons/entities |
| O3 | [Bank of Canada: Criteria for registering payment service providers](https://www.bankofcanada.ca/2026/06/criteria-for-registering-payment-service-providers/) | Published 2023-12-12, updated 2026-06-29; four-part applicability framework |
| O4 | [Retail Payment Activities Act, section 2](https://laws-lois.justice.gc.ca/eng/acts/R-7.36/section-2.html) | Official consolidated statute; displayed current-to 2026-10-19; payment-function and retail-activity definitions |
| O5 | [CSA Staff Notice 21-327](https://www.securities-administrators.ca/uploadedFiles/Industry_Resources/CSAStaffNotice21-327_trading-crypto-assets.pdf) | 2020-01-16; primary staff guidance about platform rights and immediate delivery, not the entire current securities regime |
| O6 | [CSA: Regulation of crypto assets](https://www.securities-administrators.ca/investor-tools/crypto-assets/regulation-of-crypto-assets/) | Updated 2024-04-03; current regulator overview located during this review |
| O7 | [OPC/OIPC-AB/OIPC-BC: Guidelines for obtaining meaningful consent](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/) | Joint first-party privacy guidance; contextual assessment and law-specific differences remain |

Confidence is high that these are relevant primary screening sources, and low in any project-specific legal outcome until the missing operating facts and qualified review exist. This note is research support for that review.

[O1]: https://fintrac-canafe.canada.ca/msb-esm/msb-eng
[O2]: https://laws-lois.justice.gc.ca/eng/acts/P-24.501/section-5.html
[O3]: https://www.bankofcanada.ca/2026/06/criteria-for-registering-payment-service-providers/
[O4]: https://laws-lois.justice.gc.ca/eng/acts/R-7.36/section-2.html
[O5]: https://www.securities-administrators.ca/uploadedFiles/Industry_Resources/CSAStaffNotice21-327_trading-crypto-assets.pdf
[O6]: https://www.securities-administrators.ca/investor-tools/crypto-assets/regulation-of-crypto-assets/
[O7]: https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/
