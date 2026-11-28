# Native SOL seller funding and recovery in the local browser

The local-validator build supports two starting points. A seller can import fixed native SOL
terms and fund the proposed escrow, or either party can import an existing funded escrow's
public recovery document. Release, refund and payout each require their own review.
The default app has no Solana wallet or RPC connection. `ReleaseEnabled` remains `0`.

## Start with fixed terms

Use the complete `terms` object produced for the intended local validator and immutable program.
For a disposable test ledger the maintained browser fixture uses `chain.documents.absent.terms`
in `scripts/test-solana-localnet-browser.mjs`. Wrap those original terms as follows.

```js
JSON.stringify({ format: 'p2p-offramp/solana-local-funding-proposal/v1', terms })
```

Paste that JSON (up to 4,096 UTF-8 bytes) into **Funding proposal JSON** in an open profile.
**Save seller funding proposal** records the terms in the encrypted vault. On that proposal,
choose **Connect seller wallet**, then **Review funding**. Check the parties, principal in
lamports, escrow and deadlines. Fees, rent and total debit are shown as unknown.
**Confirm and sign in wallet** requests one signature for the reviewed message.
An uncertain send stays in the journal. Use **Refresh finalized state** to reconcile it.
A finalized escrow adds a recovery card. A definitively dropped funding attempt requires an
explicit replacement review. This flow covers seller-directed funding. Negotiating terms,
bilateral acceptance, browser SPL funding and public networks remain outside its scope.

## Authority and recovery

The main document discovers Wallet Standard registrations, then requires explicit wallet selection and connection.
Only `standard:connect`, `standard:events` and legacy `solana:signTransaction` are used. There is no generic signer or
sign-and-send command. A one-shot document grant names the exact base64 wire, account and local wallet chain.
Wallet scope events immediately revoke that grant and notify the Worker to dispose its native client. The physical
provider prompt remains occupied until its original promise settles, even after cancellation or lock.

The actual module Worker owns the vault session, canonical recovery documents, native client and sole RPC transport.
The document is checked against the separately embedded registry pin; it cannot install a new deployment or endpoint.
Importing a recovery document requires an existing escrow. Funding preparation requires an absent escrow. Backup restore creates a fresh profile/key while preserving original document and intent
provenance, signatures, uncertain markers and terminal history. Startup reconciles; it never automatically resends.

The native `prepare` handle is immutable, client/session branded and one-shot. The review shows the original roles,
principal, deadline, program pins, escrow, fee payer, exact message, recent blockhash, last valid height and payout
top-up. Confirmation rechecks finalized eligibility and the original blockhash before and after physical signing.
The signature and durable send marker are written with encrypted vault CAS **before** one RPC send. An uncertain
intent stays unresolved until finalized history proves an outcome or definitive expiry. Replacement then needs an
explicit new review; its provenance belongs to the new current profile. Release/refund never bundle payout.

## Local fixture boundary

`buildWeb({ delivery: 'solana-localnet', solanaLocalnet: ... })` is a library-only entry. It requires explicit registry
bytes and their SHA-256, explicit margin values, one local finalized Solana network, one immutable program, native SOL
with nine decimals, and exactly `http://127.0.0.1:<port>/`. There is no ambient environment or CLI profile switch.
The artifact CSP permits exactly that loopback RPC origin. Default, demo, testnet and EVM-localnet builds reject this
application/native graph. The Solana graph rejects EVM, exchange, relay and wallet packages. Only its Worker RPC module
has a fetch allowance; the transport has a fixed method allowlist, bounded responses, no redirects and no retry.

The opt-in Rust `browser-localnet` feature is mutually exclusive with the existing synthetic `localnet` feature.
Its build script additionally requires the fixture marker, actual genesis bytes and a fresh program key. The fixture
checks that its RPC ports are free, starts pinned Agave 4.1.2, reads the real genesis, compiles SBPF v3 with that identity,
deploys to this disposable loopback ledger and removes the local upgrade authority. The native-only mint allowlist is
empty. The application proxy forwards all ordinary RPC responses unchanged, including `getGenesisHash`. One deliberate
withheld physical send tests unknown-outcome recovery; it is recorded as withheld and never presented as a broadcast.

The local fixture's explicit margin values are test inputs. They do not adopt the pending production margin policy,
create a production trust root, publish a signed release, deploy a public program or promote any D1 candidate.

## Verification and qualification

Run the focused source checks with:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 apps/web/test/solana-localnet-*.test.mjs
npm run typecheck
npm run check:boundaries
npm run test:build-policy
```

The separate actual execution gate is:

```sh
npm run test:solana:browser
```

It requires the pinned Agave/SBF tools and Chromium. Missing tools or any skipped/failed required flow produce a
failure, never GREEN. `.github/workflows/solana-escrow.yml` retains its existing format, SBF build, Clippy, LiteSVM,
IDL and real-validator native acceptance gates and adds this browser run. Both native refund gates wait for real
chain time; there is no clock warp or skip-success path.

The browser gate serves the emitted artifact with its real CSP, runs its actual module Worker and IndexedDB, and
holds synthetic wallet keys only in Node. At each physical RPC send an independent proxy reads and decrypts the real
IndexedDB row, matches the exact message and known signature to a current-profile `sendMarked` record, verifies the
wire using Node/OpenSSL Ed25519, then forwards once. It checks cancelled review, wallet event during a pending signer,
release before separate payout, encrypted fresh-key restore without resending, definitive real blockhash expiry,
explicit replacement, and real-deadline refund before separate seller payout. Every qualified run prints genesis,
program/artifact pins, public marker proofs, original/fresh profile IDs and the withheld-send disposition.

The initial authoring environment has no Agave/SBF toolchain and cannot establish native/browser GREEN. Local unit,
type, source-graph and artifact checks are narrower evidence. A successful **exact-head hosted native/browser run**
and independent review remain required before this slice can be called integration-qualified. Existing synthetic
native harness results and in-memory tests do not substitute for that run.
