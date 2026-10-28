/** Private qualification adapter only. Frames are correlation data, not authority or physical settlement. */
import { parseEvmAgreementCheckRequest, parseEvmAgreementCheckReply } from '../../../schemas/src/evm-agreement-protocol.ts';
import { parseEvmAgreementControlRequest, parseEvmAgreementControlAck, parseEvmAgreementHostClosed } from '../../../schemas/src/evm-agreement-control.ts';
import type { EvmAgreementHost } from './evm-agreement-host.ts';

type Sender = (frame: unknown) => void;
export function createEvmAgreementPortAdapter(host: EvmAgreementHost, send: Sender): Readonly<{
  receive(frame: unknown): Promise<void>; close(): void; drain(): Promise<void>;
}> {
  let closed = false, closing = false, lastRequest = 0;
  const pending = new Map<number, number>();
  const end = (reason: 'INVALID_INPUT' | 'DISPOSED' | 'TIMEOUT' | 'LIMIT_EXCEEDED', notify = true): void => {
    if (closed) return;
    closed = true; pending.clear(); host.dispose();
    if (notify) { try { send(parseEvmAgreementHostClosed({ version: 1, generation: host.generation, kind: 'closed', reason })); } catch { /* channel failure: cleanup only */ } }
  };
  const emit = (frame: unknown): boolean => {
    if (closed) return false;
    try { send(frame); return true; } catch { end('INVALID_INPUT', false); return false; }
  };
  const receive = async (frame: unknown): Promise<void> => {
    if (closed || closing) return;
    try {
      if (typeof frame !== 'object' || frame === null) { end('INVALID_INPUT'); return; }
      const descriptor = Object.getOwnPropertyDescriptor(frame, 'operation');
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) { end('INVALID_INPUT'); return; }
      if (descriptor.value === 'checkEvmAgreement') {
        const request = parseEvmAgreementCheckRequest(frame);
        try {
          if (request.requestId <= lastRequest || request.generation > host.generation || pending.size >= 3) { end('INVALID_INPUT'); return; }
          lastRequest = request.requestId;
          const generation = request.generation, wasCurrent = generation === host.generation;
          pending.set(request.requestId, generation);
          const operation = host.dispatch(request);
          // Host synchronously snapshots before its first await; clear this adapter-owned copy immediately.
          for (const a of request.input.acceptances) a.signature.fill(0);
          const reply = await operation;
          if (!closed && pending.get(request.requestId) === generation && reply !== undefined &&
              reply.requestId === request.requestId && reply.generation === generation && (!wasCurrent || host.generation === generation)) {
            const checked = parseEvmAgreementCheckReply(reply);
            const timedOut = !checked.result.ok && checked.result.error.code === 'TIMEOUT';
            if (timedOut) closing = true;
            if (emit(checked) && timedOut) end('TIMEOUT');
          }
          pending.delete(request.requestId);
        } finally { for (const a of request.input.acceptances) a.signature.fill(0); }
      } else {
        const request = parseEvmAgreementControlRequest(frame);
        if (request.requestId <= lastRequest || request.generation > host.generation) { end('INVALID_INPUT'); return; }
        lastRequest = request.requestId;
        if (request.generation < host.generation) {
          emit(parseEvmAgreementControlAck({ version: 1, requestId: request.requestId, generation: host.generation,
            operation: request.operation, kind: 'ack', result: { ok: false, error: { code: 'CONFLICT' } } })); return;
        }
        if (request.operation === 'invalidateEvmAgreement') { host.invalidate(); pending.clear(); }
        else { closing = true; host.dispose(); pending.clear(); }
        const state = host.physicalState();
        if (request.operation === 'invalidateEvmAgreement' && state.terminal) { end('LIMIT_EXCEEDED'); return; }
        if (!emit(parseEvmAgreementControlAck({ version: 1, requestId: request.requestId, generation: state.generation,
          operation: request.operation, kind: 'ack', result: { ok: true, value: { held: state.held } } }))) return;
        if (request.operation === 'disposeEvmAgreementHost') end('DISPOSED');
      }
    } catch { end('INVALID_INPUT'); }
  };
  return Object.freeze({ receive, close: () => end('DISPOSED'), drain: () => { end('DISPOSED'); return host.disposeAndDrain(); } });
}
