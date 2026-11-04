/** Exact private preference consumers; neither record is writable/importable session authority. */
import { decodeBase64url, encodeBase64url } from '../../schemas/index.ts';
import { bool, data, hex, integer, list, stop } from './shared.ts';
import { parseMarker, type BlurredMarker } from './geohash.ts';
export const LEDGER_RECORD_ID = '6f18b5ac8e0d9a32753d301deee4078e';
export const MARKER_RECORD_ID = 'c778c595f5e556cb5bd4e78bc293e76d';
export const MAX_BUDGET_ENTRIES = 128, MAX_LIFETIME_TRADES = 128, MAX_BUDGET_BYTES = 65_536;
export interface BudgetEntry {
  id: string; kind: 'region' | 'distance'; epoch: string; tradeHash: string | null; challengeId: string | null;
  state: 'reserved' | 'consumed' | 'cancelled'; createdAtMs: number; cachedResult: boolean | null;
}
export interface TradeCount { tradeHash: string; count: number; }
export interface Ledger { format: 'p2p-offramp-location-budget'; version: 1; lastNowMs: number; entries: BudgetEntry[]; trades: TradeCount[]; }
export interface MarkerRecord { format: 'p2p-offramp-sticky-marker'; version: 1; consentGeneration: number; marker: BlurredMarker; }
function parseLedger(input: unknown): Ledger {
  const raw = data(input, ['format', 'version', 'lastNowMs', 'entries', 'trades']);
  if (raw.format !== 'p2p-offramp-location-budget') return stop('INTEGRITY_FAILURE');
  if (raw.version !== 1) return stop('UNSUPPORTED_VERSION');
  const lastNowMs = integer(raw.lastNowMs);
  const entries = list(raw.entries, MAX_BUDGET_ENTRIES).map(input => {
    const entry = data(input, ['id', 'kind', 'epoch', 'tradeHash', 'challengeId', 'state', 'createdAtMs', 'cachedResult']);
    if (entry.kind !== 'region' && entry.kind !== 'distance' || !['reserved', 'consumed', 'cancelled'].includes(entry.state as string)) return stop();
    const tradeHash = entry.tradeHash === null ? null : hex(entry.tradeHash, 64), challengeId = entry.challengeId === null ? null : hex(entry.challengeId, 64);
    if (entry.kind === 'region' ? tradeHash !== null || challengeId !== null : tradeHash === null || challengeId === null) return stop();
    const cachedResult = entry.cachedResult === null ? null : bool(entry.cachedResult);
    if (cachedResult !== null && (entry.kind !== 'distance' || entry.state !== 'consumed')) return stop();
    return { id: hex(entry.id, 32), kind: entry.kind as BudgetEntry['kind'], epoch: hex(entry.epoch, 32), tradeHash, challengeId,
      state: entry.state as BudgetEntry['state'], createdAtMs: integer(entry.createdAtMs, 0, lastNowMs), cachedResult };
  });
  const trades = list(raw.trades, MAX_LIFETIME_TRADES).map(input => {
    const item = data(input, ['tradeHash', 'count']); return { tradeHash: hex(item.tradeHash, 64), count: integer(item.count, 0, 3) };
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || new Set(trades.map(item => item.tradeHash)).size !== trades.length) return stop();
  const challenges = entries.filter(entry => entry.kind === 'distance').map(entry => `${entry.tradeHash}:${entry.challengeId}`);
  if (new Set(challenges).size !== challenges.length) return stop();
  for (const entry of entries) if (entry.kind === 'distance' && !trades.some(item => item.tradeHash === entry.tradeHash)) return stop();
  for (const trade of trades) if (trade.count < entries.filter(entry => entry.tradeHash === trade.tradeHash && entry.state !== 'cancelled').length) return stop();
  return { format: 'p2p-offramp-location-budget', version: 1, lastNowMs, entries, trades };
}
function parseMarkerRecord(input: unknown): MarkerRecord {
  const raw = data(input, ['format', 'version', 'consentGeneration', 'marker']);
  if (raw.format !== 'p2p-offramp-sticky-marker') return stop('INTEGRITY_FAILURE');
  if (raw.version !== 1) return stop('UNSUPPORTED_VERSION');
  return { format: 'p2p-offramp-sticky-marker', version: 1, consentGeneration: integer(raw.consentGeneration), marker: parseMarker(raw.marker) };
}
function decode<T>(payload: unknown, parser: (input: unknown) => T): T {
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(payload, 1, MAX_BUDGET_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), parsed = parser(JSON.parse(text));
    // The local consumer writes this one field order/encoding. This also rejects duplicate keys and ambiguous JSON.
    if (JSON.stringify(parsed) !== text) return stop('INTEGRITY_FAILURE');
    return parsed;
  } catch (error) {
    // Preserve our fixed unsupported-version/capacity classifications without reflecting foreign exceptions.
    throw error;
  } finally { bytes?.fill(0); }
}
export const decodeLedger = (payload: unknown): Ledger => decode(payload, parseLedger);
export const decodeMarkerRecord = (payload: unknown): MarkerRecord => decode(payload, parseMarkerRecord);
export function payloadOf(input: Ledger | MarkerRecord): string {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  try { if (bytes.length > MAX_BUDGET_BYTES) return stop('CAPACITY_EXCEEDED'); return encodeBase64url(bytes); }
  finally { bytes.fill(0); }
}
