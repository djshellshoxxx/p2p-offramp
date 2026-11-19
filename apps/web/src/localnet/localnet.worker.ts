/** Same-origin module Worker. Only purpose-bound commands and exact external-wallet bridge requests cross it. */
import { loadInjectedLocalnetConfig } from './config.ts';
import { LocalnetController } from './controller.ts';
import type { Eip1193Provider } from '../../../../packages/wallet/localnet.ts';
import type { LocalnetWorkerInput, LocalnetWorkerOutput } from './protocol.ts';

const host = globalThis as unknown as {
  postMessage(message: LocalnetWorkerOutput): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'messageerror', listener: () => void): void;
  close(): void;
};
let closed = false, nextWalletId = 0, lastCommandId = 0;
const pending = new Map<number, { readonly resolve: (value: unknown) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }>();
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
const post = (message: LocalnetWorkerOutput): void => { if (!closed) host.postMessage(message); };
const provider: Eip1193Provider = {
  request(request) {
    if (closed || pending.size >= 32) return Promise.reject(new Error('WALLET_UNAVAILABLE'));
    const id = ++nextWalletId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('WALLET_TIMEOUT')); }, request.method === 'eth_signTypedData_v4' || request.method === 'eth_sendTransaction' || request.method === 'eth_requestAccounts' ? 90_000 : 20_000);
      pending.set(id, { resolve, reject, timer }); post({ kind: 'wallet.request', id, request });
    });
  },
  on(event, listener) { const group = listeners.get(event) ?? new Set(); group.add(listener); listeners.set(event, group); },
  removeListener(event, listener) { listeners.get(event)?.delete(listener); },
};
const controller = loadInjectedLocalnetConfig().then(config => new LocalnetController(config, provider, { onSnapshot: snapshot => post({ kind: 'snapshot', snapshot }) }));
const shutdown = (): void => {
  if (closed) return; closed = true;
  void controller.then(value => value.dispose(), () => undefined);
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('LOCKED')); } pending.clear(); listeners.clear(); host.close();
};
void controller.then(value => value.dispatch({ type: 'status' }), shutdown);
host.addEventListener('message', event => {
  if (closed || !event.data || typeof event.data !== 'object') return;
  const message = event.data as LocalnetWorkerInput;
  if (message.kind === 'wallet.result') {
    const job = pending.get(message.id); if (!job) return;
    pending.delete(message.id); clearTimeout(job.timer);
    if (message.ok === true) job.resolve(message.value);
    else job.reject(Object.assign(new Error('Wallet operation refused.'), { code: typeof message.code === 'number' ? message.code : 4100 }));
    return;
  }
  if (message.kind === 'wallet.event') {
    if (!['accountsChanged', 'chainChanged', 'disconnect'].includes(message.event)) return;
    for (const listener of [...(listeners.get(message.event) ?? [])]) { try { listener(message.value); } catch { /* Adapter owns invalidation. */ } }
    return;
  }
  if (message.kind !== 'command' || !Number.isSafeInteger(message.id) || message.id <= lastCommandId) return;
  lastCommandId = message.id;
  void controller.then(async value => {
    const result = await value.dispatch(message.command);
    post({ kind: 'result', id: message.id, result });
  }, shutdown);
});
host.addEventListener('messageerror', shutdown);
