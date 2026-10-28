/**
 * Shared helpers for the Sepolia test-network kit (G25). Read-only JSON-RPC, chain identity constants with their
 * primary-source provenance, and artifact digests. Nothing here holds, prints or transmits a private key, and RPC
 * URLs (which may embed a provider API key) are never logged.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { keccak256 } from '../../packages/wallet/src/evm-terms.ts';
import { SEPOLIA_NETWORK } from '../../apps/web/src/testnet/sepolia-network.ts';

/** Sepolia identity (provenance in apps/web/src/testnet/sepolia-network.ts). Checked against the node before any send. */
export const SEPOLIA = Object.freeze({ chainId: BigInt(SEPOLIA_NETWORK.chainIdentity), genesisHash: SEPOLIA_NETWORK.genesisHash });
export const EVM_DIR = fileURLToPath(new URL('../../contracts/evm/', import.meta.url));
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
export const keccakHex = bytes => Buffer.from(keccak256(bytes)).toString('hex');
export const hexToBytes = hex => { const clean = hex.startsWith('0x') ? hex.slice(2) : hex; if (!/^(?:[0-9a-f]{2})*$/i.test(clean)) throw new Error('INVALID_HEX'); return Uint8Array.from(Buffer.from(clean, 'hex')); };

/** A secp256k1 key as Forge's vm.envUint reads it (0x-prefixed lowercase hex), or undefined when malformed. */
export const forgeKey = value => /^(0x)?[0-9a-f]{64}$/i.test(value ?? '') ? `0x${value.replace(/^0x/i, '').toLowerCase()}` : undefined;

/**
 * The registry's public endpoint is signed and shipped in the testnet bundle, so it must carry no credential of the
 * private RPC URLs: their userinfo, query, or any long (key-like) host label or path segment. Keyless URLs may repeat.
 */
export function leaksPrivateRpc(publicEndpoint, privateUrls) {
  const endpoint = String(publicEndpoint ?? '');
  return privateUrls.some(value => {
    let secret; try { secret = new URL(value); } catch { return false; }
    const credentials = [secret.username, secret.password, secret.search.slice(1)].filter(part => part.length >= 6);
    const keyLike = [...secret.hostname.split('.'), ...secret.pathname.split('/')].filter(part => part.length >= 16);
    return [...credentials, ...keyLike].some(part => endpoint.includes(part));
  });
}

export class RpcError extends Error { constructor(code) { super(`RPC ${code}`); this.name = 'RpcError'; this.code = code; } }

/** Minimal JSON-RPC client. Errors carry fixed codes only, never the URL or response body. */
export function rpcClient(url, { timeoutMs = 20_000 } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new RpcError('RPC_URL_MISSING');
  let id = 0;
  return async function rpc(method, params = []) {
    let response;
    try {
      response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(timeoutMs) });
    } catch { throw new RpcError('RPC_UNREACHABLE'); }
    if (!response.ok) throw new RpcError(`RPC_HTTP_${response.status}`);
    let body; try { body = await response.json(); } catch { throw new RpcError('RPC_MALFORMED'); }
    if (body?.error) throw new RpcError(`RPC_ERROR_${Number(body.error.code) || 'UNKNOWN'}`);
    return body?.result;
  };
}

/** Chain id and genesis hash as reported by the node. */
export async function chainIdentity(rpc) {
  const chainId = BigInt(await rpc('eth_chainId'));
  const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
  if (typeof genesis?.hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(genesis.hash)) throw new RpcError('RPC_MALFORMED');
  return { chainId, genesisHash: genesis.hash };
}

/** Pinned-toolchain BasicEscrow artifact: creation and runtime bytecode as built by `forge build`. */
export async function escrowArtifact() {
  const artifact = JSON.parse(await readFile(new URL('../../contracts/evm/out/BasicEscrow.sol/BasicEscrow.json', import.meta.url), 'utf8'));
  const creation = hexToBytes(artifact.bytecode.object), runtime = hexToBytes(artifact.deployedBytecode.object);
  if (creation.length === 0 || runtime.length === 0) throw new Error('ARTIFACT_EMPTY');
  return { creation, runtime, creationSha256: sha256Hex(creation), runtimeKeccak: keccakHex(runtime) };
}
