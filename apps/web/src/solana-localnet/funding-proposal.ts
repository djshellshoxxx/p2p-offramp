/** Inactive local-SOL proposal data. Parsing or retaining it grants no acceptance or funding authority. */
import { encodeSolanaTerms, sha256Hex, type SolanaTermsInput } from '../../../../packages/domain/index.ts';
import { parseStrictJsonBytes, parseTradeBinding, encodeBase64url, decodeBase64url,
  type PrivateRecordV1 } from '../../../../packages/schemas/index.ts';
import { parseSolanaRpcUrl, type SolanaLocalnetConfig } from './config.ts';
import { fields, fail } from './validation.ts';

export const SOLANA_FUNDING_PROPOSAL_FORMAT = 'p2p-offramp/solana-local-funding-proposal/v1';
export const SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT = 'p2p-offramp/solana-local-funding-proposal-record/v1';
export const MAX_SOLANA_FUNDING_PROPOSAL_BYTES = 4096;
export const MAX_SOLANA_FUNDING_PROPOSAL_RECORD_BYTES = 8192;
export interface NativeSolanaFundingTerms extends Omit<SolanaTermsInput, 'assetKind' | 'mint' | 'tokenProgram'> {
  readonly assetKind: 'native'; readonly mint: null; readonly tokenProgram: null;
}
export interface SolanaFundingProposalDocument {
  readonly format: typeof SOLANA_FUNDING_PROPOSAL_FORMAT;
  readonly terms: NativeSolanaFundingTerms;
}
export interface ParsedSolanaFundingProposal {
  readonly document: SolanaFundingProposalDocument;
  /** Hash of the maintained G16 binary terms encoding, never JSON bytes or an acceptance proof. */
  readonly termsHash: string;
}
export interface SolanaFundingProposalRecord {
  readonly format: typeof SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT;
  readonly proposal: SolanaFundingProposalDocument;
  readonly binding: {
    readonly chain: 'solana'; readonly networkId: string; readonly deploymentId: string; readonly tradeId: string;
  };
  readonly role: 'seller'; readonly originProfileId: string;
  /** Historical admission provenance only. Never install these values as executable configuration. */
  readonly configuration: {
    readonly registrySha256: string; readonly programDataSha256: string; readonly artifactSha256: string;
    readonly assetId: string; readonly rpcUrl: string;
    readonly margins: { readonly submitMarginSeconds: string; readonly releaseMarginSeconds: string };
  };
}
const TERMS_KEYS = ['acceptBeforeSeconds', 'amountBaseUnits', 'assetKind', 'buyer', 'capabilitiesHash', 'escrowExpirySeconds',
  'genesisHash', 'mint', 'orderId', 'privateAgreementHash', 'programId', 'revision', 'seller', 'sellerNonce', 'tokenProgram'] as const;
const utf8 = new TextEncoder();
const digest = (input: unknown): string => typeof input === 'string' && /^[0-9a-f]{64}$/.test(input) ? input : fail();
const registryId = (input: unknown): string => typeof input === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input) && !input.includes('..') ? input : fail();
function origin(input: unknown): string {
  return typeof input === 'string' && /^[0-9a-f]{32}$/.test(input) && !/^0{32}$/.test(input) ? input : fail();
}
function proposalValue(input: unknown): { readonly document: SolanaFundingProposalDocument; readonly message: Uint8Array<ArrayBuffer> } {
  const raw = fields(input, ['format', 'terms']);
  if (raw.format !== SOLANA_FUNDING_PROPOSAL_FORMAT) return fail('UNSUPPORTED_VERSION');
  const captured = fields(raw.terms, TERMS_KEYS);
  if (captured.assetKind !== 'native' || captured.mint !== null || captured.tokenProgram !== null) return fail();
  const terms = Object.freeze(Object.fromEntries(TERMS_KEYS.map(key => [key, captured[key]]))) as unknown as NativeSolanaFundingTerms;
  const message = encodeSolanaTerms(terms);
  return { document: Object.freeze({ format: SOLANA_FUNDING_PROPOSAL_FORMAT, terms }), message };
}
function publicBytes(bytes: Uint8Array): ReturnType<typeof proposalValue> {
  return proposalValue(parseStrictJsonBytes(bytes, MAX_SOLANA_FUNDING_PROPOSAL_BYTES));
}
function margin(input: unknown, maximum: bigint): string {
  return typeof input === 'string' && /^(0|[1-9][0-9]{0,5})$/.test(input) && BigInt(input) <= maximum ? input : fail();
}
function rpcUrl(input: unknown): string {
  try { return parseSolanaRpcUrl(input).url; } catch { return fail(); }
}
function configuration(input: unknown): SolanaFundingProposalRecord['configuration'] {
  const raw = fields(input, ['registrySha256', 'programDataSha256', 'artifactSha256', 'assetId', 'rpcUrl', 'margins']);
  const limits = fields(raw.margins, ['submitMarginSeconds', 'releaseMarginSeconds']);
  return Object.freeze({ registrySha256: digest(raw.registrySha256), programDataSha256: digest(raw.programDataSha256),
    artifactSha256: digest(raw.artifactSha256), assetId: registryId(raw.assetId), rpcUrl: rpcUrl(raw.rpcUrl),
    margins: Object.freeze({ submitMarginSeconds: margin(limits.submitMarginSeconds, 3600n),
      releaseMarginSeconds: margin(limits.releaseMarginSeconds, 604800n) }) });
}
/** Read a single installed registry element without invoking an array element accessor. */
function single(input: unknown): unknown {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
    const keys = Reflect.ownKeys(input), length = Object.getOwnPropertyDescriptor(input, 'length');
    const item = Object.getOwnPropertyDescriptor(input, '0');
    if (keys.length !== 2 || !keys.includes('0') || !keys.includes('length') ||
        !length || !('value' in length) || length.value !== 1 || !item || !('value' in item)) return fail();
    return item.value;
  } catch { return fail(); }
}
/** Requires the controller's installed parseSolanaLocalnetConfig result; these copies do not authenticate a registry. */
function installed(input: SolanaLocalnetConfig) {
  const raw = fields(input, ['document', 'ReleaseEnabled', 'registry', 'network', 'registrySha256', 'rpcUrl', 'rpcOrigin', 'margins']);
  const network = fields(raw.network, ['id', 'chain', 'chainIdentity', 'genesisHash', 'endpoints', 'finality', 'assets', 'deployments', 'environment']);
  const deployment = fields(single(network.deployments), ['id', 'address', 'protocolVersion', 'artifactSha256', 'runtime', 'supportedAssetIds']);
  const runtime = fields(deployment.runtime, ['kind', 'programDataSha256', 'upgradeAuthority']);
  const asset = fields(single(network.assets), ['id', 'kind', 'address', 'decimals', 'transferPolicy']);
  if (raw.ReleaseEnabled !== 0 || network.chain !== 'solana' || network.environment !== 'local' ||
      runtime.kind !== 'solana-program' || runtime.upgradeAuthority !== null || asset.kind !== 'native' ||
      asset.address !== null || asset.decimals !== 9) return fail('WRONG_CHAIN');
  return Object.freeze({ networkId: registryId(network.id), deploymentId: registryId(deployment.id),
    genesisHash: network.genesisHash, programId: deployment.address,
    configuration: configuration({ registrySha256: raw.registrySha256, programDataSha256: runtime.programDataSha256,
      artifactSha256: deployment.artifactSha256, assetId: asset.id, rpcUrl: raw.rpcUrl, margins: raw.margins }) });
}
function binding(input: unknown): SolanaFundingProposalRecord['binding'] {
  const parsed = parseTradeBinding(input);
  if (parsed.chain !== 'solana') return fail();
  return Object.freeze({ chain: 'solana', networkId: registryId(parsed.networkId),
    deploymentId: registryId(parsed.deploymentId), tradeId: digest(parsed.tradeId) });
}
async function recordId(value: SolanaFundingProposalRecord['binding']): Promise<string> {
  return (await sha256Hex(utf8.encode(JSON.stringify([SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT, value.chain,
    value.networkId, value.deploymentId, value.tradeId])))).slice(0, 32);
}

