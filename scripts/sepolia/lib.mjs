/**
 * Shared helpers for the Sepolia test-network kit (G25). Read-only JSON-RPC, chain identity constants with their
 * primary-source provenance, and artifact digests. Nothing here holds, prints or transmits a private key, and RPC
 * URLs (which may embed a provider API key) are never logged.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { keccak256 } from '../../packages/wallet/src/evm-terms.ts';
import { SEPOLIA_NETWORK } from '../../apps/web/src/testnet/sepolia-network.ts';

/** Sepolia identity (provenance in apps/web/src/testnet/sepolia-network.ts). Checked against the node before any send. */
export const SEPOLIA = Object.freeze({ chainId: BigInt(SEPOLIA_NETWORK.chainIdentity), genesisHash: SEPOLIA_NETWORK.genesisHash });
export const EVM_DIR = fileURLToPath(new URL('../../contracts/evm/', import.meta.url));
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);

const FORGE_BASE_ENV = new Set(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SystemRoot', 'USERPROFILE']);
/**
 * Environment for a Forge child: OS basics, FOUNDRY_* settings and SEPOLIA_RPC_URL (read by foundry.toml), plus `extra`,
 * which carries the one key that script reads. Every other variable, including the other parties' private keys, is dropped.
 */
export function forgeEnv(env, extra = {}) {
  const out = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === 'string' && (FORGE_BASE_ENV.has(name) || name.startsWith('FOUNDRY_') || name === 'SEPOLIA_RPC_URL')) out[name] = value;
  }
  return { ...out, ...extra };
}

/**
 * True when the module at `moduleUrl` is the script node was started with. Compares real paths as file URLs, so a
 * checkout path with spaces, non-ASCII characters or a symlink still runs the CLI (a raw `file://${argv[1]}` string
 * comparison silently skips it and exits 0).
 */
export function isMain(moduleUrl) {
  try { return process.argv[1] !== undefined && moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; }
}

/** Toolchain pins, as recorded in contracts/evm/README.md (the kit test checks the README agrees). */
export const TOOLCHAIN = Object.freeze({
  forgeVersion: '1.5.1-v1.5.1', forgeCommit: 'b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2',
  solcVersion: '0.8.30', solcSha256: 'f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7',
});
export class KitError extends Error { constructor(code) { super(code); this.name = 'KitError'; this.code = code; } }

/** The forge on PATH and the solc Foundry will use must be the pinned ones; returns what was checked, for the record. */
export async function checkToolchain(env = process.env) {
  let version;
  try { version = (await run('forge', ['--version'], { env: forgeEnv(env) })).stdout; } catch { throw new KitError('TOOLCHAIN_MISSING'); }
  const forgeVersion = /forge Version: (\S+)/.exec(version)?.[1], forgeCommit = /Commit SHA: ([0-9a-f]{40})/.exec(version)?.[1];
  if (forgeVersion !== TOOLCHAIN.forgeVersion || forgeCommit !== TOOLCHAIN.forgeCommit) throw new KitError('TOOLCHAIN_MISMATCH');
  const solcPath = env.FOUNDRY_SOLC || resolve(env.HOME || homedir(), '.svm', TOOLCHAIN.solcVersion, `solc-${TOOLCHAIN.solcVersion}`);
  let solc;
  try { solc = await readFile(solcPath); } catch { throw new KitError('TOOLCHAIN_MISSING'); }
  if (sha256Hex(solc) !== TOOLCHAIN.solcSha256) throw new KitError('TOOLCHAIN_MISMATCH');
  return { forgeVersion, forgeCommit, solcVersion: TOOLCHAIN.solcVersion, solcSha256: TOOLCHAIN.solcSha256 };
}

/**
 * The contract sources must be exactly the committed ones, so the recorded sourceCommit is what was built: no modified,
 * staged or untracked file under contracts/evm (build outputs are git-ignored) and no submodule off its pinned commit.
 */
