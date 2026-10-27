/**
 * G11 v1 chain/asset/deployment registry: strict structural parsing only. Parsing is not authentication
 * (the caller must first match the exact bytes to a G15-signed digest) and never contacts a chain or RPC.
 * No network, asset, deployment or endpoint is approved by this module.
 */
import { ValidationError } from './vault.ts';

export const MAX_REGISTRY_BYTES = 1024 * 1024;
export const MAX_NETWORKS = 32;
export const MAX_ENDPOINTS = 8;
export const MAX_ASSETS = 64;
export const MAX_DEPLOYMENTS = 16;

export interface AssetV1 {
  readonly id: string; readonly kind: 'native' | 'erc20' | 'spl'; readonly address: string | null;
  readonly decimals: number; readonly transferPolicy: 'exact-transfer';
}
export type RuntimeIdentityV1 = { readonly kind: 'evm-code'; readonly keccak256: string; readonly upgradeable: false } |
  { readonly kind: 'solana-program'; readonly programDataSha256: string; readonly upgradeAuthority: null };
export interface DeploymentV1 {
  readonly id: string; readonly address: string; readonly protocolVersion: 1; readonly artifactSha256: string;
  readonly runtime: RuntimeIdentityV1; readonly supportedAssetIds: readonly string[];
}
export interface EndpointV1 { readonly id: string; readonly url: string; }
export interface NetworkV1 {
  readonly id: string; readonly chain: 'evm' | 'solana'; readonly chainIdentity: string; readonly genesisHash: string;
  readonly endpoints: readonly EndpointV1[];
  readonly finality: { readonly kind: 'evm-finalized-tag' } | { readonly kind: 'solana-commitment'; readonly commitment: 'finalized' };
  readonly assets: readonly AssetV1[]; readonly deployments: readonly DeploymentV1[];
  readonly environment: 'local' | 'testnet' | 'mainnet';
}
export interface RegistryV1 { readonly version: 1; readonly releaseId: string; readonly networks: readonly NetworkV1[]; }

const fail = (code: 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'LIMIT_EXCEEDED' = 'INVALID_INPUT'): never => { throw new ValidationError(code); };

