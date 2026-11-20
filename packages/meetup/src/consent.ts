/** G31 explicit local consent reducer. It never calls navigator, starts a sensor, opens a socket or signs. */
import { bool, codeOf, data, failure, hex, integer, radius, randomId, result, stop, success, webCryptoFill, type MeetupResult, type RandomFill } from './shared.ts';
export const MAX_CONSENT_MS = 1_800_000;
export const SENSOR_OPTIONS = Object.freeze({ enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 });
export type ConsentPermission = 'collect' | 'shareCoarse' | 'mapFetch' | 'directNetwork';
export type ConsentState = 'inactive' | 'explaining' | 'awaiting-browser' | 'collecting' | 'paused' | 'revoked' | 'expired';
export type RevocationReason = 'hide' | 'lock' | 'account-changed' | 'trade-closed' | 'permission-lost' | 'pause';
export interface ConsentRequest {
  readonly tradeHash: string; readonly recipientKey: string; readonly radiusM: 500 | 1000 | 2000;
  readonly collect: boolean; readonly shareCoarse: boolean; readonly mapFetch: boolean; readonly directNetwork: boolean;
}
export interface ConsentExplanation extends ConsentRequest {
  readonly maxSessionMs: typeof MAX_CONSENT_MS; readonly rawRetentionMs: 30_000; readonly markerRetentionMs: 900_000;
  readonly markersPerHour: 4; readonly markersPerDay: 12; readonly recipientRetention: 'outside-local-control';
}
/** Only the issuing controller recognizes this object. A JSON copy grants no local authority. */
export interface LocationConsent {
  readonly v: 1; readonly sessionId: string; readonly tradeHash: string; readonly generation: number;
  readonly collect: boolean; readonly shareCoarse: boolean; readonly mapFetch: boolean; readonly directNetwork: boolean;
  readonly grantedAtMs: number; readonly expiresAtMs: number;
}
export interface ConsentView { readonly state: ConsentState; readonly generation: number; readonly consent: LocationConsent | null; }
export interface ConsentControllerOptions {
  /** Trusted owner capabilities: no gesture or foreground status is inferred from caller JSON. */
  readonly isUserGesture: () => boolean; readonly isForeground: () => boolean; readonly isOwnerCurrent: () => boolean;
  readonly wallNowMs?: () => number; readonly monotonicNowMs?: () => number; readonly randomFill?: RandomFill;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown; readonly clearTimer?: (handle: unknown) => void;
}
export interface LocationConsentController {
  explain(request: unknown): MeetupResult<ConsentExplanation>;
  grant(explanation: ConsentExplanation): MeetupResult<LocationConsent>;
  permissionResult(consent: LocationConsent, outcome: 'granted' | 'denied' | 'unsupported'): MeetupResult<ConsentView>;
  registerCleanup(consent: LocationConsent, cleanup: () => void): MeetupResult<() => void>;
  revoke(reason: RevocationReason): void;
  inspect(): ConsentView;
  dispose(): void;
}
export interface ConsentScope { readonly generation: number; readonly tradeHash: string; readonly radiusM: 500 | 1000 | 2000; readonly expiresAtMs: number; readonly signal: AbortSignal; }
const capabilities = new WeakMap<object, { read(permission: ConsentPermission): ConsentScope }>();
/** Internal authority check used by local consumers, not by imported records. */
export function readConsent(input: unknown, permission: ConsentPermission): ConsentScope {
  if (typeof input !== 'object' || input === null) return stop('CONSENT_REVOKED');
  const capability = capabilities.get(input); return capability ? capability.read(permission) : stop('CONSENT_REVOKED');
}
function request(input: unknown): ConsentRequest {
  const raw = data(input, ['tradeHash', 'recipientKey', 'radiusM', 'collect', 'shareCoarse', 'mapFetch', 'directNetwork']);
  return Object.freeze({ tradeHash: hex(raw.tradeHash, 64), recipientKey: hex(raw.recipientKey, 64), radiusM: radius(raw.radiusM),
    collect: bool(raw.collect), shareCoarse: bool(raw.shareCoarse), mapFetch: bool(raw.mapFetch), directNetwork: bool(raw.directNetwork) });
}
export function createLocationConsentController(options: ConsentControllerOptions): MeetupResult<LocationConsentController> {
  try {
    const raw = data(options, ['isUserGesture', 'isForeground', 'isOwnerCurrent'], ['wallNowMs', 'monotonicNowMs', 'randomFill', 'setTimer', 'clearTimer']);
    for (const key of Reflect.ownKeys(raw)) if (typeof raw[key as string] !== 'function') return failure('INVALID_INPUT');
    if ((raw.setTimer === undefined) !== (raw.clearTimer === undefined)) return failure('INVALID_INPUT');
    const wall = raw.wallNowMs as (() => number) | undefined ?? Date.now;
    const mono = raw.monotonicNowMs as (() => number) | undefined ?? (() => Math.floor(performance.now()));
    const fill = raw.randomFill as RandomFill | undefined ?? webCryptoFill;
    const set = raw.setTimer as ConsentControllerOptions['setTimer'] ?? ((callback, delay) => setTimeout(callback, delay));
    const clear = raw.clearTimer as ConsentControllerOptions['clearTimer'] ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const userGesture = raw.isUserGesture as () => boolean, foreground = raw.isForeground as () => boolean, owner = raw.isOwnerCurrent as () => boolean;
    let state: ConsentState = 'inactive', generation = 0, active: LocationConsent | null = null, explanation: ConsentExplanation | null = null;
    let lifetime = new AbortController(), deadline = 0, lastWall = -1, lastMono = -1, timer: unknown, disposed = false, revoking = false, granting = false;
    const cleanups = new Set<() => void>();
    function end(next: ConsentState): void {
      if (revoking) return; revoking = true;
      if (generation === Number.MAX_SAFE_INTEGER) disposed = true; else generation++;
      state = next; active = null; explanation = null;
      const old = lifetime; lifetime = new AbortController();
      if (timer !== undefined) { try { clear(timer); } catch { /* Revocation remains synchronous. */ } timer = undefined; }
      old.abort(); const owned = [...cleanups]; cleanups.clear();
      for (const cleanup of owned) try { cleanup(); } catch { /* One owner cannot stop other cleanup. */ }
      revoking = false;
    }
    function time(): { wall: number; mono: number } {
      let currentWall: number, currentMono: number;
      try { currentWall = integer(wall()); currentMono = integer(mono()); }
      catch { end('revoked'); return stop('CONSENT_REVOKED'); }
      if (currentWall < lastWall || currentMono < lastMono) { end('revoked'); return stop('CLOCK_ROLLBACK'); }
      lastWall = currentWall; lastMono = currentMono;
      return { wall: currentWall, mono: currentMono };
    }
    function current(): { wall: number; mono: number } {
      if (disposed || revoking) return stop('CONSENT_REVOKED');
      let valid = false; try { valid = owner() === true; } catch { /* Fixed refusal. */ }
      if (!valid || disposed) { end('revoked'); return stop('CONSENT_REVOKED'); }
      const now = time();
      if (active && (now.wall >= active.expiresAtMs || now.mono >= deadline)) { end('expired'); return stop('CONSENT_REVOKED'); }
      return now;
    }
    const view = (): ConsentView => Object.freeze({ state, generation, consent: active });
    function read(capability: LocationConsent, permission: ConsentPermission): ConsentScope {
      current();
      if (active !== capability || state !== 'collecting' || !capability[permission]) return stop('CONSENT_REVOKED');
      let visible = false; try { visible = foreground() === true; } catch { /* Fixed refusal. */ }
      if (!visible) { end('paused'); return stop('CONSENT_REVOKED'); }
      current();
      if (active !== capability || !explanation) return stop('CONSENT_REVOKED');
      return Object.freeze({ generation, tradeHash: capability.tradeHash, radiusM: explanation.radiusM, expiresAtMs: capability.expiresAtMs, signal: lifetime.signal });
    }
    const facade: LocationConsentController = {
      explain(input) {
        return result(() => {
          current(); const requested = request(input);
          if (active || explanation) end('revoked');
          state = 'explaining'; explanation = Object.freeze({ ...requested, maxSessionMs: MAX_CONSENT_MS, rawRetentionMs: 30_000,
            markerRetentionMs: 900_000, markersPerHour: 4, markersPerDay: 12, recipientRetention: 'outside-local-control' });
          return explanation;
        });
      },
      grant(candidate) {
        return result(() => {
          if (granting) return stop('CONFLICT'); granting = true;
          try {
          const now = current(), chosen = explanation, issuingGeneration = generation;
          let confirmed = false; try { confirmed = userGesture() === true && foreground() === true; } catch { /* Refuse. */ }
          current();
          if (!confirmed || state !== 'explaining' || candidate !== chosen || chosen !== explanation || !chosen || issuingGeneration !== generation) return stop('CONSENT_REVOKED');
          const expiresAtMs = integer(now.wall + MAX_CONSENT_MS), endMono = integer(now.mono + MAX_CONSENT_MS);
          const sessionId = randomId(fill); current();
          if (chosen !== explanation || state !== 'explaining' || generation !== issuingGeneration) return stop('CONSENT_REVOKED');
          const capability: LocationConsent = Object.freeze({ v: 1, sessionId, tradeHash: chosen.tradeHash, generation,
            collect: chosen.collect, shareCoarse: chosen.shareCoarse, mapFetch: chosen.mapFetch, directNetwork: chosen.directNetwork,
            grantedAtMs: now.wall, expiresAtMs });
          current(); active = capability; deadline = endMono;
          state = capability.collect ? 'awaiting-browser' : 'collecting';
          capabilities.set(capability, { read: permission => read(capability, permission) });
          try {
            const handle = set(() => { try { current(); } catch { /* Expiry revokes. */ } }, MAX_CONSENT_MS);
            if (active !== capability || disposed) { clear(handle); return stop('CONSENT_REVOKED'); }
            timer = handle;
          }
          catch { end('revoked'); return stop('CONSENT_REVOKED'); }
          if (active !== capability || disposed) return stop('CONSENT_REVOKED');
          return capability;
          } finally { granting = false; }
        });
      },
      permissionResult(capability, outcome) {
        return result(() => {
          current();
          if (active !== capability || state !== 'awaiting-browser') return stop('STALE_GENERATION');
          if (outcome !== 'granted' && outcome !== 'denied' && outcome !== 'unsupported') return stop();
          if (outcome === 'granted') {
            let visible = false; try { visible = foreground() === true; } catch { /* Refuse. */ }
            current(); if (!visible || active !== capability || state !== 'awaiting-browser') return stop('CONSENT_REVOKED');
            state = 'collecting';
          } else end('revoked');
          return view();
        });
      },
      registerCleanup(capability, cleanup) {
        return result(() => {
          current(); if (active !== capability || typeof cleanup !== 'function') return stop('CONSENT_REVOKED');
          if (cleanups.size >= 32) return stop('CAPACITY_EXCEEDED'); cleanups.add(cleanup);
          return () => { cleanups.delete(cleanup); };
        });
      },
      revoke(reason) {
        if (!['hide', 'lock', 'account-changed', 'trade-closed', 'permission-lost', 'pause'].includes(reason)) return;
        if (!disposed) end(reason === 'hide' || reason === 'pause' ? 'paused' : 'revoked');
      },
      inspect() { try { current(); } catch { /* Return the revoked/expired view. */ } return view(); },
      dispose() { if (!disposed) { end('revoked'); disposed = true; } },
    };
    return success(Object.freeze(facade));
  } catch (error) { return failure(codeOf(error)); }
}
