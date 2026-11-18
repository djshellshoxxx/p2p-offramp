import { message as english, messageGroup as englishGroup, mergeMessageViews } from './locale/runtime.ts';
export const diagnosticsMessages = mergeMessageViews(englishGroup('diagnostics'), {
  event: (index: number) => english('diagnostics', 'event', { index }),
  byteCount: (bytes: number) => english('diagnostics', 'byteCount', { bytes }),
  errors: englishGroup('diagnosticErrors'), warnings: englishGroup('diagnosticWarnings'),
});
