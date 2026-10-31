/** Small live-proof bridge. Only the trusted verifier registers successful values;
 * this is not a sandbox against other same-origin executable code. Imported data
 * cannot register a callback. The writer is deliberately absent from the facade.
 * No manifest bytes, public keys, signatures or asset buffers are retained here.
 */
import type { ReleaseResult } from './release-manifest.ts';

const checks = new WeakMap<object, () => ReleaseResult>();
const refused = (): ReleaseResult => Object.freeze({ ok: false, error: Object.freeze({ code: 'MANIFEST_UNSUPPORTED' }) });

/** Internal trusted-writer capability: register once, never replace a proof lease. */
export function registerReleaseProof(value: object, check: () => ReleaseResult): void {
  if (checks.has(value)) throw new TypeError('Release proof already registered.');
  checks.set(value, check);
}

/** Recheck original verifier lifetime/clock. A clone or JSON projection has no lease. */
export function revalidateRelease(value: unknown): ReleaseResult {
  if (typeof value !== 'object' || value === null) return refused();
  const check = checks.get(value);
  if (!check) return refused();
  try { return check(); } catch { return refused(); }
}
