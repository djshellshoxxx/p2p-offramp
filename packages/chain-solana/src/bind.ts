/** Binds a G08 trade binding and G16 Solana terms to one registry deployment. Pure: no RPC. */
import { sha256 } from '@noble/hashes/sha2.js';
import { createCoreError, createOperationId, encodeSolanaTerms, type SolanaTermsInput } from '../../domain/index.ts';
import {
  parseTradeBinding, type AssetV1, type CoreResult, type DeploymentV1, type NetworkV1, type TradeBinding,
} from '../../schemas/index.ts';
import {
  escrowAddress, programDataAddress, SYSTEM_PROGRAM_ID, SPL_PROGRAM_ID, vaultAddress, WRAPPED_SOL_MINTS,
  type ProgramAddress,
} from './address.ts';
import { canonicalKey, fail, failureCode, hex } from './codec.ts';

export interface SolanaRegistryView {
  network(id: string): NetworkV1 | null;
  deployment(networkId: string, deploymentId: string): DeploymentV1 | null;
}
export interface BoundSolanaTrade {
  readonly binding: TradeBinding; readonly terms: SolanaTermsInput; readonly termsHash: string;
  readonly network: NetworkV1; readonly deployment: DeploymentV1; readonly asset: AssetV1;
  readonly programDataAddress: string; readonly escrow: ProgramAddress; readonly vault: ProgramAddress | null;
}
export interface SolanaDeploymentRef {
  readonly network: NetworkV1; readonly deployment: DeploymentV1; readonly programDataAddress: string;
}

const TERMS_KEYS = Object.freeze(['acceptBeforeSeconds', 'amountBaseUnits', 'assetKind', 'buyer', 'capabilitiesHash',
  'escrowExpirySeconds', 'genesisHash', 'mint', 'orderId', 'privateAgreementHash', 'programId', 'revision', 'seller',
  'sellerNonce', 'tokenProgram']);
const MAX_SAFE_LAMPORTS = BigInt(Number.MAX_SAFE_INTEGER);
/** Only objects produced here carry the brand; builders refuse structurally identical copies. */
const BOUND = new WeakSet<object>();
export const isBoundSolanaTrade = (value: unknown): value is BoundSolanaTrade =>
  typeof value === 'object' && value !== null && BOUND.has(value);

export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || value instanceof Uint8Array) return value;
  if (Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  return Object.freeze(value);
}

/**
 * Exactly the 15 G16 fields as own enumerable data properties, copied into a frozen null-prototype object.
 * Accessors are never invoked. structuredClone runs only after every value is known to be a primitive data
 * property, so it reads nothing new; it refuses Proxy objects without calling any trap.
 */
function snapshotTerms(input: unknown): SolanaTermsInput {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('INVALID_INPUT');
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail('INVALID_INPUT');
    const keys = Reflect.ownKeys(input);
    if (keys.length !== TERMS_KEYS.length || keys.some(key => typeof key !== 'string' || !TERMS_KEYS.includes(key))) {
      return fail('INVALID_INPUT');
    }
    const copy = Object.create(null) as Record<string, unknown>;
    for (const key of TERMS_KEYS) {
      const field = Object.getOwnPropertyDescriptor(input, key);
      if (!field || !field.enumerable || !('value' in field)) return fail('INVALID_INPUT');
      if (typeof field.value !== 'string' && field.value !== null) return fail('INVALID_INPUT');
      Object.defineProperty(copy, key, { value: field.value, enumerable: true });
    }
    structuredClone(input);
    return Object.freeze(copy) as unknown as SolanaTermsInput;
  } catch { return fail('INVALID_INPUT'); }
}

/** G08 binding for Solana: lowercase 64-hex trade id and a network id without ':'. */
export function parseSolanaBinding(input: unknown): TradeBinding {
  let binding: TradeBinding;
  try { binding = parseTradeBinding(input); } catch { return fail('INVALID_INPUT'); }
  if (binding.chain !== 'solana' || !/^[0-9a-f]{64}$/.test(binding.tradeId) || binding.networkId.includes(':')) {
    return fail('INVALID_INPUT');
  }
  return binding;
}

