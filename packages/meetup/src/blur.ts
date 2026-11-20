/** MEET01 spherical disk sampling, called only after durable budget reservation. Source/randomness never persist. */
import { EARTH_RADIUS_M, EPOCH_MS, finite, integer, radius, stop, type RandomFill } from './shared.ts';
import { parseMarker, type BlurredMarker } from './geohash.ts';
import type { LocationClaim } from './location-claim.ts';
export function blurMarker(claim: LocationClaim, radiusM: 500 | 1000 | 2000, epoch: string, nowMs: number, expiresAtMs: number, fill: RandomFill): BlurredMarker {
  if (Math.abs(finite(claim.lat, -90, 90)) > 85) return stop('UNSUPPORTED_LATITUDE');
  finite(claim.lon, -180, 180, true); radius(radiusM);
  const uncertaintyM = radiusM + finite(claim.accuracyM, 0, 100); if (uncertaintyM > 5000) return stop('INACCURATE');
  const expires = Math.min(integer(expiresAtMs), integer(nowMs + EPOCH_MS)), random = new Uint8Array(16);
  try {
    try { fill(random); } catch { return stop('RNG_UNAVAILABLE'); }
    const view = new DataView(random.buffer), max = 2 ** 53;
    const uniform = (offset: number) => ((view.getUint32(offset) >>> 11) * 2 ** 32 + view.getUint32(offset + 4)) / max;
    const angular = radiusM * Math.sqrt(uniform(0)) / EARTH_RADIUS_M, bearing = 2 * Math.PI * uniform(8), radians = Math.PI / 180;
    const lat = claim.lat * radians, lon = claim.lon * radians;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
    const longitude = ((nextLon / radians + 180) % 360 + 360) % 360 - 180;
    let lonE6 = Math.round(longitude * 1e6); if (lonE6 === 180_000_000) lonE6 = -180_000_000;
    return parseMarker({ v: 1, latE6: Math.round(nextLat / radians * 1e6), lonE6, radiusM, uncertaintyM, epoch, expiresAtMs: expires });
  } finally { random.fill(0); }
}
