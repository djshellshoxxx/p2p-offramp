/** G13 fixed public errors. Raw exception messages, stacks, URLs and causes are never copied. */
import type { CoreError, CoreErrorCode, RecoveryAction } from '../../schemas/src/core.ts';
export type { CoreError, CoreErrorCode, CoreResult, RecoveryAction } from '../../schemas/src/core.ts';
const ACTIONS: Readonly<Record<CoreErrorCode, RecoveryAction>> = Object.freeze({
  INVALID_INPUT: 'edit-input', UNSUPPORTED_VERSION: 'export', UNSUPPORTED_PROVIDER: 'change-provider', WRONG_CHAIN: 'reconnect', UNAUTHORIZED: 'reconnect', USER_REJECTED: 'none', LOCKED: 'unlock', CONFLICT: 'reload', UNAVAILABLE: 'change-provider', TIMEOUT: 'change-provider', CANCELLED: 'none', LIMIT_EXCEEDED: 'none', INTEGRITY_FAILURE: 'change-provider', BROADCAST_UNKNOWN: 'reconcile', EXPIRED: 'edit-input',
});
export function createOperationId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export interface ErrorContext { readonly operationId: string; readonly readOnly: boolean; }
export function createCoreError(code: CoreErrorCode, context: ErrorContext): CoreError {
  const validCode = typeof code === 'string' && Object.hasOwn(ACTIONS, code) ? code : 'INVALID_INPUT';
  const correlationId = typeof context.operationId === 'string' && /^[0-9a-f]{32}$/.test(context.operationId) ? context.operationId : createOperationId();
  return Object.freeze({ code: validCode, retryable: context.readOnly && (validCode === 'TIMEOUT' || validCode === 'UNAVAILABLE'), action: ACTIONS[validCode], correlationId, messageKey: `core.error.${validCode.toLowerCase()}` });
}
export interface NormalizeContext { readonly operationId: string; readonly phase: 'read' | 'prepare' | 'send-started'; }
export function normalizeError(input: unknown, context: NormalizeContext): CoreError {
  if (context.phase === 'send-started') return createCoreError('BROADCAST_UNKNOWN', { operationId: context.operationId, readOnly: false });
  let code: unknown;
  try {
    if (typeof input === 'object' && input !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(input, 'code');
      if (descriptor && 'value' in descriptor) code = descriptor.value;
    }
  } catch { /* Hostile foreign objects are treated as unavailable without reading diagnostics. */ }
  const known: CoreErrorCode = code === 4001 ? 'USER_REJECTED' : typeof code === 'string' && Object.hasOwn(ACTIONS, code) ? code as CoreErrorCode : 'UNAVAILABLE';
  return createCoreError(known, { operationId: context.operationId, readOnly: context.phase === 'read' });
}
