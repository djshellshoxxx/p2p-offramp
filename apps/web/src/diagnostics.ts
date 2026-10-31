/** Browser-only G26 storage adapter. No release context exists in the default unsigned shell. */
import { createDiagnostics, type Diagnostics } from '../../../packages/diagnostics/index.ts';
const KEY = 'p2p-offramp-diagnostics-v1';
export function createLocalDiagnostics(release?: unknown): Diagnostics {
  return createDiagnostics({ release, storageSchema: 1, storage: {
    read: () => window.localStorage.getItem(KEY),
    write: value => window.localStorage.setItem(KEY, value),
    clear: () => window.localStorage.removeItem(KEY),
  } });
}
