/** Library-only, local validator recovery profile. Explicit registry digest, original program and actual genesis. */
import { RegistryService } from '../../../../packages/domain/index.ts';
import { decodeBase64url, encodeBase64url, MAX_REGISTRY_BYTES, type NetworkV1 } from '../../../../packages/schemas/index.ts';

export const SOLANA_LOCALNET_FORMAT = 'p2p-offramp/solana-localnet-config/v1';
export const SOLANA_LOCALNET_BANNER = 'Solana local recovery — test funds only';
export interface SolanaLocalnetDocument {
  readonly format: typeof SOLANA_LOCALNET_FORMAT; readonly ReleaseEnabled: 0;
  readonly registry: string; readonly registrySha256: string; readonly rpcUrl: string;
  readonly margins: { readonly submitMarginSeconds: string; readonly releaseMarginSeconds: string };
}
export interface SolanaLocalnetConfig {
  readonly document: SolanaLocalnetDocument; readonly ReleaseEnabled: 0; readonly registry: RegistryService;
  readonly network: NetworkV1; readonly registrySha256: string; readonly rpcUrl: string; readonly rpcOrigin: string;
  readonly margins: SolanaLocalnetDocument['margins'];
}
export const failConfig = (): never => { throw Error('SOLANA_LOCALNET_CONFIG_INVALID'); };
export function dataFields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return failConfig();
    const proto = Object.getPrototypeOf(input);
    if (proto !== null && proto !== Object.prototype) return failConfig();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !keys.includes(key)) return failConfig();
      const field = Object.getOwnPropertyDescriptor(input, key);
      if (!field || !('value' in field)) return failConfig();
      copy[key] = field.value;
    }
    return copy;
  } catch { return failConfig(); }
}
export function parseSolanaRpcUrl(input: unknown): { readonly url: string; readonly origin: string } {
  if (typeof input !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/$/.test(input)) return failConfig();
  const url = new URL(input);
  if (url.href !== input || !url.port || Number(url.port) > 65535) return failConfig();
  return Object.freeze({ url: input, origin: url.origin });
}
function margins(input: unknown): SolanaLocalnetDocument['margins'] {
  const raw = dataFields(input, ['submitMarginSeconds', 'releaseMarginSeconds']);
  const parse = (key: string, max: bigint): string => {
    const value = raw[key];
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,5})$/.test(value) || BigInt(value) > max) return failConfig();
    return value;
  };
  return Object.freeze({ submitMarginSeconds: parse('submitMarginSeconds', 3600n), releaseMarginSeconds: parse('releaseMarginSeconds', 604800n) });
}
function digest(input: unknown): string {
  return typeof input === 'string' && /^[0-9a-f]{64}$/.test(input) ? input : failConfig();
}
export function solanaLocalnetConfigDocument(input: unknown): SolanaLocalnetDocument {
  const raw = dataFields(input, ['registryJson', 'registryBytes', 'registrySha256', 'rpcUrl', 'margins']);
  if ((raw.registryJson !== undefined) === (raw.registryBytes !== undefined)) return failConfig();
  let bytes: Uint8Array;
  if (raw.registryJson !== undefined) {
    if (typeof raw.registryJson !== 'string') return failConfig();
    bytes = new TextEncoder().encode(raw.registryJson);
  } else {
    if (!(raw.registryBytes instanceof Uint8Array)) return failConfig();
    bytes = Uint8Array.from(raw.registryBytes);
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_REGISTRY_BYTES) return failConfig();
  return Object.freeze({ format: SOLANA_LOCALNET_FORMAT, ReleaseEnabled: 0, registry: encodeBase64url(bytes),
    registrySha256: digest(raw.registrySha256), rpcUrl: parseSolanaRpcUrl(raw.rpcUrl).url, margins: margins(raw.margins) });
}
export async function parseSolanaLocalnetConfig(input: unknown): Promise<SolanaLocalnetConfig> {
  const raw = dataFields(input, ['format', 'ReleaseEnabled', 'registry', 'registrySha256', 'rpcUrl', 'margins']);
  if (Object.keys(raw).length !== 6 || raw.format !== SOLANA_LOCALNET_FORMAT || raw.ReleaseEnabled !== 0) return failConfig();
  const registrySha256 = digest(raw.registrySha256), rpc = parseSolanaRpcUrl(raw.rpcUrl), limits = margins(raw.margins);
  let bytes: Uint8Array;
  try { bytes = decodeBase64url(raw.registry, 1, MAX_REGISTRY_BYTES); } catch { return failConfig(); }
  const registry = new RegistryService(), loaded = await registry.load(bytes, registrySha256);
  if (!loaded.ok) return failConfig();
  const network = loaded.value.networks[0];
  if (loaded.value.networks.length !== 1 || !network || network.chain !== 'solana' || network.environment !== 'local' ||
      network.endpoints.length !== 1 || network.endpoints[0]?.url !== rpc.url || network.assets.length !== 1 ||
      network.assets[0]?.kind !== 'native' || network.assets[0].decimals !== 9 || network.deployments.length !== 1 ||
      network.finality.kind !== 'solana-commitment' || network.finality.commitment !== 'finalized') return failConfig();
  const deployment = network.deployments[0]!;
  if (deployment.runtime.kind !== 'solana-program' || deployment.runtime.upgradeAuthority !== null ||
      deployment.supportedAssetIds.length !== 1 || deployment.supportedAssetIds[0] !== network.assets[0].id) return failConfig();
  const document: SolanaLocalnetDocument = Object.freeze({ format: SOLANA_LOCALNET_FORMAT, ReleaseEnabled: 0,
    registry: raw.registry as string, registrySha256, rpcUrl: rpc.url, margins: limits });
  return Object.freeze({ document, ReleaseEnabled: 0, registry, network, registrySha256, rpcUrl: rpc.url, rpcOrigin: rpc.origin, margins: limits });
}
