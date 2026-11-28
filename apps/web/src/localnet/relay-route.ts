import { webSocketConnector, type RelayBroker, type RelayConnector } from '../../../../packages/relay/index.ts';
import type { Permit, TransportScope } from '../../../../packages/transport/index.ts';
import { parseLocalnetRelayUrl } from './config.ts';

/** A single logical pool endpoint maps to a build-authenticated loopback socket. No general URL route is exposed. */
export const LOCALNET_RELAY_ENDPOINT = Object.freeze({ endpointId: 'localnet-relay', url: 'wss://localnet.invalid/relay' });
export function createLocalnetRelayRoute(relayUrl: string, current: () => boolean, connector: RelayConnector = webSocketConnector): {
  readonly broker: RelayBroker; readonly connect: RelayConnector; dispose(): void;
} {
  const destination = parseLocalnetRelayUrl(relayUrl).url;
  let closed = false;
  const permits = new Set<Permit>(), scopes = new Set<AbortController>();
  const active = (): boolean => !closed && current();
  return {
    broker: {
      authorize(request) {
        if (!active()) return 'CANCELLED';
        if (request.channel !== 'relay' || request.endpointId !== LOCALNET_RELAY_ENDPOINT.endpointId || request.method !== 'read' && request.method !== 'publish') return 'POLICY_BLOCKED';
        if (permits.size + scopes.size >= 8) return 'LIMIT_EXCEEDED';
        const permit = Object.freeze({ generation: 0, endpointId: LOCALNET_RELAY_ENDPOINT.endpointId }); permits.add(permit); return permit;
      },
      capture(permit, options = {}) {
        if (!permits.delete(permit) || !active() || options.signal?.aborted) return 'CANCELLED';
        if (options.expectedURL !== LOCALNET_RELAY_ENDPOINT.url) return 'INVALID_ENDPOINT';
        const controller = new AbortController(); scopes.add(controller); let used = false;
        const dispose = (): void => { controller.abort(); scopes.delete(controller); options.signal?.removeEventListener('abort', dispose); };
        options.signal?.addEventListener('abort', dispose, { once: true });
        const scope: TransportScope = {
          signal: controller.signal,
          current: () => active() && !controller.signal.aborted,
          async run(operation) {
            if (used || !scope.current()) return { ok: false, error: 'CANCELLED' };
            used = true;
            try { const value = await operation(controller.signal); return scope.current() ? { ok: true, value } : { ok: false, error: 'CANCELLED' }; }
            catch { return { ok: false, error: 'ROUTE_UNAVAILABLE' }; }
          },
          dispose,
        };
        return scope;
      },
    },
    connect(url, signal) {
      if (!active() || signal.aborted || url !== LOCALNET_RELAY_ENDPOINT.url) throw new Error('LOCALNET_ROUTE_REFUSED');
      return connector(destination, signal);
    },
    dispose() { closed = true; permits.clear(); for (const scope of scopes) scope.abort(); scopes.clear(); },
  };
}
