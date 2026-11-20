/** Document owns only the external wallet and one-shot review grants. Secret profile operations live in the Worker. */
import type { SolanaLocalnetConfig } from './config.ts';
import { createSolanaWalletBridge, type BrowserSolanaWallet } from './wallet-bridge.ts';
import type { SolanaBrowserClient, SolanaCommand, SolanaResult, SolanaSnapshot, SolanaWorkerInput, SolanaWorkerOutput } from './protocol.ts';
export function createSolanaRecoveryClient(config: SolanaLocalnetConfig, wallet: BrowserSolanaWallet): SolanaBrowserClient {
  if (config.ReleaseEnabled !== 0) throw Error('LOCAL_PROFILE_REQUIRED');
  const worker = new Worker(new URL('./solana-localnet.worker.ts', import.meta.url), { type: 'module' });
  let closed = false, sequence = 0, epoch = 0, privateBlocked = true, walletBlocked = true, reviewBlocked = true;
  let snapshot: SolanaSnapshot | null = null;
  const listeners = new Set<(snapshot: SolanaSnapshot) => void>();
  const jobs = new Map<number, { resolve: (r: SolanaResult) => void; end: () => void; timer: ReturnType<typeof setTimeout>; epoch: number; type: SolanaCommand['type'] }>();
  const blank = (error: string | null = null): SolanaSnapshot => ({ version: 1, phase: 'locked', profileIds: snapshot?.profileIds ?? [],
    profileId: null, wallet: null, trades: [], proposals: [], tradeCapacity: { used: 0, limit: 8 }, review: null, error });
  const post = (value: SolanaWorkerInput) => { if (!closed) worker.postMessage(value); };
  function notify(next: SolanaSnapshot): void {
    if (next.profileId === null) { privateBlocked = true; bridge.revoke(); }
    snapshot = privateBlocked ? { ...blank(next.error), phase: next.phase === 'working' ? 'working' : 'locked', profileIds: next.profileIds } : { ...next,
      wallet: walletBlocked ? null : next.wallet, review: reviewBlocked ? null : next.review,
      trades: walletBlocked ? next.trades.map(t => ({ ...t, canRelease: false, canRefund: false, canPayout: false })) : next.trades };
    for (const listener of [...listeners]) { try { listener(snapshot); } catch { /* Display only. */ } }
  }
  function cancelJobs(): void {
    const old = [...jobs.values()]; jobs.clear();
    for (const job of old) { clearTimeout(job.timer); job.end(); job.resolve({ ok: false, code: 'CANCELLED', snapshot: snapshot ?? blank() }); }
  }
  let bridge: ReturnType<typeof createSolanaWalletBridge>;
  try { bridge = createSolanaWalletBridge(wallet, () => {
    epoch++; walletBlocked = true; reviewBlocked = true; cancelJobs();
    if (snapshot) notify({ ...snapshot, wallet: null, review: null });
    post({ kind: 'wallet.changed' });
  }); } catch (error) { worker.terminate(); throw error; }
  function dispose(): void {
    if (closed) return; closed = true; epoch++; privateBlocked = true; bridge.dispose();
    worker.removeEventListener('message', onMessage); worker.terminate(); globalThis.removeEventListener('pagehide', dispose);
    notify(blank('UNAVAILABLE')); cancelJobs(); listeners.clear();
  }
  function onMessage(event: MessageEvent<SolanaWorkerOutput>): void {
    if (closed) return;
    const message = event.data;
    if (!message || typeof message !== 'object') { dispose(); return; }
    if (message.kind === 'snapshot') { notify(message.snapshot); return; }
    if (message.kind === 'wallet.request') {
      void bridge.request(message.request).then(value => post({ kind: 'wallet.result', id: message.id, ok: true, value }),
        () => post({ kind: 'wallet.result', id: message.id, ok: false })); return;
    }
    if (message.kind !== 'result') { dispose(); return; }
    const job = jobs.get(message.id); if (!job) return;
    jobs.delete(message.id); clearTimeout(job.timer); job.end();
    if (job.epoch !== epoch) { job.resolve({ ok: false, code: 'LOCKED', snapshot: snapshot ?? blank() }); return; }
    if (message.result.ok) {
      if (['profile.create', 'profile.unlock', 'backup.restore'].includes(job.type) && message.result.snapshot.profileId !== null) privateBlocked = false;
      if (job.type === 'wallet.connect') walletBlocked = false;
      if (job.type === 'review.prepare') reviewBlocked = false;
    }
    notify(message.result.snapshot); job.resolve({ ...message.result, snapshot: snapshot! });
  }
  worker.addEventListener('message', onMessage); worker.addEventListener('messageerror', dispose); worker.addEventListener('error', dispose);
  globalThis.addEventListener('pagehide', dispose);
  return {
    request(command) {
      if (closed) return Promise.resolve({ ok: false, code: 'LOCKED', snapshot: blank() });
      const changesProfile = ['profile.create', 'profile.unlock', 'backup.restore', 'profile.lock'].includes(command.type);
      if (privateBlocked && !changesProfile && command.type !== 'status') return Promise.resolve({ ok: false, code: 'LOCKED', snapshot: snapshot ?? blank() });
      if (changesProfile) { epoch++; privateBlocked = true; walletBlocked = true; reviewBlocked = true; bridge.revoke(); notify(blank()); cancelJobs(); }
      if (command.type === 'review.cancel') { epoch++; reviewBlocked = true; bridge.revoke(); cancelJobs(); }
      let end = () => {};
      try {
        if (command.type === 'wallet.connect') end = bridge.beginConnect();
        if (command.type === 'review.confirm') {
          if (!snapshot?.review || snapshot.review.id !== command.reviewId || reviewBlocked) throw Error();
          end = bridge.beginReview(snapshot.review);
        }
      } catch { return Promise.resolve({ ok: false, code: 'UNAUTHORIZED', snapshot: snapshot ?? blank() }); }
      if (jobs.size >= 8) { end(); return Promise.resolve({ ok: false, code: 'BUSY', snapshot: snapshot ?? blank() }); }
      const id = ++sequence;
      return new Promise(resolve => {
        const timer = setTimeout(dispose, 120000);
        jobs.set(id, { resolve, end, timer, epoch, type: command.type }); post({ kind: 'command', id, command });
      });
    },
    subscribe(listener) { listeners.add(listener); if (snapshot) listener(snapshot); return () => { listeners.delete(listener); }; },
    snapshot: () => snapshot, dispose,
  };
}
