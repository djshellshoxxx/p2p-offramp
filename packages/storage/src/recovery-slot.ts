/**
 * G03 §4.7: at most one recovery job runs per loaded document module, across independently constructed
 * services. Backup export/restore and the storage-internal migration reseal share this slot. A cancelled
 * Web Crypto job keeps it until its actual work settles; cancellation cannot stop the native primitive.
 */
let holder: object | undefined;

/** Returns the release function, or undefined when another recovery job holds the slot. */
export function claimRecoverySlot(): (() => void) | undefined {
  if (holder !== undefined) return undefined;
  const token = {}; holder = token;
  return () => { if (holder === token) holder = undefined; };
}
