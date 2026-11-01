import { english, englishGroup } from './locale/en.ts';
export const recoveryReferenceMessages = Object.freeze({
  ...englishGroup('recovery'),
  ...englishGroup('labels'),
  page: (offset: number, total: number, revision: number) => english('recovery', 'page', {
    start: total ? offset + 1 : 0, end: Math.min(offset + 64, total), total, revision,
  }),
  unsupported: (count: number) => english('recovery', 'unsupported', { count }),
  reference: (index: number) => english('recovery', 'reference', { index }),
});
