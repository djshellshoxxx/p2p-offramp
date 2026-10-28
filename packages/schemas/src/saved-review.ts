/**
 * G02 `trade` record payload for a saved local trade-terms review (G07 "saved terms reviews").
 *
 * Only the original terms-file bytes and their source label are stored. Nothing derived (display text, validity,
 * deadlines) is persisted: every load re-runs the domain terms review against the registry loaded at that time,
 * because stored bytes may come from an older build or a restored backup. A record whose payload is not this format
 * is not a saved review and is never returned, rewritten or deleted through the saved-review commands.
 */
import { decodeBase64url, encodeBase64url } from './vault.ts';

export const SAVED_REVIEW_FORMAT = 'p2p-offramp/saved-terms-review/v1';
export const SAVED_REVIEW_SCHEMA_VERSION = 1;
/** Per-profile bound. Saving beyond it is refused; nothing is evicted silently. */
export const MAX_SAVED_REVIEWS = 8;
/** Equal to the domain MAX_TERMS_REVIEW_BYTES (asserted in tests); schemas cannot import domain. */
export const MAX_SAVED_REVIEW_BYTES = 64 * 1024;
export type SavedReviewSource = 'file' | 'synthetic-sample';
export interface SavedReviewPayload { readonly source: SavedReviewSource; readonly terms: Uint8Array; }

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function isSavedReviewSource(input: unknown): input is SavedReviewSource { return input === 'file' || input === 'synthetic-sample'; }

/** Record payload string (base64url of canonical JSON). Throws on out-of-bounds input; callers validate first. */
export function encodeSavedReviewPayload(source: SavedReviewSource, terms: Uint8Array): string {
  if (!isSavedReviewSource(source) || !(terms instanceof Uint8Array) || terms.byteLength < 1 || terms.byteLength > MAX_SAVED_REVIEW_BYTES) throw new RangeError('SAVED_REVIEW');
  return encodeBase64url(encoder.encode(JSON.stringify({ format: SAVED_REVIEW_FORMAT, source, terms: encodeBase64url(terms) })));
}

/**
 * Strict decode of a stored payload. Returns null for anything that is not exactly this format (another trade record,
 * a later version, or damage); the caller counts those as skipped and never acts on them.
 */
export function parseSavedReviewPayload(payload: unknown, schemaVersion: unknown): SavedReviewPayload | null {
  if (schemaVersion !== SAVED_REVIEW_SCHEMA_VERSION) return null;
  try {
    const text = decoder.decode(decodeBase64url(payload, 1, 4 * MAX_SAVED_REVIEW_BYTES));
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    if (keys.length !== 3 || !keys.includes('format') || !keys.includes('source') || !keys.includes('terms')) return null;
    const record = value as Record<string, unknown>;
    if (record.format !== SAVED_REVIEW_FORMAT || !isSavedReviewSource(record.source)) return null;
    const terms = decodeBase64url(record.terms, 1, MAX_SAVED_REVIEW_BYTES);
    // Canonical form only: re-encoding must reproduce the stored payload byte for byte.
    if (encodeSavedReviewPayload(record.source, terms) !== payload) return null;
    return Object.freeze({ source: record.source, terms });
  } catch { return null; }
}
