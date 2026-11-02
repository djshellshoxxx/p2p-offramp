/** MEET02 local standard geohash math. No query, geocoder, network or physical-presence authority. */
import { data, EARTH_RADIUS_M, finite, hex, integer, list, radius, result, stop, type MeetupResult } from './shared.ts';
export const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
export interface GeoBounds { readonly south: number; readonly north: number; readonly west: number; readonly east: number; }
export interface BlurredMarker {
  readonly v: 1; readonly latE6: number; readonly lonE6: number; readonly radiusM: 500 | 1000 | 2000;
  readonly uncertaintyM: number; readonly epoch: string; readonly expiresAtMs: number;
}
export interface DiscoveryRegion {
  readonly v: 1; readonly precision: 4 | 5 | 6 | 7; readonly cells: readonly string[]; readonly source: 'blurred' | 'manual';
  readonly epoch: string; readonly expiresAtMs: number; readonly diagonalM: number; readonly widthM: number; readonly heightM: number;
}
function precisionOf(value: unknown): 4 | 5 | 6 | 7 { return value === 4 || value === 5 || value === 6 || value === 7 ? value : stop(); }
function encode(lat: number, lon: number, precision: number): string {
  let south = -90, north = 90, west = -180, east = 180, value = 0, out = '';
  for (let bit = 0; bit < precision * 5; bit++) {
    const longitude = bit % 2 === 0, midpoint = longitude ? (west + east) / 2 : (south + north) / 2;
    const high = (longitude ? lon : lat) >= midpoint; value = value * 2 + Number(high);
    if (longitude) { if (high) west = midpoint; else east = midpoint; } else { if (high) south = midpoint; else north = midpoint; }
    if (bit % 5 === 4) { out += GEOHASH_ALPHABET[value]; value = 0; }
  }
  return out;
}
function bounds(input: unknown): GeoBounds {
  if (typeof input !== 'string' || input.length < 4 || input.length > 7) return stop();
  let south = -90, north = 90, west = -180, east = 180, bit = 0;
  for (const character of input) {
    const value = GEOHASH_ALPHABET.indexOf(character); if (value < 0) return stop();
    for (let shift = 4; shift >= 0; shift--, bit++) {
      const high = (value & (1 << shift)) !== 0;
      if (bit % 2 === 0) { const mid = (west + east) / 2; if (high) west = mid; else east = mid; }
      else { const mid = (south + north) / 2; if (high) south = mid; else north = mid; }
    }
  }
  return Object.freeze({ south, north, west, east });
}
const wrap = (lon: number): number => ((lon + 180) % 360 + 360) % 360 - 180;
function dimensions(cells: readonly string[]): { widthM: number; heightM: number; diagonalM: number } {
  const boxes = cells.map(bounds), south = Math.min(...boxes.map(box => box.south)), north = Math.max(...boxes.map(box => box.north));
  if (south > 85 || north < -85) return stop('UNSUPPORTED_LATITUDE');
  const intervals = boxes.map(box => [box.west + 180, box.east + 180] as const).sort((a, b) => a[0] - b[0]);
  let largestGap = intervals[0]![0] + 360 - intervals.at(-1)![1];
  for (let i = 1; i < intervals.length; i++) largestGap = Math.max(largestGap, intervals[i]![0] - intervals[i - 1]![1]);
  const lonSpan = 360 - Math.max(0, largestGap), radians = Math.PI / 180;
  const closestLatitude = south <= 0 && north >= 0 ? 0 : Math.min(Math.abs(south), Math.abs(north));
  // Parallel-arc width at the widest latitude and meridian height enclose the complete region, including the dateline.
  const widthM = EARTH_RADIUS_M * lonSpan * radians * Math.cos(closestLatitude * radians);
  const heightM = EARTH_RADIUS_M * (north - south) * radians;
  return { widthM, heightM, diagonalM: Math.hypot(widthM, heightM) };
}
export function parseMarker(input: unknown): BlurredMarker {
  const raw = data(input, ['v', 'latE6', 'lonE6', 'radiusM', 'uncertaintyM', 'epoch', 'expiresAtMs']);
  if (raw.v !== 1) return stop('UNSUPPORTED_VERSION');
  const latE6 = integer(raw.latE6, -90_000_000, 90_000_000); if (Math.abs(latE6) > 85_000_000) return stop('UNSUPPORTED_LATITUDE');
  const selectedRadius = radius(raw.radiusM), uncertaintyM = finite(raw.uncertaintyM, selectedRadius, 5000);
  return Object.freeze({ v: 1, latE6, lonE6: integer(raw.lonE6, -180_000_000, 179_999_999), radiusM: selectedRadius,
    uncertaintyM, epoch: hex(raw.epoch, 32), expiresAtMs: integer(raw.expiresAtMs) });
}
export function encodeGeohash(lat: number, lon: number, precision: number): MeetupResult<string> {
  return result(() => {
    finite(lat, -90, 90); finite(lon, -180, 180, true); if (Math.abs(lat) > 85) return stop('UNSUPPORTED_LATITUDE');
    return encode(lat, lon, precisionOf(precision));
  });
}
export const decodeGeohash = (cell: unknown): MeetupResult<GeoBounds> => result(() => bounds(cell));
export function regionFor(input: unknown, nowMs: number, source: 'blurred' | 'manual' = 'blurred'): MeetupResult<DiscoveryRegion> {
  return result(() => {
    const marker = parseMarker(input), now = integer(nowMs); if (marker.expiresAtMs <= now) return stop('EXPIRED');
    if (marker.expiresAtMs - now > 900_000 || source !== 'blurred' && source !== 'manual') return stop();
    const lat = marker.latE6 / 1e6, lon = marker.lonE6 / 1e6;
    let chosen: 4 | 5 | 6 | 7 | undefined, center: GeoBounds | undefined;
    for (const precision of [7, 6, 5, 4] as const) {
      const box = bounds(encode(lat, lon, precision));
      const cellHeight = EARTH_RADIUS_M * (box.north - box.south) * Math.PI / 180;
      const cellWidth = EARTH_RADIUS_M * (box.east - box.west) * Math.PI / 180 * Math.cos(lat * Math.PI / 180);
      if (Math.hypot(cellHeight, cellWidth) >= marker.radiusM) { chosen = precision; center = box; break; }
    }
    if (chosen === undefined || center === undefined) return stop('UNSUPPORTED_RESOLUTION');
    const latSpan = center.north - center.south, lonSpan = center.east - center.west, cells = new Set<string>();
    for (const row of [-1, 0, 1]) for (const column of [-1, 0, 1]) {
      const centerLat = (center.north + center.south) / 2 + row * latSpan;
      if (Math.abs(centerLat) >= 90) return stop('UNSUPPORTED_RESOLUTION');
      cells.add(encode(centerLat, wrap((center.east + center.west) / 2 + column * lonSpan), chosen));
    }
    const sorted = Object.freeze([...cells].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)), extent = dimensions(sorted);
    if (sorted.length > 9 || extent.diagonalM > 50_000) return stop('UNSUPPORTED_RESOLUTION');
    return Object.freeze({ v: 1, precision: chosen, cells: sorted, source, epoch: marker.epoch, expiresAtMs: marker.expiresAtMs, ...extent });
  });
}
export function validateDiscoveryRegion(input: unknown, nowMs: number): MeetupResult<DiscoveryRegion> {
  return result(() => {
    const raw = data(input, ['v', 'precision', 'cells', 'source', 'epoch', 'expiresAtMs', 'diagonalM', 'widthM', 'heightM']);
    if (raw.v !== 1) return stop('UNSUPPORTED_VERSION');
    const precision = precisionOf(raw.precision), cells = list(raw.cells, 9).map(cell => {
      if (typeof cell !== 'string' || cell.length !== precision) return stop(); bounds(cell); return cell;
    });
    if (!cells.length || new Set(cells).size !== cells.length || [...cells].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).some((cell, i) => cell !== cells[i])) return stop();
    if (raw.source !== 'blurred' && raw.source !== 'manual') return stop();
    const now = integer(nowMs), expiry = integer(raw.expiresAtMs); if (expiry <= now) return stop('EXPIRED');
    if (expiry - now > 900_000) return stop();
    const extent = dimensions(cells); if (extent.diagonalM > 50_000) return stop('UNSUPPORTED_RESOLUTION');
    for (const name of ['widthM', 'heightM', 'diagonalM'] as const) if (Math.abs(finite(raw[name], 0, 50_000) - extent[name]) > 1e-6) return stop();
    return Object.freeze({ v: 1, precision, cells: Object.freeze(cells), source: raw.source, epoch: hex(raw.epoch, 32), expiresAtMs: expiry, ...extent });
  });
}
