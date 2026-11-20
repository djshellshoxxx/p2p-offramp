/** Bounded partial Fisher-Yates reference. The exact domain/ABI-to-word profile is deliberately not invented. */
import { address, array, bindingOf, data, diagnostic, hex32, integer, result, roundOf, scopeFor, stop, uint,
  type CaseBinding, type DiagnosticOnly, type ReferenceResult, type TrustedReferencePorts } from './shared.ts';
import { scheduleOf } from './clock.ts';
export const MAX_POOL = 4096, MAX_DRAW_ATTEMPTS = 256, MAX_DRAW_STEPS = 64;
export interface DraftWordRequest { readonly binding: CaseBinding; readonly round: 0 | 1; readonly poolRoot: string; readonly seed: string; readonly counter: bigint; }
export interface DraftSnapshot extends Omit<DraftWordRequest, 'counter'> { readonly pool: readonly string[]; readonly excluded: readonly string[]; }
export interface DraftPorts extends TrustedReferencePorts {
  readonly validateSnapshot: (snapshot: DraftSnapshot) => boolean;
  /** Trusted deterministic uint256 words only, never a JSON randomness/provider/proof claim. */
  readonly drawWord: (request: DraftWordRequest) => bigint;
  readonly bondAvailable: (binding: CaseBinding, round: 0 | 1, jurorId: string) => boolean;
}
export interface DraftOptions { readonly binding: CaseBinding; readonly openedAt: bigint; readonly round: 0 | 1; readonly poolRoot: string;
  readonly seed: string; readonly pool: readonly string[]; readonly excluded: readonly string[]; readonly ports: DraftPorts; }
export interface DraftView extends DiagnosticOnly { readonly binding: CaseBinding; readonly round: 0 | 1; readonly targetSeats: 5 | 9;
  readonly status: 'drawing' | 'offered' | 'formed' | 'inconclusive'; readonly attempts: number; readonly cursor: number;
  readonly candidates: readonly string[]; readonly accepted: readonly string[]; readonly seated: readonly string[]; readonly reason: string | null; }
export interface DraftModel {
  process(maxSteps: number): ReferenceResult<DraftView>;
  acceptSeat(actor: string, jurorId: string): ReferenceResult<DraftView>;
  closeAcceptance(): ReferenceResult<DraftView>;
  inspect(): ReferenceResult<DraftView>;
  dispose(): void;
}
export function createDraftModel(input: DraftOptions): ReferenceResult<DraftModel> {
  return result(() => {
    const raw = data(input, ['binding', 'openedAt', 'round', 'poolRoot', 'seed', 'pool', 'excluded', 'ports']), binding = bindingOf(raw.binding), round = roundOf(raw.round);
    const clock = round === 0 ? scheduleOf(raw.openedAt).initial : scheduleOf(raw.openedAt).appeal;
    const pool = array(raw.pool, MAX_POOL).map(hex32), excluded = array(raw.excluded, 5).map(hex32), poolRoot = hex32(raw.poolRoot), seed = hex32(raw.seed);
    if (new Set(pool).size !== pool.length || new Set(excluded).size !== excluded.length || round === 0 && excluded.length !== 0 || pool.some(id => excluded.includes(id))) return stop();
    const ports = raw.ports as DraftPorts;
    if (!ports || typeof ports.validateSnapshot !== 'function' || typeof ports.drawWord !== 'function' || typeof ports.bondAvailable !== 'function') return stop();
    const validate = ports.validateSnapshot.bind(ports), word = ports.drawWord.bind(ports), available = ports.bondAvailable.bind(ports);
    const scope = scopeFor(binding, ports), targetSeats = round === 0 ? 5 : 9, snapshot = Object.freeze({ binding, round, poolRoot, seed, pool: Object.freeze([...pool]), excluded: Object.freeze([...excluded]) });
    const validated = scope.run(() => scope.invoke(() => validate(snapshot))); if (!validated.ok) return stop(validated.error.code); if (validated.value !== true) return stop('BINDING_MISMATCH');
    let status: DraftView['status'] = pool.length < 3 * targetSeats ? 'inconclusive' : 'drawing', reason: string | null = status === 'inconclusive' ? 'insufficient-pool' : null;
    let cursor = 0, attempts = 0; const accepted = new Set<string>(); let seated: readonly string[] = Object.freeze([]);
    const view = (): DraftView => diagnostic({ binding, round, targetSeats, status, attempts, cursor, candidates: Object.freeze(pool.slice(0, cursor)),
      accepted: Object.freeze(pool.slice(0, cursor).filter(id => accepted.has(id))), seated, reason });
    return Object.freeze({
      process(maxSteps) { return scope.run(() => {
        const steps = integer(maxSteps, MAX_DRAW_STEPS); if (steps === 0) return stop();
        if (status !== 'drawing') return view();
        if (scope.now() >= clock.acceptanceEnd) { status = 'inconclusive'; reason = 'draft-expired'; return view(); }
        const range = 1n << 256n;
        for (let step = 0; step < steps && cursor < 3 * targetSeats; step++) {
          if (attempts >= MAX_DRAW_ATTEMPTS) { status = 'inconclusive'; reason = 'rejection-limit'; break; }
          const request = Object.freeze({ binding, round, poolRoot, seed, counter: BigInt(attempts) }); let draw: bigint;
          try { draw = uint(scope.invoke(() => word(request))); } catch { status = 'inconclusive'; reason = 'word-unavailable'; break; }
          attempts++; const remaining = BigInt(pool.length - cursor), limit = range - range % remaining;
          if (draw >= limit) continue;
          const selected = cursor + Number(draw % remaining), prior = pool[cursor]!; pool[cursor] = pool[selected]!; pool[selected] = prior; cursor++;
        }
        if (cursor === 3 * targetSeats) status = 'offered'; else if (attempts >= MAX_DRAW_ATTEMPTS) { status = 'inconclusive'; reason = 'rejection-limit'; }
        return view();
      }); },
      acceptSeat(actorInput, jurorInput) { return scope.run(() => {
        const actor = address(actorInput), jurorId = hex32(jurorInput), now = scope.now();
        if (status !== 'offered' || now < clock.randomnessEnd || now >= clock.acceptanceEnd) return stop('WRONG_PHASE');
        if (!pool.slice(0, cursor).includes(jurorId)) return stop('NOT_SEATED'); if (accepted.has(jurorId)) return stop('ALREADY_ACCEPTED');
        scope.authorize('accept-seat', round, actor, jurorId);
        if (scope.invoke(() => available(binding, round, jurorId)) !== true) return stop('BOND_UNAVAILABLE');
        accepted.add(jurorId); return view();
      }); },
      closeAcceptance() { return scope.run(() => {
        if (status === 'formed' || status === 'inconclusive') return view(); if (scope.now() < clock.acceptanceEnd) return stop('WRONG_PHASE');
        const ordered = pool.slice(0, cursor).filter(id => accepted.has(id));
        if (status !== 'offered' || ordered.length < targetSeats) { status = 'inconclusive'; reason = 'insufficient-accepts'; }
        else { seated = Object.freeze(ordered.slice(0, targetSeats)); status = 'formed'; }
        return view();
      }); },
      inspect() { return scope.run(view); }, dispose: scope.dispose,
    } satisfies DraftModel);
  });
}
