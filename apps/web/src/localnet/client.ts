/** Document side: external wallet provider and purpose-bound Worker messages only. */
import type { Eip1193Provider } from '../../../../packages/wallet/localnet.ts';
import type { LocalnetConfig } from './config.ts';
import type { LocalnetClient, LocalnetCommand, LocalnetResult, LocalnetSnapshot, LocalnetWorkerInput, LocalnetWorkerOutput } from './protocol.ts';
import { createLocalnetWalletBridge } from './wallet-bridge.ts';

export interface LocalnetClientOptions {
  readonly createWorker?: () => Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;
  readonly lifecycle?: boolean;
}
export function createLocalnetClient(config: LocalnetConfig, provider: Eip1193Provider, options: LocalnetClientOptions = {}): LocalnetClient {
  if (config.ReleaseEnabled !== 0 || config.network.chainIdentity !== '31337' || typeof provider.on !== 'function' || typeof provider.removeListener !== 'function') throw new Error('LOCALNET_PROVIDER_REQUIRED');
  const worker = options.createWorker?.() ?? new Worker(new URL('./localnet.worker.ts', import.meta.url), { type: 'module' });
  const bridge = createLocalnetWalletBridge(provider), listeners = new Set<(snapshot: LocalnetSnapshot) => void>();
  let snapshot: LocalnetSnapshot | null = null, sequence = 0, closed = false, profileEpoch = 0, privateBlocked = true;
  const pending = new Map<number, { readonly resolve: (result: LocalnetResult) => void; readonly end: () => void;
    readonly timer: ReturnType<typeof setTimeout>; readonly epoch: number; readonly opensProfile: boolean }>();
  const post = (message: LocalnetWorkerInput): void => { if (!closed) worker.postMessage(message); };
  const blank = (error: string | null = null): LocalnetSnapshot => ({ version: 1, phase: 'locked', profileIds: snapshot?.profileIds ?? [], profileId: null,
    publicKey: null, wallet: null, relay: 'closed', ads: [], sessions: [], trades: [], review: null, error });
  const notify = (value: LocalnetSnapshot): void => {
    if (value.profileId === null) { privateBlocked = true; bridge.revoke(); }
    // A queued Worker projection cannot undo a document-side lock. Only an acknowledged, current explicit
    // create/unlock/restore request can open this fence again.
    snapshot = privateBlocked ? { ...blank(value.error), profileIds: value.profileIds } : value;
    for (const listener of [...listeners]) { try { listener(snapshot); } catch { /* UI observers have no authority. */ } }
  };
  const cancelPending = (): void => {
    const previous = [...pending.values()]; pending.clear();
    for (const item of previous) { clearTimeout(item.timer); item.end(); item.resolve({ ok: false, code: 'LOCKED', snapshot: snapshot ?? blank() }); }
  };
  const dispose = (): void => {
    if (closed) return;
    closed = true; profileEpoch++; privateBlocked = true; bridge.dispose(); worker.removeEventListener('message', onMessage); worker.removeEventListener('messageerror', dispose);
    worker.terminate();
    for (const [event, listener] of events) provider.removeListener!(event, listener);
    if (options.lifecycle !== false) globalThis.removeEventListener('pagehide', dispose);
    notify(blank('UNAVAILABLE')); cancelPending(); listeners.clear();
  };
  const onMessage = (event: MessageEvent<LocalnetWorkerOutput>): void => {
    if (closed) return;
    const message = event.data;
    if (!message || typeof message !== 'object') { dispose(); return; }
    if (message.kind === 'snapshot') { notify(message.snapshot); return; }
    if (message.kind === 'result') {
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer); item.end();
      if (item.epoch !== profileEpoch) { item.resolve({ ok: false, code: 'LOCKED', snapshot: snapshot ?? blank() }); return; }
      if (item.opensProfile && message.result.ok && message.result.snapshot.profileId !== null) privateBlocked = false;
      notify(message.result.snapshot); item.resolve({ ...message.result, snapshot: snapshot! }); return;
    }
    if (message.kind === 'wallet.request') {
      void bridge.request(message.request).then(value => post({ kind: 'wallet.result', id: message.id, ok: true, value }), error => {
        let code = 4100;
        try { if (typeof error?.code === 'number') code = error.code; } catch { /* Fixed refusal only. */ }
        post({ kind: 'wallet.result', id: message.id, ok: false, code });
      });
      return;
    }
    dispose();
  };
  const events = (['accountsChanged', 'chainChanged', 'disconnect'] as const).map(event => {
    const listener = (...values: unknown[]): void => { bridge.revoke(); post({ kind: 'wallet.event', event, value: values[0] ?? null }); };
    provider.on!(event, listener); return [event, listener] as const;
  });
  worker.addEventListener('message', onMessage); worker.addEventListener('messageerror', dispose);
  if (options.lifecycle !== false) globalThis.addEventListener('pagehide', dispose);
  return {
    request(command: LocalnetCommand) {
      if (closed) return Promise.resolve({ ok: false, code: 'LOCKED', snapshot: blank() });
      const opensProfile = command.type === 'profile.unlock' || command.type === 'profile.create' || command.type === 'backup.restore';
      const changesProfile = opensProfile || command.type === 'profile.lock';
      if (privateBlocked && !changesProfile && command.type !== 'status') return Promise.resolve({ ok: false, code: 'LOCKED', snapshot: snapshot ?? blank() });
      let epoch = profileEpoch;
      if (changesProfile) {
        epoch = ++profileEpoch; privateBlocked = true; bridge.revoke(); notify(blank()); cancelPending();
        if (epoch !== profileEpoch || closed) return Promise.resolve({ ok: false, code: 'LOCKED', snapshot: snapshot ?? blank() });
      }
      let end = (): void => undefined;
      try {
        if (command.type === 'review.cancel') bridge.revoke();
        if (command.type === 'wallet.connect') end = bridge.beginConnect();
        if (command.type === 'review.confirm') {
          if (!snapshot?.review || snapshot.review.id !== command.reviewId) throw new Error();
          end = bridge.beginReview(snapshot.review);
        }
      } catch { return Promise.resolve({ ok: false, code: 'UNAUTHORIZED', snapshot: snapshot ?? blank() }); }
      if (pending.size >= 8) { end(); return Promise.resolve({ ok: false, code: 'BUSY', snapshot: snapshot ?? blank() }); }
      const id = ++sequence;
      return new Promise(resolve => {
        const timer = setTimeout(() => { dispose(); }, 120_000);
        pending.set(id, { resolve, end, timer, epoch, opensProfile }); post({ kind: 'command', id, command });
      });
    },
    subscribe(listener) { listeners.add(listener); if (snapshot) listener(snapshot); return () => { listeners.delete(listener); }; },
    snapshot: () => snapshot,
    dispose,
  };
}
