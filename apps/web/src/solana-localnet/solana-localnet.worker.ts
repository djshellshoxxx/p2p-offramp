/** Actual module Worker: encrypted vault, native client and sole RPC capability are owned here. */
import { parseSolanaLocalnetConfig } from './config.ts';
import { createSolanaLocalRpc } from './rpc.ts';
import { SolanaRecoveryController } from './controller.ts';
import { wireBase64, wireBytes } from './wallet-bridge.ts';
import type { SolanaWalletPort } from '../../../../packages/chain-solana/localnet.ts';
import type { SolanaWalletRequest, SolanaWorkerInput, SolanaWorkerOutput } from './protocol.ts';
const host = globalThis as unknown as { postMessage(value: SolanaWorkerOutput): void;
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void; close(): void };
let closed = false, sequence = 0, lastCommand = 0;
const jobs = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const post = (message: SolanaWorkerOutput) => { if (!closed) host.postMessage(message); };
function askWallet(request: SolanaWalletRequest): Promise<unknown> {
  if (closed || jobs.size >= 2) return Promise.reject(Error('WALLET_UNAVAILABLE'));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { jobs.delete(id); reject(Error('WALLET_TIMEOUT')); }, 90000);
    jobs.set(id, { resolve, reject, timer }); post({ kind: 'wallet.request', id, request });
  });
}
const wallet: SolanaWalletPort = { features: {
  'standard:connect': { version: '1.0.0', async connect() {
    return await askWallet({ method: 'connect' }) as Awaited<ReturnType<SolanaWalletPort['features']['standard:connect']['connect']>>;
  } },
  'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], async signTransaction(...inputs) {
    if (inputs.length !== 1 || inputs[0]!.chain !== 'solana:localnet') throw Error('WALLET_UNAUTHORIZED');
    const input = inputs[0]!;
    const result = await askWallet({ method: 'signTransaction', account: input.account.address, chain: 'solana:localnet', transaction: wireBase64(input.transaction) });
    if (!result || typeof result !== 'object' || Object.keys(result).join() !== 'signedTransaction') throw Error('WALLET_UNAUTHORIZED');
    return [{ signedTransaction: wireBytes((result as { signedTransaction: unknown }).signedTransaction) }];
  } },
} };
let active: SolanaRecoveryController | null = null;
let rpc: ReturnType<typeof createSolanaLocalRpc> | null = null;
const controller = parseSolanaLocalnetConfig(__P2P_SOLANA_LOCALNET_CONFIG__).then(config => {
  if (closed) throw Error('LOCKED');
  rpc = createSolanaLocalRpc(config.rpcUrl);
  active = new SolanaRecoveryController(config, wallet, rpc, { onSnapshot: snapshot => post({ kind: 'snapshot', snapshot }) });
  return active;
});
function stop(): void {
  if (closed) return; closed = true; active?.dispose(); rpc?.dispose();
  for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(Error('LOCKED')); } jobs.clear(); host.close();
}
void controller.catch(stop);
host.addEventListener('message', event => {
  if (closed || !event.data || typeof event.data !== 'object') return;
  const message = event.data as SolanaWorkerInput;
  if (message.kind === 'wallet.changed') { active?.walletChanged(); return; }
  if (message.kind === 'wallet.result') {
    const job = jobs.get(message.id); if (!job) return;
    jobs.delete(message.id); clearTimeout(job.timer);
    if (message.ok === true) job.resolve(message.value); else job.reject(Error('WALLET_UNAUTHORIZED'));
    return;
  }
  if (message.kind !== 'command' || !Number.isSafeInteger(message.id) || message.id <= lastCommand) return;
  lastCommand = message.id;
  void controller.then(async value => { post({ kind: 'result', id: message.id, result: await value.dispatch(message.command) }); }, stop);
});
host.addEventListener('messageerror', stop);
