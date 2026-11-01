/** Historical canonical-EVM recovery only. No signing, sending, funding or journal replay. */
import { RegistryService } from '../../packages/domain/index.ts';
import { parseTradeBinding } from '../../packages/schemas/index.ts';
import { EvmChainReader } from '../../packages/chain-evm/src/reader.ts';
import { buildGetTrade, buildPendingWithdrawals, buildRelease, buildRefund, buildWithdraw, decodeTrade } from '../../packages/wallet/src/evm-escrow.ts';
import { rpcClient } from '../sepolia/lib.mjs';

export const RECOVERY_FORMAT = 'p2p-offramp/canonical-evm-recovery/v1';
const HASH = /^0x[0-9a-f]{64}$/, DIGEST = /^[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/;
const ZERO = '0x'+'0'.repeat(40), codes = new WeakMap();
export class RecoveryError extends Error {
  constructor(code) { super('EVM recovery refused.'); this.code = code; codes.set(this, code); }
}
export const refuseRecovery = code => { throw new RecoveryError(code); };
export const recoveryErrorCode = error => typeof error === 'object' && error !== null ? codes.get(error) ?? 'UNAVAILABLE' : 'UNAVAILABLE';
function object(value, names) {
  if (typeof value !== 'object' || value === null || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return refuseRecovery('INVALID_INPUT');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => !names.includes(key))) return refuseRecovery('INVALID_INPUT');
  const result = Object.create(null);
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    if (!d || !d.enumerable || !('value' in d)) return refuseRecovery('INVALID_INPUT');
    result[name] = d.value;
  }
  return result;
}
const text = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : refuseRecovery('INVALID_INPUT');
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(value) ? BigInt(value).toString() : refuseRecovery('INTEGRITY_FAILURE');
const tag = number => '0x'+BigInt(number).toString(16);
function header(value) {
  const field = name => {
    if (typeof value !== 'object' || value === null) return refuseRecovery('INTEGRITY_FAILURE');
    const d = Object.getOwnPropertyDescriptor(value,name);
    if (!d || !('value' in d)) return refuseRecovery('INTEGRITY_FAILURE');
    return d.value;
  };
  const number = quantity(field('number')), timestamp = quantity(field('timestamp'));
  if (BigInt(timestamp) >= 1n << 64n) return refuseRecovery('INTEGRITY_FAILURE');
  return Object.freeze({ number, hash: text(field('hash'), HASH), timestamp });
}
const sameHeader = (a,b) => a.number === b.number && a.hash === b.hash && a.timestamp === b.timestamp;
const unwrap = result => result.ok ? result.value : refuseRecovery(result.error.code);

