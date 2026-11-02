/** Compatibility view of the single draft English source catalog. */
import { english, englishGroup } from './locale/en.ts';
export const messages = Object.freeze({
  ...englishGroup('shell'),
  backupVerified: (profileId: string, revision: number) => english('shell', 'backupVerified', { profileId, revision }),
  restored: (id: string, records: number) => english('shell', 'restored', { id, records }),
  restoredSelection: (id: string) => english('shell', 'restoredSelection', { id }),
  created: (id: string) => english('shell', 'created', { id }),
  capacityReached: (max: number) => english('shell', 'capacityReached', { max }),
  inventoryTitle: (count: number, max: number) => english('shell', 'inventoryTitle', { count, max }),
  useProfile: (id: string) => english('shell', 'useProfile', { id }),
  reconciledTitle: (count: number) => english('shell', 'reconciledTitle', { count }),
  errors: englishGroup('shellErrors'),
  compatibility: Object.freeze({
    ...englishGroup('compatibility'),
    missingFeatures: (features: string) => english('compatibility', 'missingFeatures', { features }),
  }),
});
