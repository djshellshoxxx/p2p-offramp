/** Read-only startup API presence. Existing AppRuntime and storage services still perform their own
 * initialization, request/time bounds, storage transactions and fail-closed runtime checks.
 * This does not construct a second worker, open a database, test private mode, request a permission,
 * connect a wallet or contact a network. Optional APIs remain independent and may still be denied.
 */
import { CompatibilityError, REQUIRED_CAPABILITIES, OPTIONAL_CAPABILITIES } from './model.ts';

export type RequiredStartupApi = typeof REQUIRED_CAPABILITIES[number];
export type OptionalStartupApi = typeof OPTIONAL_CAPABILITIES[number];
export type StartupApiState = 'present' | 'missing' | 'unavailable';
export type StorageAccessObservation = 'unverified' | 'available' | 'unavailable';
/** Trusted local reads only. Injection is for composition/tests, never imported data or provider methods. */
export type StartupProbePorts = Readonly<Record<RequiredStartupApi | OptionalStartupApi, () => unknown>>;
export type StartupLimitation = 'api-presence-is-not-device-qualification' | 'worker-execution-not-tested' |
  'file-import-export-not-tested' | 'storage-access-not-tested' | 'storage-may-be-evicted' |
  'private-browsing-may-limit-storage' | 'optional-permissions-not-requested';
export interface StartupCapabilitySnapshot {
  readonly mode: 'read-only' | 'runtime-candidate'; readonly evidence: 'local-api-presence';
  readonly required: Readonly<Record<RequiredStartupApi, StartupApiState>>;
  readonly optional: Readonly<Record<OptionalStartupApi, StartupApiState>>;
  readonly storageAccess: StorageAccessObservation; readonly compatibilityStatus: 'untested';
  readonly limitations: readonly StartupLimitation[]; readonly certified: false; readonly economicActionsAllowed: false;
}
const keys: readonly (RequiredStartupApi | OptionalStartupApi)[] = [...REQUIRED_CAPABILITIES, ...OPTIONAL_CAPABILITIES];
const browserPorts: StartupProbePorts = Object.freeze({
  'secure-context': () => globalThis.isSecureContext === true,
  webcrypto: () => typeof globalThis.crypto?.getRandomValues === 'function' &&
    ['digest', 'importKey', 'deriveKey', 'encrypt', 'decrypt'].every(name => typeof globalThis.crypto?.subtle?.[name as keyof SubtleCrypto] === 'function'),
  // Presence of postMessage/terminate permits the existing runtime to bound an owned local worker.
  // Its actual construction/execution remains untested here and is never represented as device support.
  'bounded-worker': () => typeof globalThis.Worker === 'function' && typeof Worker.prototype.postMessage === 'function' && typeof Worker.prototype.terminate === 'function',
  indexeddb: () => typeof globalThis.indexedDB?.open === 'function',
  'file-import': () => typeof globalThis.File === 'function' && typeof globalThis.Blob?.prototype.arrayBuffer === 'function',
  'file-export': () => typeof globalThis.Blob === 'function' && typeof globalThis.URL?.createObjectURL === 'function' &&
    typeof globalThis.URL?.revokeObjectURL === 'function' && typeof globalThis.HTMLAnchorElement === 'function' && 'download' in HTMLAnchorElement.prototype,
  camera: () => typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function',
  share: () => typeof globalThis.navigator?.share === 'function',
  clipboard: () => typeof globalThis.navigator?.clipboard?.writeText === 'function',
});
function ports(input: unknown): StartupProbePorts {
  try {
    if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new CompatibilityError('INVALID_INPUT');
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key as RequiredStartupApi | OptionalStartupApi))) throw new CompatibilityError('INVALID_INPUT');
    const copy = Object.create(null) as Record<RequiredStartupApi | OptionalStartupApi, () => unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'function') throw new CompatibilityError('INVALID_INPUT');
      copy[key] = descriptor.value as () => unknown;
    }
    return copy;
  } catch { throw new CompatibilityError('INVALID_INPUT'); }
}
function inspect(read: () => unknown): StartupApiState {
  try { const present = read(); return present === true ? 'present' : present === false ? 'missing' : 'unavailable'; }
  catch { return 'unavailable'; }
}
/** Synchronous, bounded local reads. `available` storage may be supplied only by the current trusted
 * runtime after a real operation; it still does not establish persistence across eviction/device loss.
 * A runtime-candidate result permits no action: initialization and all application release gates remain.
 */
export function probeStartupCapabilities(input: StartupProbePorts = browserPorts, storageAccess: StorageAccessObservation = 'unverified'): StartupCapabilitySnapshot {
  if (!['unverified', 'available', 'unavailable'].includes(storageAccess)) throw new CompatibilityError('INVALID_INPUT');
  const observations = ports(input);
  const required = Object.create(null) as Record<RequiredStartupApi, StartupApiState>;
  const optional = Object.create(null) as Record<OptionalStartupApi, StartupApiState>;
  for (const key of REQUIRED_CAPABILITIES) required[key] = inspect(observations[key]);
  for (const key of OPTIONAL_CAPABILITIES) optional[key] = inspect(observations[key]);
  if (storageAccess === 'unavailable') required.indexeddb = 'unavailable';
  const limitations: StartupLimitation[] = ['api-presence-is-not-device-qualification', 'worker-execution-not-tested', 'file-import-export-not-tested'];
  if (storageAccess === 'unverified') limitations.push('storage-access-not-tested');
  limitations.push('storage-may-be-evicted', 'private-browsing-may-limit-storage', 'optional-permissions-not-requested');
  return Object.freeze({ mode: REQUIRED_CAPABILITIES.every(key => required[key] === 'present') ? 'runtime-candidate' : 'read-only',
    evidence: 'local-api-presence', required: Object.freeze(required), optional: Object.freeze(optional), storageAccess,
    compatibilityStatus: 'untested', limitations: Object.freeze(limitations), certified: false, economicActionsAllowed: false });
}
