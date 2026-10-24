/** Same-origin module Worker entry. It imports no transport, wallet, identity signer or optional extension. */
import { createVaultWorkerEndpoint } from '../runtime/worker-endpoint.ts';
declare const self: DedicatedWorkerGlobalScope;
const endpoint = createVaultWorkerEndpoint(message => self.postMessage(message));
self.addEventListener('message', event => { void endpoint.dispatch(event.data); });
self.addEventListener('messageerror', () => { endpoint.dispose(); self.close(); });
