/** Trusted Bootstrap composition only. API presence may refuse initialization; it never grants wallet,
 * device or storage qualification. The existing runtime still owns actual construction and service checks. */
import { runtimeFailure, type RuntimeResult } from '../../../../packages/schemas/index.ts';
import type { StartupCapabilitySnapshot } from './probe.ts';

export async function startWithRequiredApis<T>(snapshot: StartupCapabilitySnapshot,
  initialize: () => Promise<RuntimeResult<T>>): Promise<RuntimeResult<T>> {
  if (snapshot.mode === 'read-only') return runtimeFailure('UNSUPPORTED_ENVIRONMENT');
  return initialize();
}
