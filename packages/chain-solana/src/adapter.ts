/**
 * Adapter between `SolanaIntentRecord` and the shared G12 intent schema (`packages/schemas/src/intent.ts`,
 * `IntentV2`, owned by Lane A and not edited here). Every mapped value is checked with Lane A's own `parseIntent`.
 *
 * What the shared schema can carry: binding, fee payer (`account`), fund/release/refund, the marker
 * (`sendMarkedAt`), origin profile, and `submission: { chain: 'solana', signature, blockhash, lastValidBlockHeight }`.
 * Genesis hash, program id, ProgramData pin, escrow, role, message bytes and blockhash slot travel in the opaque
 * `preparedRequest` string as canonical JSON (`p2p-offramp/solana-prepared/v1`).
 *
 * What it cannot carry (see "Needs Lane A" in docs/lifecycle.md): the `payout` action and the `released`/`refunded`
 * expected states (refused: UNSUPPORTED_PROVIDER); a signature journaled before the marker (`prepared` forbids a
 * signature, so `signed` maps to `prepared` without it: lossy); the finalized slot and error label (lossy);
 * `walletGeneration` has no Solana meaning (written as 0).
 *
 * Import (`fromLaneAIntent`) never trusts a stored terminal label: a marked record comes back `unknown` and is
 * reconciled from chain state, a signed-but-unmarked one comes back `signed` (possibly sent), a V1 record has no
 * provenance (origin UNKNOWN_ORIGIN, so it is never this profile's own never-sent preparation).
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { parseIntent, type CoreResult, type Intent, type IntentV2 } from '../../schemas/index.ts';
import type { BoundSolanaTrade } from './bind.ts';
import { canonicalKey, decimalU64, fail, failureCode } from './codec.ts';
import {
  exactData, parseSolanaIntent, SOLANA_INTENT_FORMAT, UNKNOWN_ORIGIN, verifyIntentForTrade,
  type SolanaIntentRecord, type SolanaIntentState,
} from './intent.ts';

export const SOLANA_PREPARED_REQUEST_FORMAT = 'p2p-offramp/solana-prepared/v1';
export interface LaneAIntentMapping { readonly intent: IntentV2; readonly lossy: readonly string[] }

const STATE: Readonly<Record<SolanaIntentState, IntentV2['state']>> = Object.freeze({
  prepared: 'prepared', signed: 'prepared', sendMarked: 'broadcast-unknown', sent: 'pending',
  unknown: 'broadcast-unknown', finalized: 'finalized', failed: 'failed', dropped: 'expired', cancelled: 'failed',
});
const REQUEST_KEYS = Object.freeze(['format', 'genesisHash', 'programId', 'programDataSha256', 'escrow', 'role',
  'message', 'blockhashSlot']);

function result<T>(work: () => T): CoreResult<T> {
  try { return { ok: true, value: work() }; } catch (error) {
    const code = failureCode(error, 'INVALID_INPUT');
    return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) };
  }
}

/** Maps one record onto IntentV2; `payout` (and its expected states) is not representable there. */
export function toLaneAIntent(input: SolanaIntentRecord): CoreResult<LaneAIntentMapping> {
  return result(() => {
    const record = parseSolanaIntent(input);
    if (record.action === 'payout') return fail('UNSUPPORTED_PROVIDER');
    const lossy: string[] = ['walletGeneration'];
    if (record.state === 'signed') lossy.push('signature-before-marker');
    if (record.outcome !== null) lossy.push('outcome');
    if (record.state === 'cancelled') lossy.push('cancelled-as-failed');
    const preparedRequest = JSON.stringify({
      format: SOLANA_PREPARED_REQUEST_FORMAT, genesisHash: record.genesisHash, programId: record.programId,
      programDataSha256: record.programDataSha256, escrow: record.escrow, role: record.role, message: record.message,
      blockhashSlot: record.blockhashSlot,
    });
    const signature = record.state === 'signed' ? null : record.signature;
    let intent: Intent;
    try {
      intent = parseIntent({
        version: 2, intentId: record.intentId, binding: { ...record.binding }, account: record.feePayer,
        action: record.action, state: STATE[record.state], walletGeneration: 0,
        expectedEscrowState: record.expectedEscrowState, preparedRequest,
        submission: { chain: 'solana', signature, blockhash: record.blockhash,
          lastValidBlockHeight: record.lastValidBlockHeight },
        replacementOf: record.replacementOf, createdAt: record.createdAt, updatedAt: record.updatedAt,
        sendMarkedAt: record.sendMarkedAt, originProfileId: record.originProfileId,
      });
    } catch { return fail('UNSUPPORTED_PROVIDER'); }
    if (intent.version !== 2) return fail('INTEGRITY_FAILURE');
    return Object.freeze({ intent, lossy: Object.freeze(lossy) });
  });
}

function preparedRequest(input: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(input) as unknown; } catch { return fail('INVALID_INPUT'); }
  const raw = exactData(parsed, REQUEST_KEYS);
  if (raw.format !== SOLANA_PREPARED_REQUEST_FORMAT) return fail('UNSUPPORTED_VERSION');
  for (const key of ['genesisHash', 'programId', 'escrow']) canonicalKey(raw[key], 'INVALID_INPUT');
  decimalU64(raw.blockhashSlot);
  // Canonical form only: re-encoding must give back the stored string.
  if (JSON.stringify(Object.fromEntries(REQUEST_KEYS.map(key => [key, raw[key]]))) !== input) {
    return fail('INVALID_INPUT');
  }
  return raw;
}
function importedState(intent: Intent, signature: string | null, marker: number | null): SolanaIntentState {
  if (intent.state === 'prepared') return signature === null && marker === null ? 'prepared' : fail('INVALID_INPUT');
  // A marked Solana intent without its signature can be settled only by expiry; the shared journal cannot write the
  // signature with the marker today (Needs Lane A), so such a record is refused rather than misread.
  if (signature === null) return fail('UNSUPPORTED_PROVIDER');
  return marker === null ? 'signed' : 'unknown';
}

/** Re-imports a shared-schema Solana intent for one trade; terminal labels are re-observed, never trusted. */
export function fromLaneAIntent(input: unknown, trade: BoundSolanaTrade): CoreResult<SolanaIntentRecord> {
  return result(() => {
    let intent: Intent;
    try { intent = parseIntent(input); } catch { return fail('INVALID_INPUT'); }
    if (intent.binding.chain !== 'solana' || intent.submission.chain !== 'solana') return fail('WRONG_CHAIN');
    const request = preparedRequest(intent.preparedRequest);
    const marker = intent.version === 2 ? intent.sendMarkedAt : null;
    const origin = intent.version === 2 ? intent.originProfileId : UNKNOWN_ORIGIN;
    const signature = intent.submission.signature;
    const record = parseSolanaIntent({
      format: SOLANA_INTENT_FORMAT, intentId: intent.intentId, binding: { ...intent.binding },
      genesisHash: request.genesisHash, programId: request.programId, programDataSha256: request.programDataSha256,
      escrow: request.escrow, action: intent.action === 'approve' ? fail('INVALID_INPUT') : intent.action,
      role: request.role, feePayer: intent.account, expectedEscrowState: intent.expectedEscrowState,
      message: request.message, blockhash: intent.submission.blockhash, blockhashSlot: request.blockhashSlot,
      lastValidBlockHeight: intent.submission.lastValidBlockHeight, signature,
      state: importedState(intent, signature, marker), sendMarkedAt: marker, outcome: null,
      replacementOf: intent.replacementOf, originProfileId: origin, createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    });
    verifyIntentForTrade(record, trade);
    return record;
  });
}