/** Bounded JSON subset parser: objects, arrays, strings, non-negative safe integers, true/false/null. Duplicate keys reject. */
class RegistryJsonParser {
  #index = 0;
  #nodes = 0;
  readonly #source: string;
  constructor(source: string) { this.#source = source; }
  #ws(): void { while (/[\t\n\r ]/.test(this.#source[this.#index] ?? 'x')) this.#index++; }
  #string(): string {
    const start = this.#index++;
    for (;;) {
      const character = this.#source[this.#index++];
      if (character === undefined) return fail();
      if (character === '\\') { if (this.#source[this.#index++] === undefined) return fail(); }
      else if (character === '"') { try { return JSON.parse(this.#source.slice(start, this.#index)) as string; } catch { return fail(); } }
    }
  }
  #literal(word: string, value: unknown): unknown {
    if (this.#source.startsWith(word, this.#index)) { this.#index += word.length; return value; }
    return fail();
  }
  #value(depth: number): unknown {
    // Six levels suffice for v1 (registry > networks > network > deployments > deployment > runtime).
    if (depth > 6 || ++this.#nodes > 50_000) return fail();
    this.#ws();
    const character = this.#source[this.#index];
    if (character === '"') return this.#string();
    if (character === 't') return this.#literal('true', true);
    if (character === 'f') return this.#literal('false', false);
    if (character === 'n') return this.#literal('null', null);
    if (character === '[') {
      this.#index++; this.#ws(); const items: unknown[] = [];
      if (this.#source[this.#index] === ']') { this.#index++; return items; }
      for (;;) {
        items.push(this.#value(depth + 1)); this.#ws();
        const separator = this.#source[this.#index++];
        if (separator === ']') return items;
        if (separator !== ',' || items.length >= 256) return fail();
      }
    }
    if (character === '{') {
      this.#index++; this.#ws();
      const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (this.#source[this.#index] === '}') { this.#index++; return value; }
      for (let count = 0; ; count++) {
        this.#ws(); if (this.#source[this.#index] !== '"' || count >= 32) return fail();
        const key = this.#string();
        if (Object.hasOwn(value, key) || key === '__proto__' || key === 'constructor' || key === 'prototype') return fail();
        this.#ws(); if (this.#source[this.#index++] !== ':') return fail();
        value[key] = this.#value(depth + 1); this.#ws();
        const separator = this.#source[this.#index++];
        if (separator === '}') return value;
        if (separator !== ',') return fail();
      }
    }
    const start = this.#index;
    while (/[0-9]/.test(this.#source[this.#index] ?? 'x')) this.#index++;
    const encoded = this.#source.slice(start, this.#index);
    if (!/^(0|[1-9][0-9]{0,15})$/.test(encoded) || !Number.isSafeInteger(Number(encoded))) return fail();
    return Number(encoded);
  }
  parse(): unknown { const value = this.#value(0); this.#ws(); if (this.#index !== this.#source.length) fail(); return value; }
}

function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
  const actual = Object.keys(input);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) return fail();
  return input as Record<string, unknown>;
}
function list(input: unknown, maximum: number): unknown[] {
  if (!Array.isArray(input)) return fail();
  if (input.length > maximum) return fail('LIMIT_EXCEEDED');
  return input;
}
// Maintainer data-contract choices (G11 leaves exact encodings to implementation; recorded in the handoff):
// IDs are ASCII [A-Za-z0-9._-], start alphanumeric, 1..64, and never contain path separators or "..".
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function id(input: unknown): string { if (typeof input !== 'string' || !ID.test(input) || input.includes('..')) return fail(); return input; }
function hex64(input: unknown): string { if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail(); return input; }
// EVM addresses are canonical lowercase hex; EIP-55 mixed case is rejected rather than normalized.
function evmAddress(input: unknown): string { if (typeof input !== 'string' || !/^0x[0-9a-f]{40}$/.test(input) || /^0x0{40}$/.test(input)) return fail(); return input; }
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** Canonical Solana base58 public key: decodes to exactly 32 bytes with no non-canonical leading zeros. */
function solanaKey(input: unknown): string {
  if (typeof input !== 'string' || input.length < 32 || input.length > 44) return fail();
  let value = 0n;
  for (const character of input) { const digit = BASE58.indexOf(character); if (digit < 0) return fail(); value = value * 58n + BigInt(digit); }
  const leadingOnes = input.length - input.replace(/^1+/, '').length;
  const bytes = value === 0n ? 0 : value.toString(16).length + 1 >> 1;
  if (leadingOnes + bytes !== 32) return fail();
  return input;
}
function unique(values: readonly string[]): void { if (new Set(values).size !== values.length) fail(); }
/**
 * Credential-bearing or ambiguous URLs are rejected, not logged. HTTPS only; plain HTTP only for loopback in a
 * network labeled `local`. Query strings are rejected because RPC providers commonly carry API keys there; a
 * key embedded in a path segment cannot be detected and remains a documented residual.
 */
function endpointUrl(input: unknown, environment: NetworkV1['environment']): string {
  if (typeof input !== 'string' || input.length > 2048) return fail();
  let url: URL;
  try { url = new URL(input); } catch { return fail(); }
  if (url.username || url.password || url.hash || input.includes('#') || url.search || input.includes('?') || url.href !== input) return fail();
  const loopback = url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === 'localhost';
  if (url.protocol === 'https:') return input;
  if (url.protocol === 'http:' && loopback && environment === 'local') return input;
  return fail();
}
function asset(input: unknown, chain: NetworkV1['chain']): AssetV1 {
  const raw = exact(input, ['id', 'kind', 'address', 'decimals', 'transferPolicy']);
  const kind = raw.kind;
  if (kind !== 'native' && !(kind === 'erc20' && chain === 'evm') && !(kind === 'spl' && chain === 'solana')) return fail();
  const address = kind === 'native' ? (raw.address === null ? null : fail()) : chain === 'evm' ? evmAddress(raw.address) : solanaKey(raw.address);
  if (typeof raw.decimals !== 'number' || !Number.isSafeInteger(raw.decimals) || raw.decimals < 0 || raw.decimals > 38) return fail();
  if (raw.transferPolicy !== 'exact-transfer') return fail();
  return Object.freeze({ id: id(raw.id), kind, address, decimals: raw.decimals, transferPolicy: 'exact-transfer' });
}
function deployment(input: unknown, chain: NetworkV1['chain'], assetIds: ReadonlySet<string>): DeploymentV1 {
  const raw = exact(input, ['id', 'address', 'protocolVersion', 'artifactSha256', 'runtime', 'supportedAssetIds']);
  if (raw.protocolVersion !== 1) return fail('UNSUPPORTED_VERSION');
  let runtime: RuntimeIdentityV1;
  const kind = typeof raw.runtime === 'object' && raw.runtime !== null ? (raw.runtime as Record<string, unknown>).kind : undefined;
  if (chain === 'evm' && kind === 'evm-code') {
    const value = exact(raw.runtime, ['kind', 'keccak256', 'upgradeable']);
    // Core v1 rejects mutable proxies/upgradeable contracts; a future profile needs separate policy.
    if (value.upgradeable !== false) return fail();
    runtime = Object.freeze({ kind: 'evm-code', keccak256: hex64(value.keccak256), upgradeable: false });
  } else if (chain === 'solana' && kind === 'solana-program') {
    const value = exact(raw.runtime, ['kind', 'programDataSha256', 'upgradeAuthority']);
    if (value.upgradeAuthority !== null) return fail();
    runtime = Object.freeze({ kind: 'solana-program', programDataSha256: hex64(value.programDataSha256), upgradeAuthority: null });
  } else return fail();
  const supported = list(raw.supportedAssetIds, MAX_ASSETS).map(id);
  unique(supported);
  if (supported.length === 0 || supported.some(value => !assetIds.has(value))) return fail();
  return Object.freeze({ id: id(raw.id), address: chain === 'evm' ? evmAddress(raw.address) : solanaKey(raw.address), protocolVersion: 1,
    artifactSha256: hex64(raw.artifactSha256), runtime, supportedAssetIds: Object.freeze(supported) });
}
function network(input: unknown): NetworkV1 {
  const raw = exact(input, ['id', 'chain', 'chainIdentity', 'genesisHash', 'endpoints', 'finality', 'assets', 'deployments', 'environment']);
  const chain = raw.chain;
  if (chain !== 'evm' && chain !== 'solana') return fail();
  const environment = raw.environment;
  if (environment !== 'local' && environment !== 'testnet' && environment !== 'mainnet') return fail();
  let chainIdentity: string, genesisHash: string;
  if (chain === 'evm') {
    // Canonical decimal EIP-155 chain ID and 0x-prefixed lowercase genesis block hash.
    if (typeof raw.chainIdentity !== 'string' || !/^[1-9][0-9]{0,19}$/.test(raw.chainIdentity)) return fail();
    chainIdentity = raw.chainIdentity;
    if (typeof raw.genesisHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(raw.genesisHash)) return fail();
    genesisHash = raw.genesisHash;
  } else {
    // Solana's chain identity is its genesis hash; both fields must carry the same base58 value.
    chainIdentity = solanaKey(raw.chainIdentity); genesisHash = solanaKey(raw.genesisHash);
    if (chainIdentity !== genesisHash) return fail();
  }
  const finalityRaw = raw.finality as Record<string, unknown> | null;
  let finality: NetworkV1['finality'];
  if (chain === 'evm') { exact(finalityRaw, ['kind']); if (finalityRaw!.kind !== 'evm-finalized-tag') return fail(); finality = Object.freeze({ kind: 'evm-finalized-tag' }); }
  else { exact(finalityRaw, ['kind', 'commitment']); if (finalityRaw!.kind !== 'solana-commitment' || finalityRaw!.commitment !== 'finalized') return fail();
    finality = Object.freeze({ kind: 'solana-commitment', commitment: 'finalized' }); }
  const endpoints = list(raw.endpoints, MAX_ENDPOINTS).map(value => {
    const endpoint = exact(value, ['id', 'url']);
    return Object.freeze({ id: id(endpoint.id), url: endpointUrl(endpoint.url, environment) });
  });
  if (endpoints.length === 0) return fail();
  unique(endpoints.map(value => value.id)); unique(endpoints.map(value => value.url));
  const assets = list(raw.assets, MAX_ASSETS).map(value => asset(value, chain));
  unique(assets.map(value => value.id));
  // One native asset per network: a second null-address native would be ambiguous.
  if (assets.filter(value => value.kind === 'native').length > 1) return fail();
  unique(assets.filter(value => value.address !== null).map(value => value.address as string));
  const assetIds = new Set(assets.map(value => value.id));
  const deployments = list(raw.deployments, MAX_DEPLOYMENTS).map(value => deployment(value, chain, assetIds));
  unique(deployments.map(value => value.id)); unique(deployments.map(value => value.address));
  return Object.freeze({ id: id(raw.id), chain, chainIdentity, genesisHash, endpoints: Object.freeze(endpoints), finality,
    assets: Object.freeze(assets), deployments: Object.freeze(deployments), environment });
}

/**
 * Strict UTF-8 (fatal, BOM rejected) → the same bounded JSON subset used for the registry: duplicate and prototype keys,
 * floats, negatives and unsafe integers reject; depth <= 6, <= 32 keys per object, <= 256 items per array.
 * Structure is unchecked: callers validate exact keys and types afterwards.
 */
export function parseStrictJsonBytes(bytes: Uint8Array, maxBytes: number): unknown {
  if (!(bytes instanceof Uint8Array)) return fail();
  if (bytes.byteLength > maxBytes) return fail('LIMIT_EXCEEDED');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return fail(); }
  if (text.charCodeAt(0) === 0xfeff) return fail();
  return new RegistryJsonParser(text).parse();
}

/** Strict UTF-8 → bounded JSON → frozen RegistryV1. Callers MUST have matched the bytes to a trusted digest first. */
export function parseRegistryBytes(bytes: Uint8Array): RegistryV1 {
  const raw = parseStrictJsonBytes(bytes, MAX_REGISTRY_BYTES);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail();
  if ((raw as Record<string, unknown>).version !== 1) return fail('UNSUPPORTED_VERSION');
  const top = exact(raw, ['version', 'releaseId', 'networks']);
  const networks = list(top.networks, MAX_NETWORKS).map(network);
  unique(networks.map(value => value.id));
  // Two entries for the same chain identity would let a lookup silently pick either.
  unique(networks.map(value => `${value.chain}:${value.chainIdentity}`));
  return Object.freeze({ version: 1, releaseId: id(top.releaseId), networks: Object.freeze(networks) });
}
