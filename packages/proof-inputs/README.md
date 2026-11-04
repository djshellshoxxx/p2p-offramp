# T72 structural proof inputs

This optional package parses the draft proof data shapes into detached,
**unverified** data. No provider, bank parser, source, rail, verifier, circuit,
wallet or network is selected. All supported catalogs are frozen and empty.
There is no provider registration, consent intake, collector, storage or Worker
allocation here. The separate T58 `createProofJobs()` facade remains the provider
refusal boundary. Trading and release remain disabled by the existing controls.

## Source contracts

Paths below are relative to
`01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/`:

- `module_1.2.1_tls_handshake_engine/spec-zktls-provider-interface.md`, request
  fields/exact expected context and empty provider registry.
- `module_1.2.1_tls_handshake_engine/spec-tls-source-authentication.md`, source
  policy and untrusted source-record shapes, exact HTTPS origin, redirect refusal.
- `module_1.2.2_bank_receipt_verifier/spec-bank-receipt-witness-schema.md`, witness
  fields, 1 MiB response, sixteen spans, raw strings512 UTF-8 bytes,
  beneficiary/reference256 bytes and private salts at least16 bytes.
- `module_1.2.2_bank_receipt_verifier/spec-bank-receipt-proof-statement.md`, exact
  statement fields, positive uint128 decimal amounts, uint64 decimal times,
  scale0–6, three uppercase currency letters, exact status enum.
- `module_1.2.4_evidence_policy/spec-fiat-proof-settlement-policy.md`, advisory
  mode, age300, autoRelease false and two explicit retention choices.

These specs are design baselines, not evidence that a profile was selected.

## API

```ts
const opened = createProofInputParsers(localBounds?); // fixed CoreResult
// when opened.ok:
opened.value.parseRequest(input, expectedRequest?);
opened.value.parseWitness(input);
opened.value.parseSourcePolicy(input);
opened.value.parseSourceRecord(input, expectedSourcePolicy?);
opened.value.parseStatement(input, expectedRequest?, expectedStatement?);
opened.value.parseAdvisoryPolicy(input);
opened.value.parseJson(kind, utf8Bytes);
```

Every successful parse wraps its data in `kind: 'unverified-proof-input'` with
`compatibilityAvailable`, `sourceAuthenticated`, `semanticCoverage`,
`proofVerified`, `receiptAuthority` and `economicPreparationAllowed` all false.
Neither the wrapper nor JSON can authorize evidence/custody or claim freshness.
No field or caller-supplied `enabled`, `verified` or `paid` flag is accepted.
Unknown keys, symbols, accessors, inherited/foreign-prototype records, sparse or
accessor arrays, malformed versions and hostile reflection fail with fixed G13
errors. Original exceptions/record values are not included in diagnostics.

Records, nested records and arrays are frozen detached projections. Witness
buffers are fresh owned copies; JavaScript cannot freeze mutable typed-array
bytes. The recipient owns wiping these copies after use. Parsing never wipes
caller-owned buffers. Failed partial owned copies are wiped best effort. Strings
and browser/OS memory copies cannot be physically erased by this API.

Expected request comparison checks every context field including all four
TradeBinding fields, terms/source/challenge/disclosure. Statement-to-request
comparison checks the fields actually present in both schemas: binding,
terms/source/challenge, with both versions fixed1. It does not invent a missing
statement disclosureHash. An optional full expected statement compares every
statement field, including amount/currency/status/commitments/times/parser and
verifier, exactly; this compares local data without proving the expected data.
Expected source-policy comparison checks source ID and normalized hostname only;
attestation-record shape has no port/path or trusted freshness proof.

`parseJson` supports only `request`, `source-policy`, `source-record`, `statement`
and `advisory-policy`. It uses the existing `parseStrictJsonBytes` implementation
on genuine native non-shared Uint8Array views: fatal UTF-8, BOM rejection,
duplicate/prototype-key rejection, depth6,32 keys/object,256 items/array and
nonnegative safe integer JSON numbers. Local total envelope cap is32768 bytes.
There is deliberately no invented JSON serialization of binary witness fields.
The witness response is checked as UTF-8 bytes only, not interpreted as JSON,
HTML or a bank statement. Duplicate JSON keys in an alleged bank response cannot
be declared absent without a selected content-type/parser profile; semantic use
is unavailable. Structural JSON-envelope validation does not cover bank bytes.

