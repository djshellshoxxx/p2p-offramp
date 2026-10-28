/** TRUSTED qualification controls only. Not an application endpoint or the proposed control protocol.
 * All input is synthetic and supplied by the paired loopback driver. No identity signer or persistence.
 */
import { createEvmAgreementHost } from '../../packages/wallet/test/lib/evm-agreement-host.ts';

let initialized = false;
self.onmessage = event => {
  if (initialized) return;
  initialized = true;
  const { port, options } = event.data;
  const calls = [], timers = [], delays = [];
  let elapsed = 0, active = 0, maximumActive = 0, unhandled = 0, host;
  const emit = frame => port.postMessage(frame);
  self.addEventListener('unhandledrejection', () => { unhandled++; emit({ type: 'fixtureUnhandled' }); });
  const snapshot = () => ({ state: host.physicalState(), active, maximumActive, hashes: calls.length,
    wiped: calls.every(call => call.bytes.every(byte => byte === 0)), capturedNonzero: calls.some(call => call.nonzeroAtCapture), unhandled, delays: [...delays] });
  host = createEvmAgreementHost({ now: () => elapsed, timer: {
    setTimeout(callback, ms) { const timer = { callback, ms, live: true }; timers.push(timer); delays.push(ms); return timer; },
    clearTimeout(timer) { timer.live = false; },
  }, sha256: async bytes => {
    let resolve, reject;
    const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
    const native = crypto.subtle.digest('SHA-256', bytes);
    const call = { bytes, native, gate, resolve, reject, nonzeroAtCapture: bytes.some(byte => byte !== 0) }; calls.push(call);
    active++; maximumActive = Math.max(maximumActive, active);
    try {
      if (calls.length === options.holdAt) { emit({ type: 'held', at: calls.length, ...snapshot() }); await gate; }
      return await native;
    } finally { active--; }
  } });
  port.onmessage = async event => {
    const { id, command } = event.data;
    const response = extra => emit({ type: 'response', id, ...snapshot(), ...extra });
    try {
      if (command === 'check') {
        const reply = await host.dispatch({ version: 1, requestId: event.data.requestId, generation: host.generation,
          operation: 'checkEvmAgreement', input: event.data.bundle });
        response({ code: reply === undefined ? 'SUPPRESSED' : reply.result.ok ? 'OK' : reply.result.error.code,
          ...(reply?.result.ok ? { termsHash: reply.result.value.termsHash } : {}) });
      } else if (command === 'invalidate') { host.invalidate(); response({}); }
      else if (command === 'dispose') { host.dispose(); response({}); }
      else if (command === 'state') response({});
      else if (command === 'observe') {
        // A bounded event-notification observation turn AFTER the actual drain; never a drain proof.
        await new Promise(done => setTimeout(done, 0));
        response({});
      }
      else if (command === 'advance') {
        elapsed = event.data.elapsed;
        for (const timer of timers) if (timer.live && elapsed >= timer.ms) { timer.live = false; timer.callback(); }
        response({});
      } else if (command === 'drain') {
        const promise = host.disposeAndDrain();
        emit({ type: 'draining', id, ...snapshot() });
        await promise;
        emit({ type: 'drained', id, ...snapshot() });
      } else if (command === 'release') {
        const call = calls[options.holdAt - 1];
        // Native completion is independently observed before the controlled wrapper settles/rejects.
        await call.native;
        if (event.data.backend === 'reject') call.reject(Error('Synthetic backend failure.'));
        else call.resolve();
        response({});
      } else throw Error('Unknown fixture control.');
    } catch {
      // Never serialize an exception or an input. This is a fixture failure, not a product error result.
      emit({ type: 'fixtureError', id });
    }
  };
  port.start();
  emit({ type: 'ready', ...snapshot() });
};
