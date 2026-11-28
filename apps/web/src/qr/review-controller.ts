/** Memory-only public QR review. It cannot negotiate, restore, connect, sign, send, navigate or persist. */
import { createQrEnvelope, createReplayLedger, decodeQrText, encodeQrText, encodeQrMatrix, MAX_QR_TEXT_LENGTH,
  RECOVERY_FINGERPRINT_FORMATS, EXPIRY_SAFETY_MARGIN_SECONDS, type QrImportReview, type QrMatrix,
  type RecoveryFingerprintFormat, type ReplayLedger, type Sha256 } from '../../../../packages/qr/index.ts';
import { parseBackupBytes, parseRecoveryReferenceExportBytes } from '../../../../packages/schemas/index.ts';
import { CandidateAttemptAdmission, localPolicyCode } from '../content-policy/local-policy.ts';
import { withQrFile, type QrFile } from './file-input.ts';
import { fixedFailure, MAX_IMAGE_BYTES, MAX_PUBLIC_FILE_BYTES, QR_OK, refuse, type QrAppCode, type QrAppResult, type QrPixels } from './protocol.ts';

export interface QrTrustedContext { readonly scope: string; readonly chains: readonly string[]; readonly expectedChain?: string }
export interface QrReviewSnapshot {
  readonly phase: 'idle' | 'working' | 'review' | 'confirmed' | 'error'; readonly busy: boolean;
  readonly review: QrImportReview | null; readonly text: string | null; readonly matrix: QrMatrix | null;
  readonly confirmed: boolean; readonly comparison: 'match' | 'different' | null; readonly error: QrAppCode | null;
}
export interface QrReviewOptions {
  context(): QrTrustedContext;
  sha256?: Sha256; nowSeconds?: () => number; randomBytes?: (length: number) => Uint8Array;
  admission?: Pick<CandidateAttemptAdmission, 'admitCandidate'>; ledger?: ReplayLedger;
  decodeImage?: (bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal) => Promise<QrAppResult<string | null>>;
  decodePixels?: (pixels: QrPixels, signal: AbortSignal) => Promise<QrAppResult<string | null>>;
}
const pageAdmission = new CandidateAttemptAdmission();
const pageLedger = createReplayLedger({ nowSeconds: () => Math.floor(Date.now() / 1000) });
const EMPTY: QrReviewSnapshot = Object.freeze({ phase: 'idle', busy: false, review: null, text: null, matrix: null, confirmed: false, comparison: null, error: null });
function fingerprintFormat(value: unknown): RecoveryFingerprintFormat {
  if (typeof value !== 'string' || !Object.hasOwn(RECOVERY_FINGERPRINT_FORMATS, value)) refuse('FILE_FORMAT');
  return value as RecoveryFingerprintFormat;
}
/** Structural format check only. A checksum/valid container cannot authenticate or decrypt the selected file. */
function checkFingerprintFile(bytes: Uint8Array<ArrayBuffer>, format: RecoveryFingerprintFormat): void {
  try {
    if (format === 'p2p-offramp-backup/v1') parseBackupBytes(bytes);
    else parseRecoveryReferenceExportBytes(bytes);
  } catch { refuse('FILE_FORMAT'); }
}
export function createQrReviewController(options: QrReviewOptions) {
  const sha256: Sha256 = options.sha256 ?? (bytes => crypto.subtle.digest('SHA-256', bytes));
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const randomBytes = options.randomBytes ?? (length => crypto.getRandomValues(new Uint8Array(length)));
  const admission = options.admission ?? pageAdmission, ledger = options.ledger ?? pageLedger;
  let snapshot = EMPTY, epoch = 0, disposed = false, physical = false, reviewContext: string | null = null;
  let abort: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (value: QrReviewSnapshot) => {
    snapshot = Object.freeze(value);
    for (const listener of listeners) { try { listener(); } catch { /* Display observers have no authority. */ } }
  };
  const readContext = () => {
    const raw = options.context();
    if (typeof raw.scope !== 'string' || raw.scope.length > 256 || !Array.isArray(raw.chains) || raw.chains.length > 64) refuse('UNAVAILABLE');
    const chains = Object.freeze([...raw.chains]);
    const context = Object.freeze({ scope: raw.scope, chains, ...(raw.expectedChain === undefined ? {} : { expectedChain: raw.expectedChain }) });
    return { context, key: JSON.stringify(context) };
  };
  const clock = () => { const value = nowSeconds(); if (!Number.isSafeInteger(value) || value < 0) refuse('UNAVAILABLE'); return value; };
  const currentReview = () => {
    if (!snapshot.review || snapshot.text === null || reviewContext === null) refuse('REVIEW_REQUIRED');
    if (readContext().key !== reviewContext) refuse('CONTEXT_CHANGED');
    const now = clock();
    if (snapshot.review.expiresAt !== null && now + EXPIRY_SAFETY_MARGIN_SECONDS >= snapshot.review.expiresAt) refuse('EXPIRED');
    return { review: snapshot.review, text: snapshot.text, matrix: snapshot.matrix };
  };
  type Work = (signal: AbortSignal, context: ReturnType<typeof readContext>, active: () => void) => Promise<Partial<QrReviewSnapshot>>;
  async function run(work: Work, retain = false): Promise<QrAppResult> {
    if (disposed) return { ok: false, code: 'CANCELLED' };
    if (physical) return { ok: false, code: 'BUSY' };
    physical = true; const generation = ++epoch; const controller = new AbortController(); abort = controller;
    const previous = snapshot;
    if (!retain) reviewContext = null;
    publish({ ...(retain ? previous : EMPTY), phase: 'working', busy: true, error: null, comparison: null });
    try {
      const context = readContext();
      const active = () => {
        if (disposed || generation !== epoch || controller.signal.aborted) refuse('CANCELLED');
        if (readContext().key !== context.key) refuse('CONTEXT_CHANGED');
      };
      active(); const result = await work(controller.signal, context, active); active();
      reviewContext = context.key;
      publish({ ...(retain ? previous : EMPTY), ...result, busy: false, error: null }); return QR_OK;
    } catch (error) {
      let failure = disposed || generation !== epoch || controller.signal.aborted ? fixedFailure({}) : fixedFailure(error);
      if (disposed || generation !== epoch || controller.signal.aborted) failure = { ok: false, code: 'CANCELLED' };
      const policy = localPolicyCode(error);
      if (failure.code === 'UNAVAILABLE' && policy === 'LOCAL_LIMIT_REACHED') failure = { ok: false, code: 'LOCAL_LIMIT_REACHED' };
      reviewContext = null;
      if (!disposed && generation === epoch) publish({ ...EMPTY, phase: failure.code === 'CANCELLED' ? 'idle' : 'error', error: failure.code === 'CANCELLED' ? null : failure.code });
      return failure;
    } finally {
      physical = false; if (abort === controller) abort = null;
      if (!disposed && snapshot.busy) publish({ ...EMPTY });
    }
  }
  async function decode(text: unknown, context: ReturnType<typeof readContext>, active: () => void, admit: boolean): Promise<QrImportReview> {
    if (typeof text !== 'string') refuse('INVALID_INPUT');
    if (text.length > MAX_QR_TEXT_LENGTH) refuse('QR_TOO_LARGE');
    if (admit) admission.admitCandidate();
    const checked = await decodeQrText(text, { ...context.context, sha256, nowSeconds }); active();
    if (!checked.ok) refuse(checked.code);
    if (admit && ledger.seen(checked.review.requestId)) refuse('REPLAYED');
    return checked.review;
  }
  async function proposal(text: unknown, context: ReturnType<typeof readContext>, active: () => void): Promise<Partial<QrReviewSnapshot>> {
    const review = await decode(text, context, active, true);
    const symbol = encodeQrMatrix(text as string); if (!symbol.ok) refuse(symbol.code);
    return { phase: 'review', review, text: text as string, matrix: symbol.matrix, confirmed: false, comparison: null };
  }
  const cancel = () => { epoch++; abort?.abort(); reviewContext = null; publish({ ...EMPTY, busy: physical }); };
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reviewText(text: unknown) { return run(async (_signal, context, active) => proposal(text, context, active)); },
    readEnvelopeFile(file: QrFile) {
      return run((signal, context, active) => withQrFile(file, MAX_PUBLIC_FILE_BYTES, signal, async bytes => {
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return refuse('INVALID_UNICODE'); }
        return proposal(text, context, active);
      }));
    },
    reviewImage(file: QrFile) {
      return run((signal, context, active) => withQrFile(file, MAX_IMAGE_BYTES, signal, async bytes => {
        if (!options.decodeImage) refuse('UNAVAILABLE');
        const decoded = await options.decodeImage(bytes, signal); active();
        if (!decoded.ok) refuse(decoded.code); if (decoded.value === null) refuse('NO_CODE');
        return proposal(decoded.value, context, active);
      }));
    },
    async reviewPixels(pixels: QrPixels) {
      try {
        return await run(async (signal, context, active) => {
          if (!options.decodePixels) refuse('UNAVAILABLE');
          const decoded = await options.decodePixels(pixels, signal); active();
          if (!decoded.ok) refuse(decoded.code); if (decoded.value === null) refuse('NO_CODE');
          return proposal(decoded.value, context, active);
        });
      } finally { try { pixels.pixels.fill(0); } catch { /* Detached transfer. */ } }
    },
    createFingerprint(file: QrFile, selectedFormat: unknown) {
      return run(async (signal, context, active) => {
        const format = fingerprintFormat(selectedFormat);
        return withQrFile(file, RECOVERY_FINGERPRINT_FORMATS[format], signal, async bytes => {
          checkFingerprintFile(bytes, format); active();
          const hash = new Uint8Array(await sha256(bytes)); active();
          if (hash.length !== 32) refuse('UNAVAILABLE');
          const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
          const created = await createQrEnvelope({ type: 'recovery-fingerprint', chain: null,
            payload: { format, byteLength: bytes.length, sha256: digest } }, { sha256, nowSeconds, randomBytes }); active();
          if (!created.ok) refuse(created.code);
          const encoded = await encodeQrText(created.envelope, { sha256, nowSeconds }); active();
          if (!encoded.ok) refuse(encoded.code);
          return proposal(encoded.text, context, active);
        });
      });
    },
    async confirm(): Promise<QrAppResult> {
      const expectedContext = reviewContext;
      const prior = snapshot;
      if (!prior.review || prior.text === null || prior.confirmed) return { ok: false, code: 'REVIEW_REQUIRED' };
      return run(async (_signal, context, active) => {
        if (expectedContext !== context.key) refuse('CONTEXT_CHANGED');
        const reviewed = await decode(prior.text, context, active, false); active();
        const admitted = ledger.admit(reviewed); if (!admitted.ok) refuse(admitted.code);
        return { phase: 'confirmed', review: reviewed, confirmed: true };
      }, true);
    },
    async compareFingerprint(file: QrFile): Promise<QrAppResult> {
      const prior = snapshot, expectedContext = reviewContext;
      if (!prior.confirmed || prior.review?.type !== 'recovery-fingerprint' || prior.text === null) return { ok: false, code: 'REVIEW_REQUIRED' };
      const fingerprint = prior.review;
      return run(async (signal, context, active) => {
        if (expectedContext !== context.key) refuse('CONTEXT_CHANGED');
        const payload = fingerprint.payload, format = fingerprintFormat(payload.format);
        return withQrFile(file, RECOVERY_FINGERPRINT_FORMATS[format], signal, async bytes => {
          checkFingerprintFile(bytes, format); active();
          const hash = new Uint8Array(await sha256(bytes)); active();
          if (hash.length !== 32) refuse('UNAVAILABLE');
          await decode(prior.text, context, active, false); active();
          const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
          return { phase: 'confirmed', comparison: bytes.length === payload.byteLength && digest === payload.sha256 ? 'match' : 'different' };
        });
      }, true);
    },
    /** Synchronous current-context/expiry check at the explicit public copy/download/display gesture. */
    confirmedText(): QrAppResult<string> {
      try {
        if (disposed || physical || !snapshot.confirmed) refuse('REVIEW_REQUIRED');
        return Object.freeze({ ok: true, value: currentReview().text });
      } catch (error) { cancel(); return fixedFailure(error); }
    },
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); listeners.clear(); },
  });
}
export type QrReviewController = ReturnType<typeof createQrReviewController>;
