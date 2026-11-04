# D4 - Capability-to-terms commitments (decision packet)

Status: ACCEPTED — Option C now, with Option B as the named target for the first extension, recorded 2026-11-04 by the owner (djshellshoxxx). Core trades continue to commit the count-zero capabilities hash and refuse any other value (fail-closed with `UNSUPPORTED_VERSION` / `UNSUPPORTED_PROVIDER`); no capability-to-terms mapping is shipped until an extension needs one. No running behavior changes.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch (55715c9).

## The question

How should the optional capabilities that two parties negotiate (G14) be bound into the signed trade terms (G16), so that a signature proves which extensions were agreed, without any extension becoming a dependency of basic trading or exits?

Today the two data shapes do not line up, and no mapping is chosen. Until it is, an optional module's negotiated set cannot be declared bound to signed terms.

## Current source behavior

- The EIP-712 struct `TradeTerms` has a `bytes32 capabilitiesHash` field (`packages/wallet/src/evm-terms.ts`, main). The escrow contract carries the same field in its struct and type string and treats it as an opaque value. It never interprets it (`contracts/evm/src/BasicEscrow.sol`, main). So any choice below is off-chain only and needs no ABI change.
- Today the hash is SHA-256 over a byte encoding of a list of `{id, version, policyHash}` entries. The encoding is a count byte, then for each entry the length-prefixed id, version and policyHash hex (`capabilityBytes` and `encodeCapabilities` in `packages/domain/src/trade-terms.ts`, main). Entries must be sorted by exact id byte order with no duplicates. There are at most 8 entries, ids are 1 to 64 bytes of visible ASCII (`\x21-\x7e`, so space is excluded) and versions are 1 to 32 bytes. A core-only trade uses a count of zero, so its hash is the SHA-256 of that single count byte. It is not the all-zero value.
- The private bundle verifier recomputes this hash from the private agreement's capability list and rejects the bundle if it differs from the signed terms (`packages/wallet/src/evm-agreement.ts`, main). The same list is also inside `privateAgreementHash`, so capabilities are committed twice. The verifier is a private worker input, not a peer protocol.
- The G14 side is a different shape. A manifest has `id`, `protocolVersion` (a number), `coreApiVersion`, up to 16 capability names (module ids match `[a-z0-9-]{1,64}`, capability names match `[a-z0-9][a-z0-9._:-]{0,63}`, `manifest.ts:46-47`) and up to 16 schema hashes (`packages/extensions/src/manifest.ts`, main). `negotiate` rejects duplicate module ids with `CONFLICT` (`registry.ts:206`) and returns up to 16 modules sorted by id, each with `id`, `protocolVersion`, `capabilities` and `schemaHashes`, and refuses an unregistered name, version or hash with `UNSUPPORTED_VERSION` or `UNSUPPORTED_PROVIDER` (`packages/extensions/src/registry.ts`, main). It carries no `policyHash` and no string version.
- The package README says that no mapping from the negotiated set to the G16 `{id, version, policyHash}` entries is specified, that the application does not import the package, and that nothing in it grants authority over funded trades (`packages/extensions/README.md`, main).
- The specs say the negotiated set is part of the agreed terms, that basic trades use an empty set, that funding preflight rejects unrecognized or unavailable required capabilities, and that display-only capabilities cannot become settlement conditions after funding (`00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md` and `01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md`, both main).
- The owner packet records the gap: the exact mapping and the canonical `policyHash` preimage are not selected (`docs/governance/PENDING-DECISIONS.md`, PR #26 only, section "G14 capability commitments in G16").
- The journey passes the agreement's capability list into the signing review (`apps/web/src/journey/private-trade.ts`, PR #26 only). No shipped path loads an extension.

## Options

All three keep the escrow ABI and the `TradeTerms` struct unchanged, and all keep a core-only trade identical to today's count-zero encoding.

**Option A - keep the current encoding and define only the mapping.** Each negotiated capability name becomes one G16 entry. The id is the module id plus capability name, the version is the decimal `protocolVersion`, and `policyHash` is SHA-256 of a canonical policy document whose preimage the owner must define. Security: smallest change, existing vectors and verifier stay valid, and unknown entries fail closed in funding preflight. Compatibility: no change for core-only trades. Weakness: eight entries cannot hold sixteen modules with sixteen capabilities each, the G14 schema hashes have no home, and the id grammars differ: a joined module id plus capability name can reach about 129 bytes against the 64-byte G16 id limit.

**Option B - versioned capability manifest digest.** `capabilitiesHash` becomes a SHA-256 over a new, versioned, length-prefixed manifest. The manifest holds the sorted G14 module records in full (id, protocol version, sorted capability names, sorted schema hashes) plus a policy hash per module. Security: binds exactly what G14 negotiates, with no lossy mapping, and a format version allows later change. The B format must be distinguishable from a legacy count byte (today the first byte is the count, 0 to 8), and the count-zero core encoding stays exactly `0x00`. B must also version the capability encoding inside `privateAgreementHash` (`trade-terms.ts:148`), and the same change applies equally to the Solana raw terms, which also carry `capabilitiesHash` (`trade-terms.ts:182`). Compatibility: it needs new vectors and a verifier change, and the count-zero core encoding must stay byte-identical so existing core trades still verify. Older readers must refuse any nonzero count with an unknown format version.

**Option C - core-only now, explicit refusal of everything else.** Only the count-zero hash is accepted. Any other `capabilitiesHash` is refused by the client before signing and before funding. Security: the strictest, with no new parsing surface. Compatibility: no extension can be bound until a later decision, which matches the fact that no extension is loaded today. It does not answer the question for later. Today's verifier and `capabilityBytes` accept up to 8 entries, so Option C requires a verifier and signing-review change to reject any non-empty capability list, not only a non-matching hash.

## Recommendation

Option C now, with Option B as the named target for the first extension. Reason: nothing loads an extension, so shipping a mapping now would add an unreviewed hash preimage that funds could depend on. Whatever is chosen later must keep these rules:

- Unknown or unparsable capability data, an unknown format version, an unregistered name and a nonzero hash with no matching local manifest all fail closed before any signature or funding. The rule should name the codes `negotiate` uses: `UNSUPPORTED_VERSION` for a known id with the wrong version, `UNSUPPORTED_PROVIDER` otherwise.
- Optional features never gate funding, release, refund or recovery of a core trade, and never gain authority over an already funded position. A capability set is fixed when terms are signed.
- Verification may rely only on local registry data, never on a manifest or policy fetched from the counterparty.

## Test vector requirements

Do not invent hex values. Vectors must come from at least two independent implementations and be frozen with generator, versions and a hash, in the manner of `packages/wallet/test/fixtures/g16-independent.json` (main).

- Positive: the count-zero core encoding and its hash; for Option B, one module with one capability and the largest allowed set, in a native and an ERC-20 trade.
- Negative: unsorted or duplicate ids; count above the limit; unknown format version; a nonzero hash with no local manifest; a manifest whose recomputed hash differs by one byte; a hash that is all zeros; an optional capability marked required after funding; a version 1 reader given a nonzero set; and a funded core trade that must still release and refund with no extension present.

## What this unblocks

The G14 to G16 mapping item in `PENDING-DECISIONS.md`, and any later extension that needs to appear in signed terms. It does not unblock any extension loading, any change to the escrow contract, or the G16 versus ABI question, which remain separate decisions.
