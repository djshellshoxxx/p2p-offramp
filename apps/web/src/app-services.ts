/** Offline document composition boundary. UI receives state and commands, never a vault handle or record. */
import { runtimeFailure, type RuntimeErrorCode, type RuntimeResult, type RuntimeExport } from '../../../packages/schemas/index.ts';
import { AppRuntime, type AppRuntimeOptions } from './runtime/app-runtime.ts';

export type AppResult<T> = RuntimeResult<T>;
export interface PublicStatus { readonly state: 'locked' | 'unlocked'; }
export interface AppServices {
  readonly current: PublicStatus;
  getSnapshot(): PublicStatus;
  subscribe(listener: () => void): () => void;
  unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<AppResult<PublicStatus>>;
  status(): Promise<AppResult<PublicStatus>>;
  lock(): Promise<AppResult<PublicStatus>>;
  exportEncrypted(profileId: string, signal?: AbortSignal): Promise<AppResult<RuntimeExport>>;
  dispose(): Promise<void>;
}
export type { RuntimeErrorCode };
const LOCKED: PublicStatus = Object.freeze({ state: 'locked' });
const UNLOCKED: PublicStatus = Object.freeze({ state: 'unlocked' });

/** Options are trusted composition/test dependencies; no imported configuration can enable a wallet or network. */
export async function startAppServices(options: AppRuntimeOptions = {}): Promise<AppResult<AppServices>> {
  const opened = await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] }, {
    ...options,
    createWorker: options.createWorker ?? (() => new Worker(new URL('./workers/vault.worker.ts', import.meta.url), { type: 'module' })),
  });
  if (!opened.ok) return opened;
  const runtime = opened.value;
  const snapshot = (): PublicStatus => runtime.current.state === 'unlocked' ? UNLOCKED : LOCKED;
  const stateCommand = async (run: () => Promise<RuntimeResult<unknown>>): Promise<AppResult<PublicStatus>> => {
    try { const result = await run(); return result.ok ? Object.freeze({ ok: true, value: snapshot() }) : result; }
    catch { return runtimeFailure('PROTOCOL_ERROR'); }
  };
  const services: AppServices = Object.freeze({
    get current() { return snapshot(); }, getSnapshot: snapshot,
    subscribe: (listener: () => void) => runtime.subscribe(listener),
    unlock: (profileId: string, passphrase: string, signal?: AbortSignal) => stateCommand(() => runtime.unlock(profileId, passphrase, signal)),
    status: () => stateCommand(() => runtime.status()), lock: () => stateCommand(() => runtime.lock()),
    exportEncrypted: async (profileId: string, signal?: AbortSignal): Promise<AppResult<RuntimeExport>> => {
      try { return await runtime.exportEncrypted(profileId, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    dispose: () => runtime.dispose(),
  });
  return Object.freeze({ ok: true, value: services });
}
