/** Optional LOCAL controls; no default app integration or transaction authority. */
export { createDecoyProfile, createDuressController } from './src/duress.ts';
export type { DecoyProfile, DecoyCreation, DuressControllerOptions, DuressController, DuressStatus, DecoyView } from './src/duress.ts';
export { validateLocalSweepPlan, createSweepReminders } from './src/sweep.ts';
export type { LocalSweepPlan, SweepAsset, SweepScope, SweepReminderOptions, SweepReminders, ReminderHandle, ReminderState, ReminderView } from './src/sweep.ts';
