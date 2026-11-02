/** Live compatibility view; canonical values never enter locale parsing. */
import { message as english, messageGroup as englishGroup, mergeMessageViews } from './locale/runtime.ts';
export const messages = mergeMessageViews(englishGroup('shell'), {
  backupVerified: (profileId: string, revision: number) => english('shell', 'backupVerified', { profileId, revision }),
  restored: (id: string, records: number) => english('shell', 'restored', { id, records }),
  restoredSelection: (id: string) => english('shell', 'restoredSelection', { id }),
  created: (id: string) => english('shell', 'created', { id }),
  capacityReached: (max: number) => english('shell', 'capacityReached', { max }),
  inventoryTitle: (count: number, max: number) => english('shell', 'inventoryTitle', { count, max }),
  useProfile: (id: string) => english('shell', 'useProfile', { id }),
  reconciledTitle: (count: number) => english('shell', 'reconciledTitle', { count }),
  retentionCounts: (archive: number, reviewed: number, protectedCount: number, revision: number) => english('shell', 'retentionCounts', {archive,reviewed,protected:protectedCount,revision}),
  retentionDeleted: (count: number, revision: number) => english('shell', 'retentionDeleted', {count,revision}),
  errors: englishGroup('shellErrors'),
  favorites: englishGroup('favorites'),
  compatibility: mergeMessageViews(englishGroup('compatibility'), {
    missingFeatures: (features: string) => english('compatibility', 'missingFeatures', { features }),
  }),
});
