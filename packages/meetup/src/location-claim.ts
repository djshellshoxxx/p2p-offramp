/** MEET08 plausibility only. Browser/manual values do not authenticate GPS or human presence. */
import { data, distanceM, finite, integer, result, stop, type MeetupResult } from './shared.ts';
export interface LocationClaim {
  readonly v: 1; readonly lat: number; readonly lon: number; readonly accuracyM: number; readonly sampledAtMs: number;
  readonly receivedMonotonicMs: number; readonly provenance: 'browser-reported' | 'manual'; readonly consentGeneration: number;
}
export interface AuthenticityResult { readonly status: 'reported' | 'uncertain' | 'rejected'; readonly reason?: 'stale' | 'inaccurate' | 'inconsistent' | 'invalid'; }
export function parseClaim(input: unknown): LocationClaim {
  const raw = data(input, ['v', 'lat', 'lon', 'accuracyM', 'sampledAtMs', 'receivedMonotonicMs', 'provenance', 'consentGeneration']);
  if (raw.v !== 1) return stop('UNSUPPORTED_VERSION');
  const accuracyM = finite(raw.accuracyM, 0, 100); if (accuracyM === 0) return stop('INACCURATE');
  if (raw.provenance !== 'browser-reported' && raw.provenance !== 'manual') return stop();
  return Object.freeze({ v: 1, lat: finite(raw.lat, -90, 90), lon: finite(raw.lon, -180, 180, true), accuracyM,
    sampledAtMs: integer(raw.sampledAtMs), receivedMonotonicMs: integer(raw.receivedMonotonicMs), provenance: raw.provenance,
    consentGeneration: integer(raw.consentGeneration) });
}
export function assessClaim(input: unknown, wallNowMs: number, monotonicNowMs: number, expectedGeneration: number, previous?: unknown): MeetupResult<AuthenticityResult> {
  return result(() => {
    const claim = parseClaim(input), wall = integer(wallNowMs), mono = integer(monotonicNowMs), generation = integer(expectedGeneration);
    if (claim.consentGeneration !== generation) return Object.freeze({ status: 'rejected', reason: 'invalid' });
    if (wall - claim.sampledAtMs > 30_000 || claim.sampledAtMs - wall > 5_000 || mono - claim.receivedMonotonicMs >= 30_000)
      return Object.freeze({ status: 'rejected', reason: 'stale' });
    if (mono < claim.receivedMonotonicMs) return Object.freeze({ status: 'rejected', reason: 'invalid' });
    if (previous !== undefined) {
      const prior = parseClaim(previous), elapsed = claim.receivedMonotonicMs - prior.receivedMonotonicMs;
      if (prior.consentGeneration !== generation || elapsed <= 0 || distanceM(prior.lat, prior.lon, claim.lat, claim.lon) > 100 * elapsed / 1000)
        return Object.freeze({ status: 'uncertain', reason: 'inconsistent' });
    }
    if (claim.provenance === 'manual') return Object.freeze({ status: 'uncertain' });
    return claim.accuracyM > 25 ? Object.freeze({ status: 'uncertain', reason: 'inaccurate' }) : Object.freeze({ status: 'reported' });
  });
}
