# Chain, asset and deployment registry

## 1. Metadata

- **Specification ID:** G11
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Bind every economic operation to an explicitly supported network, deployment, asset and finality policy. A relay, wallet callback or custom RPC URL cannot add an approved contract or mint. RPC identity checks detect mismatches but do not provide independent chain consensus verification.

## 3. Architecture and registry contracts

```typescript
interface AssetV1 {
  id: string; // registry-local ASCII ID, 1..64 characters
  kind: "native" | "erc20" | "spl";
  address: string | null; // null only for native, chain-canonical otherwise
  decimals: number; // integer 0..38, project UI support limit
  transferPolicy: "exact-transfer";
}
interface DeploymentV1 {
  id: string;
  address: string; // EVM contract or Solana program, canonical by family
  protocolVersion: 1;
  artifactSha256: string; // build artifact provenance, not runtime code hash
  runtime: { kind: "evm-code"; keccak256: string; upgradeable: false } |
    { kind: "solana-program"; programDataSha256: string; upgradeAuthority: null };
  supportedAssetIds: readonly string[];
}
interface NetworkV1 {
  id: string; // exact stable registry ID, 1..64 ASCII characters
  chain: "evm" | "solana";
  chainIdentity: string; // canonical EVM chain ID or Solana genesis hash
  genesisHash: string; // chain-specific canonical encoding
  endpoints: readonly { id: string; url: string }[];
  finality: { kind: "evm-finalized-tag" } |
    { kind: "solana-commitment"; commitment: "finalized" };
  assets: readonly AssetV1[];
  deployments: readonly DeploymentV1[];
  environment: "local" | "testnet" | "mainnet";
}
interface RegistryV1 { version: 1; releaseId: string; networks: readonly NetworkV1[]; }
```

The signed release manifest binds the complete registry file digest under G15. No deployed address, bytecode hash, mint, mainnet token or live RPC is approved by this spec; evaluated entries and deployment artifacts must be supplied by implementation. Runtime EVM Keccak-256 is not Web Crypto SHA3/SHA-256. A reviewed chain library computes the exact chain hash. Solana program verification must use the deployed loader/program-data layout and artifact extraction defined by its chain implementation, with explicit no-upgrade-authority validation.

## 4. Validation and preflight algorithm

Parse at most 1 MiB of registry JSON, reject duplicate/unknown fields and enforce at most 32 networks, 8 endpoints/network, 64 assets/network and 16 deployments/network. All IDs are unique in scope and cross-references must exist. Asset kind/address encoding must match chain family; decimals are display metadata and amounts stay base-unit unsigned decimal strings. Reject mutable proxy/upgradeable EVM deployments and Solana programs with an upgrade authority for core v1; a future upgradeable profile needs a separate authority/security policy.

Registry input must match its authenticated release digest. User custom RPC configuration selects an endpoint for an already approved network; it never edits chain, genesis, deployment, runtime hash or assets. Validate HTTP endpoint scheme as HTTPS (loopback HTTP only in an explicitly labeled local-development profile), URL has no userinfo/fragment, and origin is allowed by G04/G05. Solana and EVM methods remain separate despite a shared registry wrapper.

On connection and before economic preparation: check RPC chain identity/genesis, deployment existence, exact runtime identity, immutable deployment authority, supported asset state and fresh escrow state. Validate token mint/program/decimals against its adapter's policy. A failed check returns WRONG_CHAIN or INTEGRITY_FAILURE, disables signing and preserves watch-only/export. Do not silently select another endpoint. Independent configured corroboration must agree on identity/deployment and compatible finalized state; disagreement blocks economic actions. The initial core profile uses EVM finalized tag and Solana finalized commitment; networks lacking that supported adapter policy are unsupported rather than assigned an arbitrary confirmation count.

Never migrate a funded trade to the latest deployment on registry update. Retain original network/deployment metadata and recovery ABI/IDL while supported positions exist. A signed release revocation can disable new funding but cannot alter existing contract exits.

## 5. Interfaces and errors

```typescript
interface RegistryService {
  load(bytes: Uint8Array, expectedSha256: string): CoreResult<Readonly<RegistryV1>>;
  network(id: string): Readonly<NetworkV1> | null;
  deployment(networkId: string, deploymentId: string): Readonly<DeploymentV1> | null;
  validateLive(networkId: string, deploymentId: string,
    signal?: AbortSignal): Promise<CoreResult<void>>;
}
```

Digest verification is meaningful only if expectedSha256 comes from the separately trusted G15 manifest, not the same unverified input. Unknown IDs return UNSUPPORTED_PROVIDER, schema/version errors return INVALID_INPUT/UNSUPPORTED_VERSION, identity mismatch returns WRONG_CHAIN, runtime mismatch returns INTEGRITY_FAILURE and unavailable calls return UNAVAILABLE. No stringly typed fallback to another family is allowed. Endpoint diagnostics expose registry ID/origin only; credential-bearing URLs are rejected rather than logged.

## 6. Threat assessment

Chain ID reuse, malicious forks, fake contract addresses, proxy upgrades, token impersonation, compromised RPC and release-key compromise can redirect funds. Registry binding, runtime identity and immutable authority checks constrain accepted deployments but remain dependent on delivered client and RPC observations. A genesis/code hash reported by the same malicious RPC is not an independently verified fact. Cross-checks and external verified release distribution are additional controls, not a claim of trustlessness. Native token symbols and logos cannot authenticate asset identity.

## 7. Verification and references

Fuzz bounded registry JSON including duplicate keys/IDs, unsupported families, wrong kind/chain pairs, bad decimal bounds, missing references, URL credentials and traversal-like IDs. Test exact digest mismatch, EVM chain/genesis/code mismatch, proxy/authority rejection, Solana loader/program/mint mismatch, independent RPC disagreement and unsupported finality methods. A malicious order selecting an unknown deployment must fail before wallet invocation. Update tests retain old funded-trade recovery metadata. Sources: [Ethereum JSON-RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/), [Solana getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash), [Solana programs](https://solana.com/docs/core/programs), [G15 deployment](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md).