/** The executable's embedded profile is trusted composition, not an imported approval token. */
export async function loadArchivedRecoveryProfile(input) {
  try {
    const outer = object(input, ['format','release','registry','abi','networkId','deploymentId','historicalOnly','releaseEnabled']);
    if (outer.format !== RECOVERY_FORMAT || outer.historicalOnly !== true || outer.releaseEnabled !== false) return refuseRecovery('INVALID_INPUT');
    const registry = Object.freeze(object(outer.registry, ['path','sha256','bytes'])), abi = Object.freeze(object(outer.abi, ['path','sha256','bytes']));
    const release = Object.freeze(object(outer.release, ['releaseId','manifestSha256','sequence','expiresAt','sourceCommit']));
    const profile = Object.freeze({...outer,registry,abi,release});
    text(profile.networkId,/^[A-Za-z0-9:_-]{1,64}$/); text(profile.deploymentId,/^[A-Za-z0-9:_-]{1,64}$/);
    text(registry.path,/^[A-Za-z0-9._/-]{1,240}$/); text(abi.path,/^[A-Za-z0-9._/-]{1,240}$/);
    text(registry.sha256, DIGEST); text(abi.sha256, DIGEST); text(release.manifestSha256, DIGEST); text(release.sourceCommit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
    if (!Number.isSafeInteger(release.sequence) || release.sequence < 1 || !Number.isSafeInteger(release.expiresAt) || release.expiresAt < 0 ||
        !Number.isSafeInteger(abi.bytes) || abi.bytes < 1 || abi.bytes > 1024*1024 || typeof registry.bytes !== 'string' || registry.bytes.length > 1_398_104 || !/^[A-Za-z0-9_-]+$/.test(registry.bytes)) return refuseRecovery('INVALID_INPUT');
    const bytes = Buffer.from(registry.bytes, 'base64url');
    if (bytes.toString('base64url') !== registry.bytes) return refuseRecovery('INVALID_INPUT');
    const service = new RegistryService(), parsed = unwrap(await service.load(new Uint8Array(bytes), registry.sha256));
    if (parsed.releaseId !== release.releaseId) return refuseRecovery('ASSET_MISMATCH');
    const network = service.network(profile.networkId), deployment = service.deployment(profile.networkId, profile.deploymentId);
    if (!network || !deployment || network.chain !== 'evm' || network.environment === 'mainnet' || network.finality.kind !== 'evm-finalized-tag' ||
        deployment.protocolVersion !== 1 || deployment.runtime.kind !== 'evm-code' || deployment.runtime.upgradeable !== false) return refuseRecovery('UNSUPPORTED_PROVIDER');
    return { profile, registry: service, network, deployment };
  } catch (error) { return refuseRecovery(recoveryErrorCode(error)); }
}

/** Fresh native read. The isolated reader is used only for validateLive, never its escrow ABI. */
async function readRecovery({ profile, binding: input, endpointId, request, signal }) {
  let live;
  try {
    const deadline = performance.now()+10_000;
    const timed = AbortSignal.timeout(10_000), readSignal = signal ? AbortSignal.any([signal,timed]) : timed;
    const stopped = () => new RecoveryError(signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
    const guard = () => {
      if (readSignal.aborted) throw stopped();
      if (performance.now() >= deadline) refuseRecovery('TIMEOUT');
    };
    guard();
    const binding = parseTradeBinding(input);
    const selected = await loadArchivedRecoveryProfile(profile); guard();
    const { registry, network, deployment } = selected;
    if (binding.chain !== 'evm' || !DIGEST.test(binding.tradeId) || binding.networkId !== selected.profile.networkId || binding.deploymentId !== selected.profile.deploymentId) return refuseRecovery('WRONG_CHAIN');
    const endpoint = network.endpoints.find(item => item.id === endpointId);
    if (!endpoint) return refuseRecovery('UNSUPPORTED_PROVIDER');
    const rpc = request ?? (({method,params}) => transport(method,params));
    const transport = request ? undefined : rpcClient(endpoint.url, { timeoutMs: 10_000 });
    let reads = 0;
    const call = async (method, params = []) => {
      guard(); if (++reads > 20) return refuseRecovery('LIMIT_EXCEEDED');
      let onAbort;
      const cancelled = new Promise((_,reject) => { onAbort=()=>reject(stopped()); readSignal.addEventListener('abort',onAbort,{once:true}); });
      try {
        const physical = Promise.resolve().then(() => { guard(); return rpc({method,params}); });
        const answer = await Promise.race([physical,cancelled]); guard(); return answer;
      } finally { readSignal.removeEventListener('abort',onAbort); }
    };
    live = new EvmChainReader({ registry, rpc: { request: ({method,params}) => call(method,params) }, timeoutMs: 10_000 });
    const identity = await live.validateLive(binding.networkId,binding.deploymentId,readSignal); guard();
    const identityAnchor = unwrap(identity);
    const anchor = header(await call('eth_getBlockByNumber',['latest',false]));
    if (BigInt(anchor.number) < BigInt(identityAnchor.height) || BigInt(anchor.timestamp) < BigInt(identityAnchor.timestampSeconds)) return refuseRecovery('INTEGRITY_FAILURE');
    if (anchor.number === identityAnchor.height && (anchor.hash !== identityAnchor.hash || anchor.timestamp !== identityAnchor.timestampSeconds)) return refuseRecovery('INTEGRITY_FAILURE');
    const getTrade = buildGetTrade(deployment.address,binding.tradeId);
    const raw = await call('eth_call',[{to:getTrade.to,data:getTrade.data},tag(anchor.number)]);
    if (typeof raw !== 'string' || raw.length !== 386) return refuseRecovery('INTEGRITY_FAILURE');
    const trade = decodeTrade(raw);
    const asset = network.assets.find(item => trade.token === ZERO ? item.kind === 'native' : item.kind === 'erc20' && item.address === trade.token);
    if (trade.state !== 'absent' && (!asset || !deployment.supportedAssetIds.includes(asset.id))) return refuseRecovery('UNSUPPORTED_PROVIDER');
    let pendingWithdrawal = null;
    if (trade.state === 'released' || trade.state === 'refunded') {
      const recipient = trade.state === 'released' ? trade.buyer : trade.seller, pending = buildPendingWithdrawals(deployment.address,recipient,trade.token);
      const returned = await call('eth_call',[{to:pending.to,data:pending.data},tag(anchor.number)]);
      if (typeof returned !== 'string' || !/^0x[0-9a-f]{64}$/.test(returned)) return refuseRecovery('INTEGRITY_FAILURE');
      pendingWithdrawal = Object.freeze({recipient,token:trade.token,amount:BigInt(returned).toString()});
    }
    if (!sameHeader(anchor,header(await call('eth_getBlockByNumber',[tag(anchor.number),false])))) return refuseRecovery('INTEGRITY_FAILURE');
    if (quantity(await call('eth_chainId')) !== network.chainIdentity) return refuseRecovery('WRONG_CHAIN');
    const genesis = header(await call('eth_getBlockByNumber',['0x0',false]));
    if (genesis.number !== '0' || genesis.hash !== network.genesisHash) return refuseRecovery('WRONG_CHAIN');
    if (!sameHeader(anchor,header(await call('eth_getBlockByNumber',[tag(anchor.number),false])))) return refuseRecovery('INTEGRITY_FAILURE');
    guard();
    return { snapshot:Object.freeze({ binding, trade, anchor, identityAnchor, pendingWithdrawal, historicalOnly:true, releaseEnabled:false }),network,deployment };
  } catch (error) { return refuseRecovery(recoveryErrorCode(error)); }
  finally { live?.dispose(); }
}

export async function inspectEvmRecovery(options) { return (await readRecovery(options)).snapshot; }

export async function prepareEvmRecovery(options) {
  try {
    const { action, from, signal } = options;
    text(from,ADDRESS); if (from === ZERO) return refuseRecovery('INVALID_INPUT');
    if (!['release','refund','withdraw'].includes(action)) return refuseRecovery('INVALID_INPUT');
    const { snapshot, network, deployment } = await readRecovery(options), { trade } = snapshot;
    let call;
    if (action === 'withdraw') {
      const credit = snapshot.pendingWithdrawal;
      if (!credit || credit.amount === '0') return refuseRecovery('CONFLICT');
      call = buildWithdraw(deployment.address,credit.recipient,credit.token);
    } else {
      if (trade.state !== 'funded') return refuseRecovery('CONFLICT');
      if (action === 'release') {
        if (from !== trade.seller) return refuseRecovery('USER_REJECTED');
        if (BigInt(snapshot.anchor.timestamp) >= BigInt(trade.deadline)) return refuseRecovery('CONFLICT');
        call = buildRelease(deployment.address,snapshot.binding.tradeId);
      } else {
        if (BigInt(snapshot.anchor.timestamp) < BigInt(trade.deadline)) return refuseRecovery('CONFLICT');
        call = buildRefund(deployment.address,snapshot.binding.tradeId);
      }
    }
    if (signal?.aborted) return refuseRecovery('CANCELLED');
    return Object.freeze({ ...snapshot, transaction:Object.freeze({chainId:tag(network.chainIdentity),from,to:call.to,data:call.data,value:'0x0'}) });
  } catch (error) { return refuseRecovery(recoveryErrorCode(error)); }
}
