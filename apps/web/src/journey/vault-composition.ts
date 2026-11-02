/** Private composition capability. Never expose this object, its session, or its callback API to the Document.
 * The existing endpoint remains the sole owner of backup verification and selected-profile authority.
 */
import { createVaultWorkerEndpoint, type WorkerPrivateServices } from '../runtime/worker-endpoint.ts';
import { parseRuntimeCommand, type RuntimeCommand, type RuntimeMessage, type RuntimeResponse, type VaultSession, type VaultSessionLease } from '../../../../packages/schemas/index.ts';

type RuntimeInput = RuntimeCommand extends infer C ? C extends RuntimeCommand ? Omit<C, 'version' | 'requestId' | 'generation'> : never : never;
export interface JourneyVaultSelection {
  readonly session: Readonly<VaultSession>;
  /** Call after every asynchronous boundary and immediately before any economic side effect. */
  assertCurrent(): void;
}
export function createJourneyVaultComposition(services: WorkerPrivateServices, notify: (message: RuntimeMessage) => void = () => {}) {
  let requestId = 0, generation = 0, epoch = 0, disposed = false;
  let candidate: VaultSession | undefined, selected: VaultSessionLease | undefined;
  const pending = new Map<number, { resolve(response: RuntimeResponse): void; reject(error: Error): void }>();
  const clear = () => {
    epoch++; selected?.dispose(); selected = undefined; candidate = undefined;
    for (const job of pending.values()) job.reject(new Error('LOCKED'));
    pending.clear();
  };
  // Capture only the session actually opened by the SAME endpoint; no session identifier is accepted from a caller.
  const vault: WorkerPrivateServices['vault'] = {
    unlock: async (...args) => { const result = await services.vault.unlock(...args); if (result.ok) candidate = result.value; return result; },
    create: async (...args) => { const result = await services.vault.create(...args); if (result.ok) candidate = result.value; return result; },
    listProfiles: (...args) => services.vault.listProfiles(...args), lock: (...args) => services.vault.lock(...args),
    lockAll: () => services.vault.lockAll(), captureSession: (...args) => services.vault.captureSession(...args),
    dispose: () => services.vault.dispose(), list: (...args) => services.vault.list(...args),
    commit: (...args) => services.vault.commit(...args), assertFresh: (...args) => services.vault.assertFresh(...args),
    verifyBackup: (...args) => services.vault.verifyBackup(...args),
  };
  const endpoint = createVaultWorkerEndpoint(message => {
    if (message.kind === 'locked' || message.kind === 'closed') clear();
    if (message.kind === 'closed') disposed = true;
    if (message.kind === 'response') {
      if ((message.operation === 'create' || message.operation === 'unlock') && message.result.ok &&
          'state' in message.result.value && message.result.value.state === 'unlocked') {
        const session = candidate; candidate = undefined;
        if (session && session.profileId === message.result.value.handle.profileId) {
          const captured = services.vault.captureSession(session, clear);
          if (captured.ok) selected = captured.value;
        }
      }
      if (message.operation === 'dispose') disposed = true;
      const job = pending.get(message.requestId); pending.delete(message.requestId); job?.resolve(message);
    }
    notify(message);
  }, { createServices: () => ({ vault, backup: services.backup }) });
  const request = async (input: RuntimeInput): Promise<RuntimeResponse> => {
    if (disposed) throw new Error('LOCKED');
    const control = input.operation === 'lock' || input.operation === 'dispose';
    const nextGeneration = generation + (control ? 1 : 0);
    const command = parseRuntimeCommand({ ...input, version: 1, requestId: requestId + 1, generation: nextGeneration });
    requestId = command.requestId; generation = nextGeneration;
    if (input.operation === 'create' || input.operation === 'unlock' || control) clear();
    const promise = new Promise<RuntimeResponse>((resolve, reject) => pending.set(command.requestId, { resolve, reject }));
    // Dispatch replies synchronously or asynchronously; attach the rejection consumer before a revocation can drain it.
    void endpoint.dispatch(command).catch(() => { pending.get(command.requestId)?.reject(new Error('LOCKED')); pending.delete(command.requestId); })
      .finally(() => { if ('bytes' in command) command.bytes.fill(0); });
    return promise;
  };
  const capture = (): JourneyVaultSelection => {
    const lease = selected, session = lease?.current(), mine = epoch;
    if (disposed || !lease || !session) throw new Error('LOCKED');
    return Object.freeze({ session: Object.freeze({ ...session }), assertCurrent() {
      if (disposed || epoch !== mine || selected !== lease || lease.current() === null) throw new Error('LOCKED');
    } });
  };
  return Object.freeze({
    request,
    /** Pre-start gate uses the endpoint's private T34 fact and current committed row, never a receipt supplied by UI. */
    async requireVerifiedBackup(): Promise<JourneyVaultSelection> {
      const selection = capture();
      const response = await request({ operation: 'checkBackupVerification', profileId: selection.session.profileId });
      selection.assertCurrent();
      if (!response.result.ok || response.operation !== 'checkBackupVerification' || !response.result.value.verification) throw new Error('BACKUP_REQUIRED');
      return selection;
    },
    /** Recovery/reconciliation must remain available after journal writes invalidate the pre-start backup snapshot. */
    async requireCurrent(): Promise<JourneyVaultSelection> {
      // Recheck the endpoint's monotonic idle deadline even if background timers were throttled.
      const status = await request({ operation: 'status' });
      if (!status.result.ok || !('state' in status.result.value) || status.result.value.state !== 'unlocked') throw new Error('LOCKED');
      const selection = capture();
      const result = await services.vault.assertFresh(selection.session.sessionId);
      selection.assertCurrent(); if (!result.ok) throw new Error(result.error.code);
      return selection;
    },
    dispose() { if (disposed) return; disposed = true; clear(); endpoint.dispose(); },
  });
}
