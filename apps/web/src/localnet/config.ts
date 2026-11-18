/**
 * Localnet build profile configuration (A3). Library-only: apps/web/scripts/build.mjs accepts it solely as an explicit
 * `buildWeb({ delivery: 'localnet', localnet })` option from a test harness; no CLI argument or environment variable
 * reaches it. The same strict validator runs at build time (Node) and again at runtime on the embedded frozen JSON
 * (`__P2P_LOCALNET_CONFIG__`), so a hand-edited artifact fails closed instead of widening anything.
 *
 * What it admits: exactly one EVM network with chain id 31337 labelled `local`, whose RPC endpoints are loopback HTTP;
 * the exact registry bytes bound to an independently supplied SHA-256; a trusted escrow layout policy whose keys are
 * exactly the registry deployments' runtime Keccak values (computed by the caller from the forge artifact's
 * deployedBytecode, never from eth_getCode on the same RPC) and whose values are `canonical-get-trade-v1`; and one
 * plain-WebSocket loopback relay URL. `ReleaseEnabled` is the literal 0 and is checked, not defaulted.
 * Nothing here grants a network permission, signs, sends, or contacts a chain or relay.
 */
import { RegistryService } from '../../../../packages/domain/index.ts';
import { decodeBase64url, encodeBase64url, MAX_REGISTRY_BYTES, type NetworkV1, type RegistryV1 } from '../../../../packages/schemas/index.ts';

export const LOCALNET_CONFIG_FORMAT = 'p2p-offramp/localnet-config/v1';
/** Visible test-funds marker; the localnet artifact scan requires it and every other artifact scan refuses it. */
export const LOCALNET_BANNER = 'Local test network — test funds only';
export const LOCALNET_CHAIN_ID = '31337';
export type LocalnetEscrowLayout = 'canonical-get-trade-v1';
export type LocalnetConfigCode = 'LOCALNET_CONFIG_INVALID' | 'LOCALNET_REGISTRY' | 'LOCALNET_NETWORK' | 'LOCALNET_ESCROW_LAYOUTS' | 'LOCALNET_RELAY_URL';

/** The exact JSON document embedded by the localnet build (and nothing else). */
export interface LocalnetConfigDocumentV1 {
  readonly format: typeof LOCALNET_CONFIG_FORMAT;
  readonly ReleaseEnabled: 0;
  /** base64url (unpadded) of the exact registry bytes. */
  readonly registry: string;
  readonly registrySha256: string;
  readonly escrowLayouts: Readonly<Record<string, LocalnetEscrowLayout>>;
  readonly relayUrl: string;
}
/** The library-only `buildWeb` option. Supply exactly one of `registryBytes` or `registryJson` (exact UTF-8 text). */
export interface LocalnetBuildOption {
  readonly registryBytes?: Uint8Array | undefined;
  readonly registryJson?: string | undefined;
  readonly registrySha256: string;
  readonly escrowLayouts: Readonly<Record<string, LocalnetEscrowLayout>>;
  readonly relayUrl: string;
}
export interface LocalnetConfig {
  readonly document: Readonly<LocalnetConfigDocumentV1>;
  readonly ReleaseEnabled: 0;
  readonly registryBytes: Uint8Array;
  readonly registrySha256: string;
  /** Loaded by digest; `network()`/`deployment()` lookups for EvmChainReader and the wallet adapter. */
  readonly registry: RegistryService;
  readonly registryValue: RegistryV1;
  readonly network: NetworkV1;
  /** Trusted bundled policy for `new EvmChainReader({ escrowLayouts })`. */
  readonly escrowLayouts: Readonly<Record<string, LocalnetEscrowLayout>>;
  readonly relayUrl: string;
  /** `ws://127.0.0.1:PORT` / `ws://[::1]:PORT`: the only connect-src origin of the localnet CSP. */
  readonly relayOrigin: string;
}

export class LocalnetConfigError extends Error {
  readonly code: LocalnetConfigCode;
  constructor(code: LocalnetConfigCode) { super(code); this.name = 'LocalnetConfigError'; this.code = code; }
}
const fail = (code: LocalnetConfigCode = 'LOCALNET_CONFIG_INVALID'): never => { throw new LocalnetConfigError(code); };

/** Own data properties of a plain object; inherited, accessor, symbol and unexpected keys fail closed. */
function fields(input: unknown, allowed: readonly string[], code: LocalnetConfigCode = 'LOCALNET_CONFIG_INVALID'): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail(code);
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail(code);
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !allowed.includes(key)) return fail(code);
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) return fail(code);
      copy[key] = descriptor.value;
    }
    return copy;
  } catch (error) { if (error instanceof LocalnetConfigError) throw error; return fail(code); }
}

/**
 * `ws://127.0.0.1:PORT/` or `ws://[::1]:PORT/`: explicit non-default port, root path, no credentials, query or fragment,
 * already in canonical URL form. `localhost` is refused (it is a name, resolvable elsewhere). Chromium 153's CSP parser
 * ignores an IPv6-literal source (`ws://[::1]:PORT`), which leaves connect-src empty: such a build fails closed (the relay
 * is blocked), so harnesses should use 127.0.0.1.
 */
