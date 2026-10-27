/** Public diagnostic boundary; no storage, provider or private journal access is exported. */
export { createCoreError, createOperationId, normalizeError } from './src/errors.ts';
export type { CoreError, CoreErrorCode, CoreResult, RecoveryAction } from './src/errors.ts';
