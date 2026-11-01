import { english, englishGroup } from './locale/en.ts';
export const diagnosticsMessages = Object.freeze({
  ...englishGroup('diagnostics'),
  event: (index: number) => english('diagnostics', 'event', { index }),
  byteCount: (bytes: number) => english('diagnostics', 'byteCount', { bytes }),
  errors: englishGroup('diagnosticErrors'), warnings: englishGroup('diagnosticWarnings'),
});
