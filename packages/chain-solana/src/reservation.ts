/** Bounded, durable native reservation identities. No wallet, storage or random allocation. */
import { parseIntentId, sameBinding, type TradeBinding } from '../../schemas/index.ts';
import { parseSolanaBinding } from './bind.ts';
import { fail } from './codec.ts';
import { exactData, isTerminal, parseSolanaIntent, UNKNOWN_ORIGIN, type SolanaIntentRecord } from './intent.ts';

export const MAX_INTENTS_PER_TRADE = 32;
export interface SolanaReservationRef {
  readonly originProfileId: string; readonly intentId: string; readonly generation: number;
}
export interface SolanaReservationIdentity extends SolanaReservationRef { readonly binding: TradeBinding }
export interface SolanaReservationEntry {
  readonly generation: number; readonly intent: SolanaIntentRecord; readonly replaces: SolanaReservationRef | null;
}
export interface SolanaReservedIntent {
  readonly identity: SolanaReservationIdentity; readonly record: SolanaIntentRecord; readonly revision: number;
}

export function reservationGeneration(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) return fail('INVALID_INPUT');
  return input;
}
function reference(raw: Record<string, unknown>): SolanaReservationRef {
  if (typeof raw.originProfileId !== 'string' || !/^[0-9a-f]{32}$/.test(raw.originProfileId)) return fail('INVALID_INPUT');
  let intentId: string;
  try { intentId = parseIntentId(raw.intentId); } catch { return fail('INVALID_INPUT'); }
  return Object.freeze({ originProfileId: raw.originProfileId, intentId,
    generation: reservationGeneration(raw.generation) });
}
export function parseReservationRef(input: unknown): SolanaReservationRef {
  return reference(exactData(input, ['originProfileId', 'intentId', 'generation']));
}
export function parseReservationIdentity(input: unknown): SolanaReservationIdentity {
  const raw = exactData(input, ['binding', 'originProfileId', 'intentId', 'generation']);
  return Object.freeze({ binding: parseSolanaBinding(raw.binding), ...reference(raw) });
}
export function reservationRef(identity: SolanaReservationIdentity): SolanaReservationRef {
  const copy = parseReservationIdentity(identity);
  return Object.freeze({ originProfileId: copy.originProfileId, intentId: copy.intentId, generation: copy.generation });
}
export function identityFromEntry(entry: SolanaReservationEntry): SolanaReservationIdentity {
  return Object.freeze({ binding: entry.intent.binding, originProfileId: entry.intent.originProfileId,
    intentId: entry.intent.intentId, generation: entry.generation });
}
export const sameReservationRef = (a: SolanaReservationRef, b: SolanaReservationRef): boolean =>
  a.generation === b.generation && a.intentId === b.intentId && a.originProfileId === b.originProfileId;
export const sameReservationIdentity = (
  a: SolanaReservationIdentity | null | undefined, b: SolanaReservationIdentity | null | undefined,
): boolean => a == null || b == null ? a == null && b == null : sameBinding(a.binding, b.binding) && sameReservationRef(a, b);

export const intentOrder = (a: SolanaIntentRecord, b: SolanaIntentRecord): number =>
  a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0;
const actionOrder = (a: SolanaIntentRecord, b: SolanaIntentRecord): number =>
  a.createdAt - b.createdAt || intentOrder(a, b);

/** Parse wrappers and the complete predecessor graph; migration generations need not be chronological. */
export function parseReservationEntries(input: unknown, binding: TradeBinding, revision: number): readonly SolanaReservationEntry[] {
  if (!Array.isArray(input) || input.length > MAX_INTENTS_PER_TRADE || revision < 1 || !Number.isSafeInteger(revision) ||
      (input.length === 0 && revision !== 1)) {
    return fail('INTEGRITY_FAILURE');
  }
  const entries: SolanaReservationEntry[] = [], generations = new Set<number>();
  for (let index = 0; index < input.length; index++) {
    const field = Object.getOwnPropertyDescriptor(input, String(index));
    if (!field || !('value' in field)) return fail('INTEGRITY_FAILURE');
    const raw = exactData(field.value, ['generation', 'intent', 'replaces']);
    const generation = reservationGeneration(raw.generation), intent = parseSolanaIntent(raw.intent);
    const replaces = raw.replaces === null ? null : parseReservationRef(raw.replaces);
    if (generation > revision || generations.has(generation) || !sameBinding(intent.binding, binding) ||
        (index > 0 && intentOrder(entries[index - 1]!.intent, intent) >= 0) ||
        (intent.replacementOf === null) !== (replaces === null) ||
        (replaces !== null && replaces.intentId !== intent.replacementOf)) return fail('INTEGRITY_FAILURE');
    generations.add(generation); entries.push(Object.freeze({ generation, intent, replaces }));
  }
  if (entries.filter(entry => !isTerminal(entry.intent)).length > 1) return fail('INTEGRITY_FAILURE');
  const predecessors = new Map<number, number>(), successors = new Set<number>();
  for (const entry of entries) {
    if (entry.replaces === null) continue;
    const original = entries.find(candidate => sameReservationRef(identityFromEntry(candidate), entry.replaces!));
    if (!original || original.intent.state !== 'dropped' || original.intent.action !== entry.intent.action ||
        successors.has(original.generation)) return fail('INTEGRITY_FAILURE');
    predecessors.set(entry.generation, original.generation); successors.add(original.generation);
  }
  for (const entry of entries) {
    const visited = new Set<number>(); let generation: number | undefined = entry.generation;
    while (generation !== undefined) {
      if (visited.has(generation)) return fail('INTEGRITY_FAILURE');
      visited.add(generation); generation = predecessors.get(generation);
    }
  }
  return Object.freeze(entries);
}

/** Preserve all four action heads as well as every signed, uncertain, foreign or linked record. */
export function eligibleForRetirement(
  entries: readonly SolanaReservationEntry[], entry: SolanaReservationEntry, profileId: string,
): boolean {
  const record = entry.intent;
  if (!entries.includes(entry) || !/^[0-9a-f]{32}$/.test(profileId) || profileId === UNKNOWN_ORIGIN ||
      record.originProfileId !== profileId || record.state !== 'cancelled' || record.signature !== null ||
      record.sendMarkedAt !== null || record.outcome !== null || record.replacementOf !== null || entry.replaces !== null ||
      entries.some(candidate => candidate.intent.replacementOf === record.intentId)) return false;
  const latest = entries.filter(candidate => candidate.intent.action === record.action)
    .map(candidate => candidate.intent).sort(actionOrder).at(-1);
  return latest !== record;
}

export function selectRetirementCandidate(
  entries: readonly SolanaReservationEntry[], profileId: string,
): SolanaReservationRef | null {
  if (entries.length !== MAX_INTENTS_PER_TRADE) return null;
  const candidate = [...entries].filter(entry => eligibleForRetirement(entries, entry, profileId))
    .sort((a, b) => actionOrder(a.intent, b.intent)).at(0);
  return candidate ? reservationRef(identityFromEntry(candidate)) : null;
}
