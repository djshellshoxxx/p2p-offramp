/**
 * Import review: the frozen object a UI shows before any import. It carries the full recipient, chain, amount and
 * expiry, the authentication state and warnings. Building it performs no navigation, signing, storage write or
 * network request, and it grants nothing (`authority: 'none'`). Committing an import is the caller's domain step.
 *
 * The replay ledger is local request-ID deduplication with bounded memory: it stops accidental repeated import of the
 * same code on this device and is not global anti-replay security (spec section 5).
 */
import {
  EXPIRY_SAFETY_MARGIN_SECONDS, MAX_FUTURE_SKEW_SECONDS, MAX_INVITE_LIFETIME_SECONDS, failure, parseAdReference,
  type QrEnvelope, type QrErrorCode, type QrFailure, type QrPayloads, type QrType,
} from './envelope.ts';

export type QrWarning =
  | 'unauthenticated'
  | 'unsigned-invite'
  | 'no-invite-verifier'
  | 'signature-profile-unknown'
  | 'expiry-advisory'
  | 'origin-hint-display-only'
  | 'payload-hash-is-not-authentication'
  | 'invite-requires-terms-revalidation'
  | 'payment-request-is-not-escrow-funding'
  | 'address-ownership-unverified'
  | 'release-fingerprint-requires-release-verification'
  | 'recovery-fingerprint-is-not-a-download';

/** `field` is a stable key for UI localization; `grouped` is the same value split for lookalike-resistant reading. */
export interface QrDisplayField { readonly field: string; readonly value: string; readonly grouped: string }

export interface QrImportReviewOf<T extends QrType> {
  readonly authority: 'none';
  readonly type: T; readonly v: 1; readonly requestId: string;
  readonly createdAt: number; readonly expiresAt: number | null;
  /** True only when a verified signature binds expiresAt; for unsigned codes expiry is advisory. */
  readonly expiryAuthenticated: boolean;
  readonly secondsUntilExpiry: number | null;
  readonly chain: string | null;
  /** Display only; never trusted. */
  readonly originHint: string | null;
  readonly payload: QrPayloads[T];
  readonly payloadSha256: string;
  readonly authenticated: boolean;
  readonly signature: 'absent' | 'unverified' | 'verified';
  readonly signatureProfile: string | null;
  readonly envelopeBytes: number;
  readonly display: readonly QrDisplayField[];
  readonly warnings: readonly QrWarning[];
}
export type QrImportReview = { [T in QrType]: QrImportReviewOf<T> }[QrType];

const issued = new WeakSet<object>();
/** True only for a review produced by this module's decoder (not a look-alike object). */
export function isQrImportReview(value: unknown): value is QrImportReview {
  return typeof value === 'object' && value !== null && issued.has(value);
}

/** Splits a lookalike-prone string into groups of four (after a `0x` prefix) for display. */
export function groupForDisplay(value: string, size = 4): string {
  const prefix = value.startsWith('0x') ? '0x' : '';
  const body = value.slice(prefix.length), groups: string[] = [];
  for (let index = 0; index < body.length; index += size) groups.push(body.slice(index, index + size));
  return prefix ? [prefix, ...groups].join(' ') : groups.join(' ');
}
/** Base-unit integer grouped in thousands from the right. */
export function groupDigits(value: string): string {
  const groups: string[] = [];
  for (let end = value.length; end > 0; end -= 3) groups.unshift(value.slice(Math.max(0, end - 3), end));
  return groups.join(' ');
}
const field = (name: string, value: string, grouped = groupForDisplay(value)): QrDisplayField => Object.freeze({ field: name, value, grouped });

function displayFields(envelope: QrEnvelope): QrDisplayField[] {
  const chain = envelope.chain === null ? [] : [field('chain', envelope.chain, envelope.chain)];
  switch (envelope.type) {
    case 'public-address': return [...chain, field('address', envelope.payload.address)];
    case 'payment-request': return [...chain, field('recipient', envelope.payload.recipient),
      field('asset', envelope.payload.asset, envelope.payload.asset === 'native' ? 'native' : groupForDisplay(envelope.payload.asset)),
      field('amount-base-units', envelope.payload.amount, groupDigits(envelope.payload.amount))];
    case 'trade-invite': {
      const ad = parseAdReference(envelope.payload.ad);
      return [...chain, field('advertisement-author', ad?.author ?? ''), field('order-id', ad?.orderId ?? ''),
        field('terms-hash', envelope.payload.termsHash), field('expires-at', String(envelope.expiresAt), String(envelope.expiresAt))];
    }
    case 'release-fingerprint': return [field('channel', envelope.payload.channel, envelope.payload.channel),
      field('release-id', envelope.payload.releaseId, envelope.payload.releaseId),
      field('sequence', String(envelope.payload.sequence), String(envelope.payload.sequence)), field('manifest-sha256', envelope.payload.manifestSha256)];
    case 'recovery-fingerprint': return [field('format', envelope.payload.format, envelope.payload.format),
      field('byte-length', String(envelope.payload.byteLength), groupDigits(String(envelope.payload.byteLength))), field('sha256', envelope.payload.sha256)];
  }
}

