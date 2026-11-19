// Runs the TypeScript reader (packages/chain-solana) against the real local validator, so the localnet run also
// checks what a client would see. Local integration only: the registry below is built here, not G15-signed.
//
// Genesis: the synthetic `localnet` profile compiles the ASCII constant `genesis-hash:p2p-offramp:localv1` into the
// program, so every on-chain terms hash binds that constant, while the validator has its own genesis hash. The RPC
// adapter maps exactly the validator genesis recorded at startup to the compiled constant (any other value fails);
// every other method and result passes through unchanged. Nothing else is translated or faked.
import { createHash } from 'node:crypto';
import { register } from 'node:module';

register('../../../scripts/test-support/tsx-hooks.mjs', import.meta.url);
const { SolanaChainReader } = await import('../../../packages/chain-solana/src/reader.ts');
const { RegistryService } = await import('../../../packages/domain/src/registry.ts');

export const NETWORK_ID = 'solana-localnet';
export const DEPLOYMENT_ID = 'escrow-v1';
const RETRIES = 10;

/** RPC port over the driver: the only translation is the recorded validator genesis -> compiled genesis. */
function readRpc(rpc, validatorGenesis, compiledGenesis) {
  return {
    async request({ method, params }) {
      const result = await rpc.call(method, params ?? []);
      if (method !== 'getGenesisHash') return result;
      if (result !== validatorGenesis) throw new Error('unexpected validator genesis');
      return compiledGenesis;
    },
  };
}

async function localRegistry({ compiledGenesis, rpcUrl, programId, programDataSha256, soSha256, mints }) {
  const assets = [{ id: 'sol', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' },
    ...mints.map(({ id, address }) => ({ id, kind: 'spl', address, decimals: 6, transferPolicy: 'exact-transfer' }))];
  const registry = {
    version: 1, releaseId: 'localnet-reader-check',
    networks: [{
      id: NETWORK_ID, chain: 'solana', chainIdentity: compiledGenesis, genesisHash: compiledGenesis,
      endpoints: [{ id: 'local', url: `${rpcUrl}/` }],
      finality: { kind: 'solana-commitment', commitment: 'finalized' }, assets,
      deployments: [{
        id: DEPLOYMENT_ID, address: programId, protocolVersion: 1, artifactSha256: soSha256,
        runtime: { kind: 'solana-program', programDataSha256, upgradeAuthority: null },
        supportedAssetIds: assets.map((asset) => asset.id),
      }],
      environment: 'local',
    }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(registry));
  const service = new RegistryService();
  const digest = createHash('sha256').update(bytes).digest('hex');
  const loaded = await service.load(bytes, digest);
  if (!loaded.ok) throw new Error(`local registry refused: ${loaded.error.code}`);
  return service;
}

/** G16 terms of a localnet trade, rebuilt from its funding arguments (as packages/chain-solana fixture tests do). */
export function termsOf({ compiledGenesis, programId, seller, args, mint, tokenProgram }) {
  const hex = (bytes) => Buffer.from(bytes).toString('hex');
  return {
    genesisHash: compiledGenesis, programId, orderId: hex(args.orderId), seller, buyer: args.buyer,
    assetKind: mint ? 'spl' : 'native', mint: mint ?? null, tokenProgram: mint ? tokenProgram : null,
    privateAgreementHash: hex(args.privateAgreementHash), capabilitiesHash: hex(args.capabilitiesHash),
    sellerNonce: hex(args.sellerNonce), revision: String(args.revision), amountBaseUnits: String(args.amount),
    acceptBeforeSeconds: String(args.acceptBefore), escrowExpirySeconds: String(args.expiry),
  };
}

/**
 * A reader with the localnet registry and the given freeze-authority permits. `observe(terms, tradeId)` returns
 * { snapshot, observation, payout } from three finalized reads, retrying only UNAVAILABLE/TIMEOUT (a read is
 * idempotent; a just-rooted block can briefly be missing from getBlock).
 */
export async function createReaderCheck(options) {
  const { rpc, validatorGenesis, compiledGenesis, freezeAuthorityPermits = [], sleep } = options;
  const registry = await localRegistry(options);
  const reader = new SolanaChainReader({ rpc: readRpc(rpc, validatorGenesis, compiledGenesis), registry,
    timeoutMs: 30_000, freezeAuthorityPermits });
  let sequence = 0;
  const attempt = async (call) => {
    for (let index = 1; ; index++) {
      const result = await call({ generation: 1, requestSequence: ++sequence, signal: new AbortController().signal });
      const transient = !result.ok && (result.error.code === 'UNAVAILABLE' || result.error.code === 'TIMEOUT');
      if (!transient || index === RETRIES) return result;
      await sleep(1000);
    }
  };
  const unwrap = (label, result) => {
    if (!result.ok) throw new Error(`reader ${label}: ${result.error.code}`);
    return result.value;
  };
  return {
    async observe(terms, tradeId) {
      const binding = { chain: 'solana', networkId: NETWORK_ID, deploymentId: DEPLOYMENT_ID, tradeId };
      const snapshot = unwrap('read', await attempt((request) => reader.read(binding, request, terms)));
      const observation = unwrap('readValidated',
        await attempt((request) => reader.readValidated(binding, request, terms)));
      const payout = unwrap('readPayout', await attempt((request) => reader.readPayout(binding, request, terms)));
      return { snapshot, observation, payout };
    },
    async validateLive() {
      return unwrap('validateLive', await attempt(() => reader.validateLive(NETWORK_ID, DEPLOYMENT_ID)));
    },
    dispose: () => reader.dispose(),
  };
}
