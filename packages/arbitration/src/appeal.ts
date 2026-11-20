/** One-appeal/fixed-fallback diagnostic reference. This never emits a decision certificate or principal authorization. */
import { address, bindingOf, bool, data, diagnostic, result, roundOf, sameBinding, scopeFor, stop,
  type CaseBinding, type DiagnosticOnly, type ReferenceResult, type TrustedReferencePorts } from './shared.ts';
import { scheduleOf } from './clock.ts';
import type { RoundOutcome } from './tally.ts';
export type RoundFailure = 'randomness-timeout' | 'insufficient-panel' | 'required-evidence-unavailable' | 'quorum' | null;
export interface RoundObservation { readonly binding: CaseBinding; readonly round: 0 | 1; readonly closed: boolean; readonly result: RoundOutcome | null; readonly failure: RoundFailure; }
export interface AppealPorts extends TrustedReferencePorts {
  readonly readRound: (binding: CaseBinding, round: 0 | 1) => RoundObservation;
  readonly closeRound: (binding: CaseBinding, round: 0 | 1) => void;
  readonly hasBoundAppealReserve: (binding: CaseBinding) => boolean;
}
export interface AppealOptions { readonly binding: CaseBinding; readonly openedAt: bigint; readonly seller: string; readonly buyer: string; readonly ports: AppealPorts; }
export interface OutcomeProjection extends DiagnosticOnly { readonly binding: CaseBinding; readonly outcome: 'seller' | 'buyer'; readonly winningRound: 0 | 1 | null;
  readonly reason: 'jury' | 'fallback'; readonly asOf: bigint; readonly hardStopReached: boolean; }
export interface AppealView extends DiagnosticOnly { readonly binding: CaseBinding; readonly requested: boolean; readonly requestedBy: string | null; readonly finalProjection: OutcomeProjection | null; }
export interface AppealModel { requestAppeal(actor: string): ReferenceResult<AppealView>; finalize(): ReferenceResult<OutcomeProjection>; inspect(): ReferenceResult<AppealView>; dispose(): void; }
export function createAppealModel(input: AppealOptions): ReferenceResult<AppealModel> {
  return result(() => {
    const raw = data(input, ['binding', 'openedAt', 'seller', 'buyer', 'ports']), binding = bindingOf(raw.binding), plan = scheduleOf(raw.openedAt);
    const seller = address(raw.seller), buyer = address(raw.buyer); if (seller === buyer) return stop();
    const ports = raw.ports as AppealPorts;
    if (!ports || typeof ports.readRound !== 'function' || typeof ports.closeRound !== 'function' || typeof ports.hasBoundAppealReserve !== 'function') return stop();
    const read = ports.readRound.bind(ports), close = ports.closeRound.bind(ports), reserve = ports.hasBoundAppealReserve.bind(ports), scope = scopeFor(binding, ports);
    let requested = false, requestedBy: string | null = null, final: OutcomeProjection | null = null;
    const closedObservations = new Map<0 | 1, RoundObservation>();
    const view = (): AppealView => diagnostic({ binding, requested, requestedBy, finalProjection: final });
    function observation(round: 0 | 1, now: bigint): RoundObservation {
      const raw = data(scope.invoke(() => read(binding, round)), ['binding', 'round', 'closed', 'result', 'failure']);
      if (!sameBinding(bindingOf(raw.binding), binding) || roundOf(raw.round) !== round) return stop('BINDING_MISMATCH');
      const closed = bool(raw.closed), outcome = raw.result;
      if (outcome !== null && outcome !== 'seller' && outcome !== 'buyer' && outcome !== 'inconclusive') return stop();
      const failure = raw.failure as RoundFailure;
      if (![null, 'randomness-timeout', 'insufficient-panel', 'required-evidence-unavailable', 'quorum'].includes(failure)) return stop();
      if (!closed && (outcome !== null || failure !== null) || closed && outcome === null || failure !== null && outcome !== 'inconclusive') return stop();
      if (closed) {
        const clock = round === 0 ? plan.initial : plan.appeal;
        const earliest = failure === 'randomness-timeout' ? clock.randomnessEnd : failure === 'insufficient-panel' ? clock.acceptanceEnd : failure === 'required-evidence-unavailable' ? clock.evidenceEnd : clock.revealEnd;
        if (now < earliest) return stop('NOT_FINAL');
      }
      const prior = closedObservations.get(round);
      if (prior && (!closed || prior.result !== outcome || prior.failure !== failure)) return stop('BINDING_MISMATCH');
      const observation = Object.freeze({ binding, round, closed, result: outcome, failure });
      if (closed) closedObservations.set(round, observation);
      return observation;
    }
    return Object.freeze({
      requestAppeal(actorInput) { return scope.run(() => {
        const actor = address(actorInput), now = scope.now(); if (final) return stop('FINAL');
        if (actor !== seller && actor !== buyer) return stop('NOT_PARTY'); if (requested) return stop('APPEAL_ALREADY_OPEN');
        if (now < plan.initial.revealEnd || now >= plan.initial.appealEnd!) return stop('WRONG_PHASE');
        scope.authorize('appeal', 0, actor, null); if (scope.invoke(() => reserve(binding)) !== true) return stop('INSUFFICIENT_RESERVE');
        if (!observation(0, now).closed) scope.invoke(() => close(binding, 0));
        if (!observation(0, now).closed) return stop('ROUND_NOT_CLOSED'); requested = true; requestedBy = actor; return view();
      }); },
      finalize() { return scope.run(() => {
        if (final) return final; const now = scope.now(), hardStopReached = now >= plan.hardStop;
        if (!requested && now < plan.initial.appealEnd! || requested && now < plan.appeal.startsAt) return stop('NOT_FINAL');
        let initial = observation(0, now), appeal: RoundObservation | null = requested ? observation(1, now) : null;
        if (!hardStopReached) {
          if (!initial.closed && now >= plan.initial.revealEnd) { scope.invoke(() => close(binding, 0)); initial = observation(0, now); }
          if (appeal && !appeal.closed && now >= plan.appeal.revealEnd) { scope.invoke(() => close(binding, 1)); appeal = observation(1, now); }
          if (!initial.closed || appeal && !appeal.closed) return stop('NOT_FINAL');
        }
        const chosen = appeal?.closed && (appeal.result === 'buyer' || appeal.result === 'seller') ? appeal :
          initial.closed && (initial.result === 'buyer' || initial.result === 'seller') ? initial : null;
        final = diagnostic({ binding, outcome: chosen?.result === 'buyer' ? 'buyer' : 'seller', winningRound: chosen?.round ?? null,
          reason: chosen ? 'jury' as const : 'fallback' as const, asOf: now, hardStopReached }); return final;
      }); },
      inspect() { return scope.run(view); }, dispose: scope.dispose,
    } satisfies AppealModel);
  });
}
