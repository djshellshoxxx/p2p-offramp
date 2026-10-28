/**
 * Shared helpers for the Sepolia test-network kit (G25). Read-only JSON-RPC, chain identity constants with their
 * primary-source provenance, and artifact digests. Nothing here holds, prints or transmits a private key, and RPC
 * URLs (which may embed a provider API key) are never logged.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { keccak256 } from '../../packages/wallet/src/evm-terms.ts';

/**
 * Sepolia identity, from go-ethereum `params/chainspecs/sepolia.json` (chainId) and `params/config.go`
 * (`SepoliaGenesisHash`), read 2026-10-28. Checked against the connected node before any transaction is sent.
 */
export const SEPOLIA = Object.freeze({ chainId: 11155111n, genesisHash: '0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9' });
export const EVM_DIR = fileURLToPath(new URL('../../contracts/evm/', import.meta.url));
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
export const keccakHex = bytes => Buffer.from(keccak256(bytes)).toString('hex');
export const hexToBytes = hex => { const clean = hex.startsWith('0x') ? hex.slice(2) : hex; if (!/^(?:[0-9a-f]{2})*$/i.test(clean)) throw new Error('INVALID_HEX'); return Uint8Array.from(Buffer.from(clean, 'hex')); };

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
