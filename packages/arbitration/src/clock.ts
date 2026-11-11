/** G34 maximum-duration baseline reference. These calculations never extend or authenticate a native deadline. */
import { add, diagnostic, result, roundOf, uint, type DiagnosticOnly, type ReferenceResult } from './shared.ts';
export const HOUR = 3600n, DAY = 24n * HOUR, HARD_STOP_SECONDS = 14n * DAY, ACCOUNTING_GRACE_SECONDS = DAY;
export interface RoundClock { readonly round: 0 | 1; readonly startsAt: bigint; readonly randomnessEnd: bigint; readonly acceptanceEnd: bigint;
  readonly evidenceEnd: bigint; readonly commitStart: bigint; readonly commitEnd: bigint; readonly revealEnd: bigint; readonly appealEnd: bigint | null; }
export interface CaseSchedule extends DiagnosticOnly { readonly openedAt: bigint; readonly hardStop: bigint; readonly accountingAfter: bigint;
  readonly initial: RoundClock; readonly appeal: RoundClock; readonly maximumScheduledEnd: bigint; }
function clock(round: 0 | 1, start: bigint): RoundClock {
  const randomnessEnd = add(start, 12n * HOUR), acceptanceEnd = add(randomnessEnd, DAY), evidenceEnd = add(acceptanceEnd, DAY);
  const commitEnd = add(evidenceEnd, DAY), revealEnd = add(commitEnd, DAY);
  return Object.freeze({ round, startsAt: start, randomnessEnd, acceptanceEnd, evidenceEnd, commitStart: evidenceEnd, commitEnd, revealEnd,
    appealEnd: round === 0 ? add(revealEnd, DAY) : null });
}
export function scheduleOf(openedAt: unknown): CaseSchedule {
  const opened = uint(openedAt), hardStop = add(opened, HARD_STOP_SECONDS), initial = clock(0, opened), appeal = clock(1, initial.appealEnd!);
  return diagnostic({ openedAt: opened, hardStop, accountingAfter: add(hardStop, ACCOUNTING_GRACE_SECONDS), initial, appeal, maximumScheduledEnd: appeal.revealEnd });
}
export const buildCaseSchedule = (openedAt: unknown): ReferenceResult<CaseSchedule> => result(() => scheduleOf(openedAt));
export function phaseAt(openedAt: unknown, round: unknown, chainTime: unknown) {
  return result(() => {
    const plan = scheduleOf(openedAt), selected = roundOf(round) === 0 ? plan.initial : plan.appeal, now = uint(chainTime);
    let phase: 'not-open' | 'randomness' | 'acceptance' | 'evidence' | 'commit' | 'reveal' | 'appeal' | 'round-closed' | 'hard-stop';
    if (now >= plan.hardStop) phase = 'hard-stop'; else if (now < selected.startsAt) phase = 'not-open';
    else if (now < selected.randomnessEnd) phase = 'randomness'; else if (now < selected.acceptanceEnd) phase = 'acceptance';
    else if (now < selected.evidenceEnd) phase = 'evidence'; else if (now < selected.commitEnd) phase = 'commit';
    else if (now < selected.revealEnd) phase = 'reveal'; else if (selected.appealEnd !== null && now < selected.appealEnd) phase = 'appeal'; else phase = 'round-closed';
    return diagnostic({ round: selected.round, phase, chainTime: now });
  });
}
