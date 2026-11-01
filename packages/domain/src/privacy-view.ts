/** G23 display projection. Trusted injected services, never imported JSON, establish observations.
 * This reader grants no routing, signing, privacy-proof or economic authority. Refresh on service
 * invalidation and before display: an immutable snapshot cannot revoke itself after publication.
 */
import { TRANSPORT_CHANNELS, intentData, transportId, type CoreResult, type RouteEvidence, type TransportChannel, type TransportMode, type RouteCoverage } from '../../schemas/index.ts';
import { createCoreError, createOperationId } from './errors.ts';

/** Structurally matches the real G05 SessionTransportPolicy; inspect owns expiry/revocation. */
export interface PrivacyTransportPort {
  readonly mode: TransportMode;
  readonly generation: number;
  inspect(channel: TransportChannel): Readonly<RouteEvidence>;
}
export type VaultPrivacyState = 'locked' | 'unlocked' | 'unavailable';
export type MessagingPrivacyState = 'authenticated-encryption' | 'unavailable' | 'unsupported';
export type ProofPrivacyState = 'available' | 'unavailable' | 'unsupported';
export interface PrivacyCapabilityObservation<State extends string> {
  readonly state: State;
  /** Same monotonic clock as the reader, milliseconds; maximum lifetime 30 seconds. */
  readonly observedAt: number;
  readonly expiresAt: number;
}
export interface PrivacyObservationSnapshot {
  readonly version: 1;
  readonly generation: number;
  readonly vault: PrivacyCapabilityObservation<VaultPrivacyState> | null;
  readonly messaging: PrivacyCapabilityObservation<MessagingPrivacyState> | null;
  readonly proof: PrivacyCapabilityObservation<ProofPrivacyState> | null;
}
/** Bundled service projection only. Wrapping user/config/plugin JSON here does not authenticate it.
 * Generation is an opaque caller-owned scope; it does not bind a trade, account or deployment.
 */
export interface PrivacyObservationPort {
  readonly generation: number;
  read(): PrivacyObservationSnapshot;
}
export type PrivacyReason = 'not-observed' | 'observed' | 'expired' | 'invalid-observation' | 'scope-changed' | 'clock-reversed' | 'policy-blocked' | 'unavailable';
export interface PrivacyIndicator<State extends string> {
  readonly state: State | 'unknown';
  readonly source: 'transport-policy' | 'local-vault' | 'messaging-provider' | 'proof-provider' | 'none';
  readonly observedAt: number | null;
  readonly expiresAt: number | null;
  readonly reason: PrivacyReason;
}
export interface PrivacyRouteIndicator extends PrivacyIndicator<RouteCoverage | 'blocked'> {
  readonly channel: TransportChannel;
  readonly selectedPolicy: TransportMode | null;
  readonly observedPolicy: TransportMode | 'unknown';
  /** Inspection time, not the underlying evidence issue time. Broker owns evidence TTL. */
  readonly observedAt: number | null;
}
export interface PrivacyView {
  readonly version: 1;
  readonly selectedPolicy: TransportMode | null;
  readonly inspectedAt: number;
  readonly scopeGeneration: number | null;
  readonly routes: readonly PrivacyRouteIndicator[];
  readonly vault: PrivacyIndicator<VaultPrivacyState>;
  readonly messaging: PrivacyIndicator<MessagingPrivacyState>;
  readonly proof: PrivacyIndicator<ProofPrivacyState>;
  readonly publicChain: 'public-metadata-visible';
  readonly manualFiat: 'seller-attestation-not-payment-proof';
  readonly economicPreparationAllowed: false;
}
export interface PrivacyViewReader {
  /** null means no selected network policy; it never supplies observed coverage. */
  buildPrivacyView(requestedPolicy: TransportMode | null, expectedScope?: number): CoreResult<PrivacyView>;
  dispose(): void;
}
const clockValue = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function unknown<State extends string>(reason: PrivacyReason = 'not-observed'): PrivacyIndicator<State> {
  return Object.freeze({ state: 'unknown', source: 'none', observedAt: null, expiresAt: null, reason });
}
function capability<State extends string>(input: unknown, allowed: readonly State[], source: PrivacyIndicator<State>['source'], now: number): PrivacyIndicator<State> {
  if (input === null) return unknown();
  try {
    const raw = intentData(input, ['state', 'observedAt', 'expiresAt']);
    if (typeof raw.state !== 'string' || !allowed.includes(raw.state as State) || !clockValue(raw.observedAt) || !clockValue(raw.expiresAt) || raw.expiresAt <= raw.observedAt || raw.expiresAt - raw.observedAt > 30_000) return unknown('invalid-observation');
    if (now >= raw.expiresAt) return unknown('expired');
    return Object.freeze({ state: raw.state as State, source, observedAt: raw.observedAt, expiresAt: raw.expiresAt, reason: 'observed' });
  } catch { return unknown('invalid-observation'); }
}