export function parseLocalnetRelayUrl(input: unknown): { readonly url: string; readonly origin: string } {
  if (typeof input !== 'string' || input.length > 64 || input.includes('?') || input.includes('#') || input.includes('@')) return fail('LOCALNET_RELAY_URL');
  let url: URL;
  try { url = new URL(input); } catch { return fail('LOCALNET_RELAY_URL'); }
  if (url.href !== input || url.protocol !== 'ws:' || (url.hostname !== '127.0.0.1' && url.hostname !== '[::1]') || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' || !/^[1-9][0-9]{0,4}$/.test(url.port) || Number(url.port) > 65535) return fail('LOCALNET_RELAY_URL');
  return Object.freeze({ url: input, origin: `ws://${url.hostname}:${url.port}` });
}

function layoutPolicy(input: unknown): Readonly<Record<string, LocalnetEscrowLayout>> {
  let keys: string[];
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('LOCALNET_ESCROW_LAYOUTS');
    keys = Reflect.ownKeys(input).map(key => typeof key === 'string' ? key : fail('LOCALNET_ESCROW_LAYOUTS'));
  } catch (error) { if (error instanceof LocalnetConfigError) throw error; return fail('LOCALNET_ESCROW_LAYOUTS'); }
  if (keys.length === 0 || keys.length > 16 || keys.some(key => !/^[0-9a-f]{64}$/.test(key))) return fail('LOCALNET_ESCROW_LAYOUTS');
  const raw = fields(input, keys, 'LOCALNET_ESCROW_LAYOUTS');
  const policy: Record<string, LocalnetEscrowLayout> = {};
  for (const key of keys.sort()) {
    if (raw[key] !== 'canonical-get-trade-v1') return fail('LOCALNET_ESCROW_LAYOUTS');
    policy[key] = 'canonical-get-trade-v1';
  }
  return Object.freeze(policy);
}
function digest(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail('LOCALNET_REGISTRY');
  return input;
}

/** Build time: turns the library-only option into the exact embedded document (shape checks; network checks are async). */
export function localnetConfigDocument(option: unknown): Readonly<LocalnetConfigDocumentV1> {
  const raw = fields(option, ['registryBytes', 'registryJson', 'registrySha256', 'escrowLayouts', 'relayUrl']);
  const hasBytes = raw.registryBytes !== undefined, hasJson = raw.registryJson !== undefined;
  if (hasBytes === hasJson) return fail();
  let bytes: Uint8Array;
  if (hasBytes) {
    if (!(raw.registryBytes instanceof Uint8Array)) return fail();
    bytes = Uint8Array.from(raw.registryBytes);
  } else {
    if (typeof raw.registryJson !== 'string') return fail();
    bytes = new TextEncoder().encode(raw.registryJson);
  }
  if (bytes.length === 0 || bytes.length > MAX_REGISTRY_BYTES) return fail('LOCALNET_REGISTRY');
  return Object.freeze({ format: LOCALNET_CONFIG_FORMAT, ReleaseEnabled: 0, registry: encodeBase64url(bytes), registrySha256: digest(raw.registrySha256),
    escrowLayouts: layoutPolicy(raw.escrowLayouts), relayUrl: parseLocalnetRelayUrl(raw.relayUrl).url });
}

const loopbackRpc = (value: string): boolean => {
  try { const url = new URL(value); return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]'); } catch { return false; }
};

/** Build time and runtime: the full strict check of an embedded document. Throws LocalnetConfigError (fail closed). */
export async function parseLocalnetConfig(input: unknown): Promise<LocalnetConfig> {
  const raw = fields(input, ['format', 'ReleaseEnabled', 'registry', 'registrySha256', 'escrowLayouts', 'relayUrl']);
  if (raw.format !== LOCALNET_CONFIG_FORMAT || raw.ReleaseEnabled !== 0 || Object.keys(raw).length !== 6) return fail();
  const registrySha256 = digest(raw.registrySha256);
  const layouts = layoutPolicy(raw.escrowLayouts);
  const relay = parseLocalnetRelayUrl(raw.relayUrl);
  let registryBytes: Uint8Array;
  try { registryBytes = decodeBase64url(raw.registry, 1, MAX_REGISTRY_BYTES); } catch { return fail('LOCALNET_REGISTRY'); }
  const registry = new RegistryService();
  const loaded = await registry.load(registryBytes, registrySha256);
  if (!loaded.ok) return fail('LOCALNET_REGISTRY');
  const networks = loaded.value.networks;
  const network = networks[0];
  if (networks.length !== 1 || !network || network.chain !== 'evm' || network.chainIdentity !== LOCALNET_CHAIN_ID || network.environment !== 'local' ||
      network.endpoints.some(endpoint => !loopbackRpc(endpoint.url)) || network.deployments.length === 0) return fail('LOCALNET_NETWORK');
  // The trusted layout policy names exactly the registry's runtimes: no extra key, no deployment left unmapped.
  const runtimes = new Set(network.deployments.map(deployment => deployment.runtime.kind === 'evm-code' ? deployment.runtime.keccak256 : fail('LOCALNET_NETWORK')));
  const keys = Object.keys(layouts);
  if (keys.length !== runtimes.size || keys.some(key => !runtimes.has(key))) return fail('LOCALNET_ESCROW_LAYOUTS');
  const document: LocalnetConfigDocumentV1 = Object.freeze({ format: LOCALNET_CONFIG_FORMAT, ReleaseEnabled: 0, registry: raw.registry as string,
    registrySha256, escrowLayouts: layouts, relayUrl: relay.url });
  return Object.freeze({ document, ReleaseEnabled: 0, registryBytes, registrySha256, registry, registryValue: loaded.value, network,
    escrowLayouts: layouts, relayUrl: relay.url, relayOrigin: relay.origin });
}

/** Runtime only: the build-injected document (null outside the localnet build), re-validated before any use. */
export function loadInjectedLocalnetConfig(): Promise<LocalnetConfig> {
  return parseLocalnetConfig(__P2P_LOCALNET_CONFIG__);
}
