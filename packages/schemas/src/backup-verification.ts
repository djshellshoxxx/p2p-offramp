/** Scalar receipt only. Imported receipt JSON never establishes a Worker-owned verification fact. */
import { MAX_REVISION, ValidationError } from './vault.ts';
export interface BackupVerificationReceipt {
  readonly profileId: string; readonly revision: number; readonly scope: 'complete-profile-v1';
  readonly envelopeSha256: string; readonly backupSha256: string;
}
/** Rechecked by the Worker against its live session and committed row; not a persisted readiness flag. */
export interface RuntimeBackupVerification { readonly verification: BackupVerificationReceipt | null; }
export function parseBackupVerificationReceipt(input: unknown): BackupVerificationReceipt {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ValidationError();
    const proto: unknown = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) throw new ValidationError();
    const keys = ['profileId', 'revision', 'scope', 'envelopeSha256', 'backupSha256'];
    if (Reflect.ownKeys(input).length !== keys.length) throw new ValidationError();
    const data: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) throw new ValidationError();
      data[key] = descriptor.value;
    }
    if (typeof data.profileId !== 'string' || !/^[0-9a-f]{32}$/.test(data.profileId) ||
        typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision > MAX_REVISION ||
        data.scope !== 'complete-profile-v1' || typeof data.envelopeSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(data.envelopeSha256) ||
        typeof data.backupSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(data.backupSha256)) throw new ValidationError();
    return Object.freeze({profileId:data.profileId,revision:data.revision,scope:data.scope,envelopeSha256:data.envelopeSha256,backupSha256:data.backupSha256});
  } catch { throw new ValidationError(); }
}