/** Canonical data only: no current-time, core-capability, escrow-state, wallet or peer-acceptance decision. */
export async function parseSolanaFundingProposal(bytes: Uint8Array): Promise<ParsedSolanaFundingProposal> {
  const captured = publicBytes(bytes);
  return Object.freeze({ document: captured.document, termsHash: await sha256Hex(captured.message) });
}

/** Produce a detached private record for a later explicit vault admission; no persistence or binding authority. */
export async function createSolanaFundingProposalRecord(bytes: Uint8Array, installedConfig: SolanaLocalnetConfig,
  originProfileId: string): Promise<Readonly<{ record: PrivateRecordV1; value: SolanaFundingProposalRecord }>> {
  const captured = publicBytes(bytes), pins = installed(installedConfig), profile = origin(originProfileId);
  if (captured.document.terms.genesisHash !== pins.genesisHash || captured.document.terms.programId !== pins.programId) return fail('WRONG_CHAIN');
  const termsHash = await sha256Hex(captured.message);
  const value: SolanaFundingProposalRecord = Object.freeze({ format: SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT,
    proposal: captured.document, binding: binding({ chain: 'solana', networkId: pins.networkId, deploymentId: pins.deploymentId, tradeId: termsHash }),
    role: 'seller', originProfileId: profile, configuration: pins.configuration });
  const payload = utf8.encode(JSON.stringify(value));
  if (payload.byteLength > MAX_SOLANA_FUNDING_PROPOSAL_RECORD_BYTES) return fail('LIMIT_EXCEEDED');
  const record: PrivateRecordV1 = Object.freeze({ id: await recordId(value.binding), kind: 'trade', schemaVersion: 1, payload: encodeBase64url(payload) });
  return Object.freeze({ record, value });
}

/** Retain historical provenance verbatim as validated data; the caller must compare independently installed pins later. */
export async function decodeSolanaFundingProposalRecord(record: PrivateRecordV1): Promise<SolanaFundingProposalRecord> {
  const outer = fields(record, ['id', 'kind', 'schemaVersion', 'payload']);
  if (outer.kind !== 'trade' || typeof outer.id !== 'string' || !/^[0-9a-f]{32}$/.test(outer.id)) return fail();
  if (outer.schemaVersion !== 1) return fail('UNSUPPORTED_VERSION');
  const raw = fields(parseStrictJsonBytes(decodeBase64url(outer.payload, 1, MAX_SOLANA_FUNDING_PROPOSAL_RECORD_BYTES),
    MAX_SOLANA_FUNDING_PROPOSAL_RECORD_BYTES), ['format', 'proposal', 'binding', 'role', 'originProfileId', 'configuration']);
  if (raw.format !== SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT) return fail('UNSUPPORTED_VERSION');
  if (raw.role !== 'seller') return fail();
  const captured = proposalValue(raw.proposal), retained = binding(raw.binding);
  const value: SolanaFundingProposalRecord = Object.freeze({ format: SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT,
    proposal: captured.document, binding: retained, role: 'seller', originProfileId: origin(raw.originProfileId),
    configuration: configuration(raw.configuration) });
  if (retained.tradeId !== await sha256Hex(captured.message) || outer.id !== await recordId(retained)) return fail('INTEGRITY_FAILURE');
  return value;
}
