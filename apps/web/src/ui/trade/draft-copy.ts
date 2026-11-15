/** Live source-catalog view; locale changes cannot reinterpret canonical draft values. */
import { message, messageGroup, mergeMessageViews } from '../locale/runtime.ts';
import { errorMessage } from '../routes.ts';
import type { TradeDraftCopy } from './TradeDraftEditor.tsx';

const rejected = messageGroup('tradePageRejected');
const copy = messageGroup('drafts');
export const draftCopy: TradeDraftCopy = mergeMessageViews(copy, {
  fields: messageGroup('draftFields'),
  templateName: (slot: number) => message('drafts', 'templateName', { slot: slot + 1 }),
  affectedTemplates: (count: number) => message('drafts', 'affectedTemplates', { count }),
  error: (code: string) => code === 'UNKNOWN_OUTCOME' ? copy.operationFailed : Object.hasOwn(rejected, code) ? rejected[code as keyof typeof rejected] : errorMessage(code),
});
