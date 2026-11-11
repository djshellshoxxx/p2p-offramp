import { message as english, messageGroup as englishGroup, mergeMessageViews } from './locale/runtime.ts';
export const recoveryReferenceMessages = mergeMessageViews(mergeMessageViews(englishGroup('recovery'), englishGroup('labels')), {
  page: (offset: number, total: number, revision: number) => english('recovery', 'page', {
    start: total ? offset + 1 : 0, end: Math.min(offset + 64, total), total, revision,
  }),
  unsupported: (count: number) => english('recovery', 'unsupported', { count }),
  reference: (index: number) => english('recovery', 'reference', { index }),
});