export function createPrivacyViewReader(options: {
  readonly transport?: PrivacyTransportPort;
  readonly observations?: PrivacyObservationPort;
  readonly monotonicNow?: () => number;
} = {}): PrivacyViewReader {
  const { transport, observations } = options;
  const now = options.monotonicNow ?? (() => Math.floor(performance.now()));
  let disposed = false, lastTime = -1, clockReversed = false;
  const error = (code: 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'CANCELLED' | 'UNAVAILABLE') => Object.freeze({ ok: false as const, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) });
  return Object.freeze({
    buildPrivacyView(requestedPolicy: TransportMode | null, expectedScope?: number): CoreResult<PrivacyView> {
      if (disposed) return error('CANCELLED');
      if ((requestedPolicy !== null && requestedPolicy !== 'ordinary' && requestedPolicy !== 'strict') || (expectedScope !== undefined && !clockValue(expectedScope))) return error('INVALID_INPUT');
      let time: number;
      try { time = now(); } catch { return error('UNAVAILABLE'); }
      if (!clockValue(time)) return error('INVALID_INPUT');
      if (time < lastTime) clockReversed = true;
      lastTime = time;
      let vault: PrivacyIndicator<VaultPrivacyState> = unknown(), messaging: PrivacyIndicator<MessagingPrivacyState> = unknown(), proof: PrivacyIndicator<ProofPrivacyState> = unknown();
      let scopeGeneration: number | null = null;
      let scopeChanged = false;
      if (observations && !clockReversed) {
        try {
          const before = observations.generation;
          const raw = intentData(observations.read(), ['version', 'generation', 'vault', 'messaging', 'proof']);
          const after = observations.generation;
          if (raw.version !== 1) return error('UNSUPPORTED_VERSION');
          if (!clockValue(before) || !clockValue(after) || !clockValue(raw.generation)) {
            vault = unknown('invalid-observation'); messaging = unknown('invalid-observation'); proof = unknown('invalid-observation');
          } else if (before !== after || raw.generation !== before || (expectedScope !== undefined && expectedScope !== before)) {
            scopeChanged = true;
          } else {
            scopeGeneration = before;
            vault = capability(raw.vault, ['locked', 'unlocked', 'unavailable'], 'local-vault', time);
            messaging = capability(raw.messaging, ['authenticated-encryption', 'unavailable', 'unsupported'], 'messaging-provider', time);
            proof = capability(raw.proof, ['available', 'unavailable', 'unsupported'], 'proof-provider', time);
          }
        } catch { vault = unknown('unavailable'); messaging = unknown('unavailable'); proof = unknown('unavailable'); }
      } else if (expectedScope !== undefined && !observations) scopeChanged = true;
      const unavailableRoute = (channel: TransportChannel, reason: PrivacyReason): PrivacyRouteIndicator => Object.freeze({ ...unknown<RouteCoverage | 'blocked'>(reason), channel, selectedPolicy: requestedPolicy, observedPolicy: 'unknown' });
      let routes: readonly PrivacyRouteIndicator[] = TRANSPORT_CHANNELS.map(channel => unavailableRoute(channel, 'not-observed'));
      let routeGeneration: number | null = null, routeMode: TransportMode | null = null;
      if (transport && !clockReversed && !scopeChanged) {
        try {
          const generation = transport.generation, mode = transport.mode;
          if (!clockValue(generation) || (mode !== 'ordinary' && mode !== 'strict')) throw new Error();
          routeGeneration = generation; routeMode = mode;
          routes = TRANSPORT_CHANNELS.map(channel => {
            const raw = intentData(transport.inspect(channel), ['channel', 'coverage', 'adapterId', 'generation']);
            transportId(raw.adapterId);
            if (raw.channel !== channel || raw.generation !== generation || !['direct', 'verified-private', 'unknown', 'unsupported'].includes(raw.coverage as string)) return unavailableRoute(channel, 'invalid-observation');
            const coverage = raw.coverage as RouteCoverage;
            const blocked = coverage === 'direct' && (requestedPolicy === 'strict' || mode === 'strict');
            return Object.freeze({ channel, selectedPolicy: requestedPolicy, observedPolicy: mode, state: blocked ? 'blocked' : coverage, source: 'transport-policy', observedAt: time, expiresAt: null, reason: blocked ? 'policy-blocked' : 'observed' });
          });
          if (transport.generation !== generation || transport.mode !== mode) routes = TRANSPORT_CHANNELS.map(channel => unavailableRoute(channel, 'scope-changed'));
        } catch { routes = TRANSPORT_CHANNELS.map(channel => unavailableRoute(channel, 'unavailable')); }
      }
      // A trusted synchronous callback can invalidate another port while it is being read.
      try { if (scopeGeneration !== null && observations?.generation !== scopeGeneration) scopeChanged = true; } catch { scopeChanged = true; }
      if (disposed) return error('CANCELLED');
      // Do not publish capabilities that expired, or survive a clock reversal, during callbacks.
      let completedAt: number;
      try { completedAt = now(); } catch { return error('UNAVAILABLE'); }
      if (!clockValue(completedAt)) return error('INVALID_INPUT');
      if (completedAt < lastTime) clockReversed = true;
      lastTime = completedAt;
      // Even injected clock callbacks may synchronously dispose or invalidate service scope.
      try { if (scopeGeneration !== null && observations?.generation !== scopeGeneration) scopeChanged = true; } catch { scopeChanged = true; }
      try {
        if (routeGeneration !== null && (transport?.generation !== routeGeneration || transport.mode !== routeMode)) routes = TRANSPORT_CHANNELS.map(channel => unavailableRoute(channel, 'scope-changed'));
      } catch { routes = TRANSPORT_CHANNELS.map(channel => unavailableRoute(channel, 'unavailable')); }
      if (disposed) return error('CANCELLED');
      // Providers may inspect after the initial reader timestamp. Compare their issue time with
      // completion, never falsely reject a legitimate inspection one clock tick into this read.
      if (vault.observedAt !== null && vault.observedAt > completedAt) vault = unknown('invalid-observation');
      if (messaging.observedAt !== null && messaging.observedAt > completedAt) messaging = unknown('invalid-observation');
      if (proof.observedAt !== null && proof.observedAt > completedAt) proof = unknown('invalid-observation');
      if (vault.expiresAt !== null && completedAt >= vault.expiresAt) vault = unknown('expired');
      if (messaging.expiresAt !== null && completedAt >= messaging.expiresAt) messaging = unknown('expired');
      if (proof.expiresAt !== null && completedAt >= proof.expiresAt) proof = unknown('expired');
      if (clockReversed || scopeChanged) {
        const reason = clockReversed ? 'clock-reversed' : 'scope-changed';
        vault = unknown(reason); messaging = unknown(reason); proof = unknown(reason); scopeGeneration = null;
        routes = TRANSPORT_CHANNELS.map(channel => unavailableRoute(channel, reason));
      }
      const value: PrivacyView = Object.freeze({ version: 1, selectedPolicy: requestedPolicy, inspectedAt: time, scopeGeneration, routes: Object.freeze(routes), vault, messaging, proof, publicChain: 'public-metadata-visible', manualFiat: 'seller-attestation-not-payment-proof', economicPreparationAllowed: false });
      return Object.freeze({ ok: true, value });
    },
    dispose(): void { disposed = true; },
  });
}
