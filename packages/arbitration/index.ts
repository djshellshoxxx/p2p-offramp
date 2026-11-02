/** Optional diagnostic reference models. No provider activation, on-chain execution, certificate authority or app wiring. */
export { buildCaseSchedule, phaseAt, HOUR, DAY, HARD_STOP_SECONDS, ACCOUNTING_GRACE_SECONDS } from './src/clock.ts';
export type { CaseSchedule, RoundClock } from './src/clock.ts';
export { encodeVoteVector, VOTE_TYPE, VOTE_TYPEHASH } from './src/vote.ts';
export type { VoteInput, VoteVector } from './src/vote.ts';
export { calculateTally, createRoundModel } from './src/tally.ts';
export type { RoundModel, RoundModelOptions, TallyProjection, PanelSeat, RoundOutcome, RoundView } from './src/tally.ts';
export { createDraftModel, MAX_POOL, MAX_DRAW_ATTEMPTS, MAX_DRAW_STEPS } from './src/draft.ts';
export type { DraftModel, DraftOptions, DraftPorts, DraftWordRequest, DraftSnapshot, DraftView } from './src/draft.ts';
export { createAppealModel } from './src/appeal.ts';
export type { AppealModel, AppealOptions, AppealPorts, AppealView, OutcomeProjection, RoundObservation, RoundFailure } from './src/appeal.ts';
export { calculateNonRevealPenalty } from './src/penalty.ts';
export { quoteFeeReserve, calculateFeeConservation, checkBondConservation, quoteSeatBond } from './src/accounting.ts';
export type { CaseBinding, DiagnosticOnly, ReferenceResult, ReferenceError, TrustedReferencePorts, ActorRequest } from './src/shared.ts';