export async function checkCleanSource(root = ROOT) {
  let status, submodules;
  try {
    status = (await run('git', ['status', '--porcelain', '--untracked-files=all', '--', 'contracts/evm'], { cwd: root })).stdout;
    submodules = (await run('git', ['submodule', 'status'], { cwd: root })).stdout.split('\n').filter(line => line.includes(' contracts/evm/lib/'));
  } catch { throw new KitError('SOURCE_STATUS_UNAVAILABLE'); }
  if (status.trim() !== '' || submodules.some(line => /^[-+U]/.test(line))) throw new KitError('DIRTY_SOURCE');
  return (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
}
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

/** True for a plain-HTTP URL whose host is loopback (local anvil); anything else must use HTTPS. */
export function isLoopbackUrl(url) {
  let host; try { host = new URL(url).hostname; } catch { return false; }
  return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export class RpcError extends Error { constructor(code) { super(`RPC ${code}`); this.name = 'RpcError'; this.code = code; } }

/** Local tool transport bound; paged logs must fit one bounded response. */
export const MAX_RPC_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_RPC_REVERT_BYTES = 65_536;
/** Minimal bounded JSON-RPC client. Fixed errors never echo the URL or response body. */
export function rpcClient(url, { timeoutMs = 20_000 } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new RpcError('RPC_URL_MISSING');
  if (url.startsWith('http://') && !isLoopbackUrl(url)) throw new RpcError('RPC_URL_INSECURE');
  let parsed;
  try { parsed = new URL(url); } catch { throw new RpcError('RPC_URL_MISSING'); }
  if (parsed.username || parsed.password) throw new RpcError('RPC_URL_INVALID');
  let sequence = 0;
  return async function rpc(method, params = [], { includeRevertData = false } = {}) {
    const id = ++sequence;
    let response, reader;
    try {
      response = await fetch(url, { method: 'POST', redirect: 'error', credentials: 'omit',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(timeoutMs) });
    } catch { throw new RpcError('RPC_UNREACHABLE'); }
    if (response.redirected || !response.ok) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      throw new RpcError(response.redirected ? 'RPC_REDIRECTED' : `RPC_HTTP_${response.status}`);
    }
    let body;
    try {
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_RPC_RESPONSE_BYTES)) throw new RpcError('RPC_RESPONSE_TOO_LARGE');
      if (!response.body) throw new RpcError('RPC_MALFORMED');
      reader = response.body.getReader();
      const chunks = []; let size = 0, reads = 0;
      for (;;) {
        if (++reads > 65536) throw new RpcError('RPC_RESPONSE_TOO_LARGE');
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_RPC_RESPONSE_BYTES) throw new RpcError('RPC_RESPONSE_TOO_LARGE');
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      throw error instanceof RpcError ? error : new RpcError('RPC_MALFORMED');
    } finally { if (reader) void reader.cancel().catch(() => undefined); else if (response.body) void response.body.cancel().catch(() => undefined); }
    if (typeof body !== 'object' || body === null || Array.isArray(body) || body.jsonrpc !== '2.0' || body.id !== id ||
        Object.hasOwn(body, 'error') === Object.hasOwn(body, 'result')) throw new RpcError('RPC_MALFORMED');
    if (Object.hasOwn(body, 'error')) {
      if (typeof body.error !== 'object' || body.error === null || !Number.isSafeInteger(body.error.code)) throw new RpcError('RPC_MALFORMED');
      const error = new RpcError(`RPC_ERROR_${body.error.code}`);
      // Control probes need custom-error bytes, never the provider's message, nested data or arbitrary fields.
      // This opt-in is limited to eth_call and a bounded, even-length hexadecimal value.
      const data = body.error.data;
      if (includeRevertData && method === 'eth_call' && typeof data === 'string' && data.length <= 2 + MAX_RPC_REVERT_BYTES * 2 && /^0x(?:[0-9a-f]{2})*$/i.test(data)) {
        Object.defineProperty(error, 'revertData', { value: data.toLowerCase(), enumerable: true });
      }
      throw error;
    }
    return body.result;
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