function finalizedCommitment(network: NetworkV1): boolean {
  const finality = network.finality;
  return Object.keys(finality).length === 2 && finality.kind === 'solana-commitment' &&
    finality.commitment === 'finalized';
}
/** Registry policy only (UNSUPPORTED_PROVIDER): finalized Solana network with an immutable v1 program. */
export function resolveDeployment(
  registry: SolanaRegistryView, networkId: string, deploymentId: string,
): SolanaDeploymentRef {
  try {
    if (networkId.includes(':')) return fail('INVALID_INPUT');
    const network = registry.network(networkId), deployment = registry.deployment(networkId, deploymentId);
    if (!network || !deployment || network.chain !== 'solana' || !finalizedCommitment(network)) {
      return fail('UNSUPPORTED_PROVIDER');
    }
    const runtime = deployment.runtime;
    if (deployment.protocolVersion !== 1 || runtime.kind !== 'solana-program' || runtime.upgradeAuthority !== null ||
        !/^[0-9a-f]{64}$/.test(runtime.programDataSha256)) return fail('UNSUPPORTED_PROVIDER');
    canonicalKey(network.genesisHash, 'UNSUPPORTED_PROVIDER');
    const programData = programDataAddress(canonicalKey(deployment.address, 'UNSUPPORTED_PROVIDER'));
    return Object.freeze({ network, deployment, programDataAddress: programData.address });
  } catch (error) { return fail(failureCode(error, 'UNSUPPORTED_PROVIDER')); }
}

/** Native uses the native asset; SPL needs Tokenkeg, a non-wrapped mint and an exact `spl` asset entry. */
function selectAsset(network: NetworkV1, deployment: DeploymentV1, terms: SolanaTermsInput): AssetV1 {
  let asset: AssetV1 | undefined;
  if (terms.assetKind === 'native') asset = network.assets.find(entry => entry.kind === 'native');
  else {
    if (terms.tokenProgram !== SPL_PROGRAM_ID || terms.mint === null || WRAPPED_SOL_MINTS.includes(terms.mint)) {
      return fail('UNSUPPORTED_PROVIDER');
    }
    asset = network.assets.find(entry => entry.kind === 'spl' && entry.address === terms.mint);
  }
  if (!asset || !deployment.supportedAssetIds.includes(asset.id)) return fail('UNSUPPORTED_PROVIDER');
  return asset;
}

/** Throwing core shared with the reader; codes follow the spec's pre-RPC order. */
export function bindTrade(
  registry: SolanaRegistryView, input: TradeBinding, rawTerms: SolanaTermsInput,
): BoundSolanaTrade {
  const binding = parseSolanaBinding(input);
  const terms = snapshotTerms(rawTerms);
  let termsHash: string;
  try { termsHash = hex(sha256(encodeSolanaTerms(terms))); } catch { return fail('INVALID_INPUT'); }
  if (termsHash !== binding.tradeId) return fail('INVALID_INPUT');
  const ref = resolveDeployment(registry, binding.networkId, binding.deploymentId);
  const { network, deployment, programDataAddress: programData } = ref;
  if (terms.genesisHash !== network.genesisHash || terms.programId !== deployment.address) return fail('WRONG_CHAIN');
  const asset = selectAsset(network, deployment, terms);
  const escrow = escrowAddress(deployment.address, terms.seller, terms.sellerNonce);
  const vault = terms.assetKind === 'spl' ? vaultAddress(deployment.address, escrow.address) : null;
  if (terms.buyer === SYSTEM_PROGRAM_ID || terms.buyer === escrow.address || terms.buyer === vault?.address) {
    return fail('INVALID_INPUT');
  }
  if (terms.assetKind === 'native' && BigInt(terms.amountBaseUnits) > MAX_SAFE_LAMPORTS) return fail('LIMIT_EXCEEDED');
  const bound: BoundSolanaTrade = deepFreeze({
    binding, terms, termsHash, network, deployment, asset, programDataAddress: programData, escrow, vault,
  });
  BOUND.add(bound);
  return bound;
}

export function bindSolanaTrade(
  registry: SolanaRegistryView, binding: TradeBinding, terms: SolanaTermsInput,
): CoreResult<BoundSolanaTrade> {
  try { return { ok: true, value: bindTrade(registry, binding, terms) }; } catch (error) {
    const code = failureCode(error, 'INVALID_INPUT');
    return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) };
  }
}
