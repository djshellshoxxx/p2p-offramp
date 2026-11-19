# ERC-20 localnet application completion — 2026-11-18

## Implementation

The localnet application now discovers and negotiates allowlisted exact-transfer ERC-20 assets, signs their exact terms through the existing D1 exchange, and provides separate reviews for allowance changes, funding, release, and refund. The external wallet retains signing authority. `ReleaseEnabled=0`; the ordinary application artifact remains isolated from the localnet modules.

The caller cannot supply an approval token, spender, or amount. The Worker derives them from the reviewed trade. Existing nonzero allowance that differs from the principal requires a zero reset, followed by a new exact-principal review. A finalized exact allowance and sufficient balance permit a separate funding review. No approval automatically funds escrow.

Allowance and balance queries use EIP-1898 canonical block hashes, a validated escrow anchor, bounded ABI/code responses, final header checks, and chain/genesis checks. Latest state can veto finalized guidance. The existing durable journal rechecks these conditions at reservation and immediately before the send marker. Cancellation, account changes, profile locking and uncertain broadcasts retain their existing authority fences.

A restored funded trade can release or refund without renewing ephemeral D1 acceptance or depending on token allowance queries. An approval whose broadcast response was lost remains held after fresh-key restoration: observing an allowance is not proof of the identity or outcome of that transaction.

## Independent correction

Independent native review found an availability defect in the first implementation: an unavailable token query for an earlier unfunded record aborted profile refresh before a later funded trade was projected. A deterministic regression chooses the funded trade from the actual second persisted encrypted trade record; it does not modify stored order or production source to manufacture the condition.

Repair `56a499cf53b5f1b3fba835e575238b99bdd53685` isolates malformed/unavailable token guidance to its unfunded trade. Its approval and funding remain disabled and its UI displays a refresh-needed status. Valid escrow observations of other trades continue. The escrow anchor is validated outside the fallback, while wrong-chain, cancellation, lock and vault conflicts still propagate. Independent GREEN evidence covers the actual funded release, late wrong-chain failure, and lock during a token read; its separate reviewer report retains the RED/GREEN logs.

## Executed evidence

| Source scope | Check | Result |
| --- | --- | --- |
| `56a499cf` | Four TypeScript configurations | Passed |
| `56a499cf` | New allowance/schema tests plus existing localnet client, boundary and restore tests | 26 passed, zero failures/skips |
| `56a499cf` plus the full-request fixture assertion from `02c3e93d` | Real-Anvil `scripts/test-localnet-erc20.mjs` | 7 checks; 12 typed signatures; 8 application wallet sends and 8 matching durable encrypted markers |
| Initial production checkpoint before the availability repair | Existing native controller regression | 12 checks; 4 application sends |
| Initial production checkpoint before the availability repair | Build policy and import boundaries | 50 cases; 197 production sources / 112 core modules |
| `fa667390` | Actual token-bearing localnet artifact | 11 assets; complete policy scan; ReleaseEnabled 0; no fixture wallet calls during artifact construction (browser startup was not executed) |
| `199caff2` and subsequent source | New browser fixture and gate syntax | Passed |

The native driver exercises bilateral token terms, rejection without allowance or seller authority, cancelled approval, an allowance changed after review, explicit reset/exact approval, independent funding, bank-confirmed release, funded fresh-key restore/refund, and uncertain approval restoration. Every application wallet send is matched against all six fields of the encrypted durable prepared request, plus origin/account/nonce and marker provenance. The fixture's deployment, mint and deliberate allowance mutation are local test setup, separate from those application send counts.

Recorded output: [native controller](erc20-localnet-20261118/native-controller.log), [focused tests](erc20-localnet-20261118/focused-tests.log), [typecheck](erc20-localnet-20261118/typecheck.log). The continuation integrator must qualify its final combined head independently.

## Browser gate and remaining qualification

`scripts/test-localnet-erc20-browser.mjs` serves the actual emitted artifact with separate browser contexts, Workers and IndexedDB profiles. It covers asset selection, exact private terms, cancellation, zero reset, exact allowance, separate funding, bank-confirmed release, chain-time refund, complete pre-send IndexedDB markers, private-view removal on lock, and forbidden network requests.

**The new Chromium gate has not executed here.** The current host's previously confirmed Unix-socket restriction remains; no elevated retry or workaround was used. Syntax, artifact and native-controller results do not replace this browser gate. Hosted execution on the final PR head remains required.

Physical-wallet compatibility, public-testnet acceptance, Solana browser composition, and recovery of unfunded D1 sessions are outside this scoped ERC-20 completion. Unknown approval hashes remain conservative holds. This report grants no release, deployment, mainnet or real-funds authorization.