const TYPE_WARNINGS: Readonly<Record<QrType, readonly QrWarning[]>> = Object.freeze({
  'public-address': Object.freeze(['address-ownership-unverified'] as const),
  'payment-request': Object.freeze(['payment-request-is-not-escrow-funding', 'address-ownership-unverified'] as const),
  'trade-invite': Object.freeze(['invite-requires-terms-revalidation'] as const),
  'release-fingerprint': Object.freeze(['release-fingerprint-requires-release-verification'] as const),
  'recovery-fingerprint': Object.freeze(['recovery-fingerprint-is-not-a-download'] as const),
});

export interface ReviewInput {
  readonly envelope: QrEnvelope; readonly envelopeBytes: number; readonly nowSeconds: number;
  readonly signature: 'absent' | 'unverified' | 'verified';
  readonly signatureWarnings: readonly QrWarning[];
}

export function buildReview(input: ReviewInput): QrImportReview {
  const { envelope, signature } = input;
  const authenticated = signature === 'verified';
  const warnings: QrWarning[] = [];
  if (!authenticated) warnings.push('unauthenticated');
  if (envelope.type === 'trade-invite' && signature === 'absent') warnings.push('unsigned-invite');
  warnings.push(...input.signatureWarnings);
  if (envelope.expiresAt !== null && !authenticated) warnings.push('expiry-advisory');
  if (envelope.originHint !== null) warnings.push('origin-hint-display-only');
  warnings.push('payload-hash-is-not-authentication', ...TYPE_WARNINGS[envelope.type]);
  const review = Object.freeze({
    authority: 'none' as const,
    type: envelope.type, v: envelope.v, requestId: envelope.requestId,
    createdAt: envelope.createdAt, expiresAt: envelope.expiresAt, expiryAuthenticated: authenticated && envelope.expiresAt !== null,
    secondsUntilExpiry: envelope.expiresAt === null ? null : envelope.expiresAt - input.nowSeconds,
    chain: envelope.chain, originHint: envelope.originHint,
    payload: envelope.payload, payloadSha256: envelope.payloadSha256,
    authenticated, signature, signatureProfile: 'signature' in envelope && envelope.signature !== undefined ? envelope.signature.profile : null,
    envelopeBytes: input.envelopeBytes,
    display: Object.freeze(displayFields(envelope)), warnings: Object.freeze([...new Set(warnings)]),
  }) as QrImportReview;
  issued.add(review);
  return review;
}

// ---------------------------------------------------------------------------------------------------------------
export const DEFAULT_REPLAY_LEDGER_ENTRIES = 512;
export const MAX_REPLAY_LEDGER_ENTRIES = 65_536;
/** How long a code without expiry stays remembered. */
export const DEFAULT_REPLAY_RETENTION_SECONDS = MAX_INVITE_LIFETIME_SECONDS;

export interface ReplayLedgerOptions {
  readonly nowSeconds: () => number;
  readonly maxEntries?: number;
  readonly retentionSeconds?: number;
}
export type ReplayAdmitResult = { readonly ok: true } | QrFailure;
export interface ReplayLedger {
  /** Whether this requestId was already admitted and is still remembered. */
  seen(requestId: string): boolean;
  /**
   * Atomically refuses a seen requestId (REPLAYED) or records it. Re-checks expiry at commit time (EXPIRED). When the
   * ledger is full of entries that are still live it refuses (REPLAY_LEDGER_FULL) instead of evicting one, because
   * evicting a live entry would let that code be imported again.
   */
  admit(review: QrImportReview): ReplayAdmitResult;
  readonly size: number;
}

export function createReplayLedger(options: ReplayLedgerOptions): ReplayLedger {
  if (typeof options !== 'object' || options === null || typeof options.nowSeconds !== 'function') throw new TypeError('nowSeconds is required.');
  const maxEntries = options.maxEntries ?? DEFAULT_REPLAY_LEDGER_ENTRIES;
  const retention = options.retentionSeconds ?? DEFAULT_REPLAY_RETENTION_SECONDS;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_REPLAY_LEDGER_ENTRIES) throw new RangeError('maxEntries out of range.');
  if (!Number.isSafeInteger(retention) || retention < 1) throw new RangeError('retentionSeconds out of range.');
  const entries = new Map<string, number>();
  const clock = (): number => {
    const now = options.nowSeconds();
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid clock.');
    return now;
  };
  const purge = (now: number): void => { for (const [id, retireAt] of entries) if (retireAt <= now) entries.delete(id); };
  return Object.freeze({
    /** Fails closed: with an unusable clock every requestId reads as seen. */
    seen(requestId: string): boolean {
      try { purge(clock()); } catch { return true; }
      return entries.has(requestId);
    },
    admit(review: QrImportReview): ReplayAdmitResult {
      if (!isQrImportReview(review)) return failure('INVALID_INPUT');
      let now: number;
      try { now = clock(); } catch { return failure('UNAVAILABLE'); }
      purge(now);
      if (entries.has(review.requestId)) return failure('REPLAYED');
      if (review.expiresAt !== null && now + EXPIRY_SAFETY_MARGIN_SECONDS >= review.expiresAt) return failure('EXPIRED');
      if (entries.size >= maxEntries) return failure('REPLAY_LEDGER_FULL' satisfies QrErrorCode);
      // Kept past expiry by the future-skew allowance so a clock stepped back slightly still refuses the replay.
      entries.set(review.requestId, (review.expiresAt ?? now + retention) + MAX_FUTURE_SKEW_SECONDS);
      return Object.freeze({ ok: true });
    },
    get size(): number { return entries.size; },
  });
}
