/** N=5/9 fixed quorum reference and local commit/reveal simulation. No RPC, signatures or native vote authority. */
import { address, array, bindingOf, choiceOf, data, diagnostic, hex32, result, roundOf, scopeFor, stop,
  type CaseBinding, type DiagnosticOnly, type ReferenceResult, type TrustedReferencePorts } from './shared.ts';
import { scheduleOf } from './clock.ts';
import { vectorOf } from './vote.ts';
export type RoundOutcome = 'seller' | 'buyer' | 'inconclusive';
export interface TallyProjection extends DiagnosticOnly { readonly round: 0 | 1; readonly panelSize: 5 | 9; readonly quorum: 4 | 6;
  readonly seller: number; readonly buyer: number; readonly abstain: number; readonly missing: number; readonly result: RoundOutcome; readonly closed: boolean; }
function tally(round: 0 | 1, votes: readonly unknown[], closed: boolean): TallyProjection {
  const panelSize = round === 0 ? 5 : 9, quorum = round === 0 ? 4 : 6, directional = round === 0 ? 3 : 5;
  if (votes.length !== panelSize) return stop();
  let seller = 0, buyer = 0, abstain = 0, missing = 0;
  for (const vote of votes) { if (vote === null) missing++; else { const choice = choiceOf(vote); if (choice === 0) seller++; else if (choice === 1) buyer++; else abstain++; } }
  const participating = seller + buyer + abstain;
  const outcome = participating >= quorum ? seller >= directional ? 'seller' : buyer >= directional ? 'buyer' : 'inconclusive' : 'inconclusive';
  return diagnostic({ round, panelSize, quorum, seller, buyer, abstain, missing, result: outcome, closed });
}
export const calculateTally = (round: unknown, votes: unknown): ReferenceResult<TallyProjection> => result(() => tally(roundOf(round), array(votes, 9), false));
export interface PanelSeat { readonly jurorId: string; readonly votingAddress: string; readonly operatorGroup: string; }
interface Seat extends PanelSeat { commitment: string | null; revealed: 0 | 1 | 2 | null; }
export interface RoundModelOptions { readonly binding: CaseBinding; readonly openedAt: bigint; readonly round: 0 | 1;
  readonly panel: readonly PanelSeat[]; readonly evidenceRoot: string; readonly ports: TrustedReferencePorts; }
export interface RoundView extends DiagnosticOnly { readonly binding: CaseBinding; readonly round: 0 | 1; readonly evidenceRoot: string;
  readonly committed: number; readonly revealed: number; readonly closedTally: TallyProjection | null; }
export interface RoundModel {
  commit(actor: string, jurorId: string, commitment: string): ReferenceResult<RoundView>;
  reveal(actor: string, jurorId: string, choice: number, salt: string): ReferenceResult<RoundView>;
  close(): ReferenceResult<TallyProjection>;
  inspect(): ReferenceResult<RoundView>;
  dispose(): void;
}
export function createRoundModel(input: RoundModelOptions): ReferenceResult<RoundModel> {
  return result(() => {
    const raw = data(input, ['binding', 'openedAt', 'round', 'panel', 'evidenceRoot', 'ports']), binding = bindingOf(raw.binding), round = roundOf(raw.round);
    const clock = round === 0 ? scheduleOf(raw.openedAt).initial : scheduleOf(raw.openedAt).appeal, evidenceRoot = hex32(raw.evidenceRoot);
    const seats: Seat[] = array(raw.panel, 9).map(input => {
      const row = data(input, ['jurorId', 'votingAddress', 'operatorGroup']);
      return { jurorId: hex32(row.jurorId), votingAddress: address(row.votingAddress), operatorGroup: hex32(row.operatorGroup), commitment: null, revealed: null };
    });
    if (seats.length !== (round === 0 ? 5 : 9) || [seats.map(s => s.jurorId), seats.map(s => s.votingAddress), seats.map(s => s.operatorGroup)].some(ids => new Set(ids).size !== ids.length)) return stop();
    const scope = scopeFor(binding, raw.ports as TrustedReferencePorts); let closed: TallyProjection | null = null;
    const view = (): RoundView => diagnostic({ binding, round, evidenceRoot, committed: seats.filter(s => s.commitment !== null).length,
      revealed: seats.filter(s => s.revealed !== null).length, closedTally: closed });
    function seatFor(actorInput: unknown, jurorInput: unknown, action: 'commit' | 'reveal'): Seat {
      const actor = address(actorInput), jurorId = hex32(jurorInput), seat = seats.find(s => s.jurorId === jurorId);
      if (!seat || seat.votingAddress !== actor) return stop('NOT_SEATED'); scope.authorize(action, round, actor, jurorId); return seat;
    }
    return Object.freeze({
      commit(actor, jurorId, input) { return scope.run(() => {
        const commitment = hex32(input), seat = seatFor(actor, jurorId, 'commit'), now = scope.now();
        if (closed || now < clock.commitStart || now >= clock.commitEnd) return stop('WRONG_PHASE');
        if (seat.commitment !== null) return stop('ALREADY_COMMITTED'); seat.commitment = commitment; return view();
      }); },
      reveal(actor, jurorId, choiceInput, saltInput) { return scope.run(() => {
        const choice = choiceOf(choiceInput), salt = hex32(saltInput), seat = seatFor(actor, jurorId, 'reveal'), now = scope.now();
        if (closed || now < clock.commitEnd || now >= clock.revealEnd) return stop('WRONG_PHASE');
        if (seat.revealed !== null) return stop('ALREADY_REVEALED');
        if (seat.commitment === null || vectorOf({ chainId: binding.chainId, tribunal: binding.tribunal, policyHash: binding.policyHash,
          caseId: binding.caseId, round, jurorId: seat.jurorId, evidenceRoot, choice, salt }).digest !== seat.commitment) return stop('INVALID_PREIMAGE');
        seat.revealed = choice; return view();
      }); },
      close() { return scope.run(() => {
        if (closed) return closed; if (scope.now() < clock.revealEnd) return stop('WRONG_PHASE');
        closed = tally(round, seats.map(seat => seat.revealed), true); return closed;
      }); },
      inspect() { return scope.run(view); }, dispose: scope.dispose,
    } satisfies RoundModel);
  });
}