## Explicit conservative LOCAL policy

The drafts omit exact identifier/salt upper bounds, span end convention and some
list limits. Constructor options can only tighten these local ceilings:

- Identifier128 UTF-8 bytes, ASCII lowercase `[a-z0-9][a-z0-9._:-]*` and no
  prototype-reserved IDs. Opaque strings512 printable non-whitespace ASCII bytes.
- Salt16–64 bytes. Total witness payload `1048576 + 8192` bytes, counting response,
  both salts, all raw/ID strings and span names, checked before owned copying.
- Response1–1048576 bytes, fatal UTF-8 without BOM. Raw strings are nonempty;
  lone UTF-16 surrogates reject rather than silently encode as replacement bytes.
- At most16 spans, local half-open `[start,end)` convention, nonempty safe integer
  ranges contained in the response, disjoint and aligned to UTF-8 boundaries.
  Adjacency is allowed; input map order need not match byte order. Zero spans may
  parse structurally but cannot be used as evidence.
- At most16 unique advisory source IDs, including an empty list. This bound is
  local and does not enable any ID or negotiate a supported source.
- Exact normalized HTTPS origin (input equals URL.origin, no trailing slash,
  userinfo/path/query/fragment, explicit default443 or alternate case). DNS host
  labels must be lowercase ASCII, nonempty, at most63 characters and end in an
  alphabetic2–63-character TLD. Punycode/Unicode IDNs, trailing dots, localhost and
  IP literals reject under this local conservative policy. Canonical nondefault
  ports are structurally accepted, without authorization to contact them.

These choices are not an interoperable proof profile or newly negotiated wire
rules. A future selected profile may use different encodings and needs its own
reviewed compatibility contract.

## Precisely unavailable semantics

Only TradeBinding uses its existing CTX schema. The request/statement drafts do
not select a serialized hash/challenge/commitment profile for these records.
Consequently termsHash, disclosureHash, challenge, source/beneficiary/reference
commitments and attestationHash stay opaque bounded strings. Exact comparison
is possible, but no hash length/entropy/canonical encoding or commitment privacy
is inferred. G29 bridge base64url *job IDs* and the separate generic circuit
hex public envelope are not silently applied to these different draft fields.

No profile selects semantic span names, bank field paths, content type,
normalization/escape rules, byte extraction, locale decimal/grouping/currency
scale/status/time-zone/DST mapping or JSON/HTML ambiguity rules. A span inside
supplied bytes does not establish that rawAmount/beneficiary/reference were
extracted from it. The parser deliberately never claims semantic coverage and
can retain syntactically valid raw values with no spans; actual use remains
unsupported. Malformed/overlapping/non-UTF8 ranges still reject locally.

Source-policy normalization does not check TLS certificates/revocation, notary
identity, transcript/range/session authentication, pathPatternId semantics,
trusted observation time or response commitments. Statement currency letters
are not approved rail membership; timestamp ordering, freshness, external status
and reversal evidence require genuine source/verifier semantics. All status enum
values are preserved; pending/unknown/reversed are never promoted to posted.
Opaque commitments do not supply reviewed salted hash/domain encoding, nullifier
or a circuit/public-input/key ABI. No VerifiedReceipt, G30 state transition,
proof-use tracking, capability, automatic settlement, recipient change or expiry
extension can result from these parsers. Encrypted raw retention/export consent
and actual provider traffic/resource budgets remain separate implementations.

## Focused checks

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/proof-inputs/test/*.test.mjs
./node_modules/.bin/tsc --noEmit -p packages/proof-inputs/tsconfig.json
```

All fixtures are synthetic. Tests exercise exact/hostile schemas, fixed errors,
full context/predicate substitutions, duplicate/BOM/invalid UTF-8 JSON, native
shared/detached/proxy views, exact/+1 byte and UTF-8 span limits, uint128/uint64
boundaries, local caps, immutable catalog/detached projection and unverified flags.
No browser or cryptographic provider qualification is claimed by these checks.
