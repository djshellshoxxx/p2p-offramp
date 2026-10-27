/** G09 in-place record schema migration. Pure bundled transforms only; no wallet/RPC/relay authority. */
import { decodeBase64url, encodeBase64url, MAX_PAYLOAD_BYTES, ValidationError, type PrivateRecordV1, type RecordKind } from '../../schemas/index.ts';
import type { Mutation, Result, VaultErrorCode, VaultService, VaultSession, VaultSessionAuthority } from '../../schemas/index.ts';
import type { EncryptedVaultService, ResealReceipt } from './vault-service.ts';

export const MAX_MIGRATION_STEPS = 64;
/** G09 step 4 bound for one G02 commit. Larger plans need the G03 resealer, which does not exist yet. */
export const MAX_IN_PLACE_CHANGES = 256;
const KINDS: readonly RecordKind[] = ['identity', 'preference', 'trade', 'chat', 'journal'];

export interface RecordMigration {
  readonly kind: RecordKind;
  readonly fromVersion: number;
  readonly toVersion: number;
  /** Pure and deterministic; must not perform I/O or retain its input. */
  migrate(payload: Uint8Array): Uint8Array;
}
/** Destination-schema check for one exact kind/version. Returns false for any invalid payload. */
export interface RecordSchema { readonly kind: RecordKind; readonly version: number; validate(payload: Uint8Array): boolean; }
export interface MigrationChange { readonly recordId: string; readonly fromVersion: number; readonly toVersion: number; }
export interface MigrationPlan {
  readonly sourceProfileId: string;
  readonly sourceRevision: number;
  readonly changes: readonly MigrationChange[];
}
/** `verified: false` means the revision committed but readback could not confirm it; unlock and replan. */
export interface MigrationResult { readonly profileId: string; readonly revision: number; readonly verified: boolean; }
export class MigrationError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode) { super('Record migration failed.'); this.name = 'MigrationError'; this.code = code; }
}
const messages: Partial<Record<VaultErrorCode, string>> = {
  UNSUPPORTED_VERSION: 'A record is newer than this client or has no reviewed migration path. Export the encrypted vault instead.',
  INVALID_INPUT: 'A record failed schema validation during migration. The original vault is unchanged.',
  LIMIT_EXCEEDED: 'The migration exceeds the in-place limit. Export before retrying.',
  CONFLICT: 'The vault changed. Unlock again and replan the migration.',
};
function failed(error: unknown): { ok: false; error: { code: VaultErrorCode; retryable: boolean; message: string } } {
  const code: VaultErrorCode = error instanceof MigrationError || error instanceof ValidationError ? error.code : 'STORAGE_UNAVAILABLE';
  return { ok: false, error: { code, retryable: code === 'STORAGE_UNAVAILABLE', message: messages[code] ?? 'Record migration failed.' } };
}
const version = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 65535) throw new MigrationError('INVALID_INPUT');
  return value;
};
const key = (kind: RecordKind, value: number): string => `${kind}:${value}`;

/**
 * Reviewed bundled registry. Construction rejects non-adjacent, duplicate or unvalidated steps, so a
 * registry is acyclic by construction (every step strictly increases the version).
 */
export class MigrationRegistry {
  readonly #steps = new Map<string, RecordMigration>();
  readonly #schemas = new Map<string, RecordSchema>();
  readonly #current: Readonly<Record<RecordKind, number>>;
  constructor(current: Readonly<Record<RecordKind, number>>, schemas: readonly RecordSchema[], migrations: readonly RecordMigration[]) {
    for (const schema of schemas) {
      if (!KINDS.includes(schema.kind) || this.#schemas.has(key(schema.kind, version(schema.version)))) throw new MigrationError('INVALID_INPUT');
      this.#schemas.set(key(schema.kind, schema.version), schema);
    }
    for (const step of migrations) {
      const from = version(step.fromVersion);
      if (!KINDS.includes(step.kind) || version(step.toVersion) !== from + 1 || this.#steps.has(key(step.kind, from)) ||
          !this.#schemas.has(key(step.kind, from)) || !this.#schemas.has(key(step.kind, from + 1))) throw new MigrationError('INVALID_INPUT');
      this.#steps.set(key(step.kind, from), step);
    }
    const copy = {} as Record<RecordKind, number>;
    for (const kind of KINDS) { copy[kind] = version(current[kind]); if (!this.#schemas.has(key(kind, copy[kind]))) throw new MigrationError('INVALID_INPUT'); }
    this.#current = Object.freeze(copy);
  }
  current(kind: RecordKind): number { return this.#current[kind]; }
  /** Returns the target version, or throws UNSUPPORTED_VERSION for future records or missing paths. */
  target(record: PrivateRecordV1): number {
    const target = this.#current[record.kind];
    if (record.schemaVersion > target) throw new MigrationError('UNSUPPORTED_VERSION');
    if (target - record.schemaVersion > MAX_MIGRATION_STEPS) throw new MigrationError('LIMIT_EXCEEDED');
    for (let at = record.schemaVersion; at < target; at++) if (!this.#steps.has(key(record.kind, at))) throw new MigrationError('UNSUPPORTED_VERSION');
    return target;
  }
  /** Runs every step on defensive copies, validating before and after each step. */
  migrate(record: PrivateRecordV1): PrivateRecordV1 {
    const target = this.target(record);
    let payload = decodeBase64url(record.payload, 0, MAX_PAYLOAD_BYTES);
    for (let at = record.schemaVersion; at < target; at++) {
      if (!this.#check(record.kind, at, payload)) throw new MigrationError('INVALID_INPUT');
      let next: unknown;
      try { next = this.#steps.get(key(record.kind, at))!.migrate(new Uint8Array(payload)); } catch { throw new MigrationError('INVALID_INPUT'); }
      if (!(next instanceof Uint8Array) || next.byteLength > MAX_PAYLOAD_BYTES) throw new MigrationError(next instanceof Uint8Array ? 'LIMIT_EXCEEDED' : 'INVALID_INPUT');
      payload = new Uint8Array(next);
    }
    if (!this.#check(record.kind, target, payload)) throw new MigrationError('INVALID_INPUT');
    return { id: record.id, kind: record.kind, schemaVersion: target, payload: encodeBase64url(payload) };
  }
  #check(kind: RecordKind, at: number, payload: Uint8Array): boolean {
    try { return this.#schemas.get(key(kind, at))?.validate(new Uint8Array(payload)) === true; } catch { return false; }
  }
}

type MigrationVault = Pick<VaultService, 'list' | 'commit'> & VaultSessionAuthority & Pick<EncryptedVaultService, 'assertFresh' | 'readPersisted'>;
interface Candidate { readonly plan: MigrationPlan; readonly mutations: readonly Mutation[]; readonly recordCount: number; }

export class RecordMigrationService {
  readonly #vault: MigrationVault;
  readonly #registry: MigrationRegistry;
  constructor(vault: MigrationVault, registry: MigrationRegistry) { this.#vault = vault; this.#registry = registry; }

  /** Builds the complete candidate from one consistent snapshot; any failing record discards everything. */
  async #candidate(session: VaultSession): Promise<Candidate> {
    const lease = this.#vault.captureSession(session, () => undefined);
    if (!lease.ok) throw new MigrationError(lease.error.code);
    try {
      const before = lease.value.current();
      if (!before) throw new MigrationError('LOCKED');
      const listed = await this.#vault.list(before.sessionId);
      if (!listed.ok) throw new MigrationError(listed.error.code);
      const after = lease.value.current();
      if (!after || after.revision !== before.revision) throw new MigrationError('CONFLICT');
      const changes: MigrationChange[] = []; const mutations: Mutation[] = [];
      for (const record of listed.value) {
        const target = this.#registry.target(record);
        if (target === record.schemaVersion) continue;
        if (changes.length >= MAX_IN_PLACE_CHANGES) throw new MigrationError('LIMIT_EXCEEDED');
        mutations.push({ op: 'put', record: this.#registry.migrate(record) });
        changes.push(Object.freeze({ recordId: record.id, fromVersion: record.schemaVersion, toVersion: target }));
      }
      return { plan: Object.freeze({ sourceProfileId: before.profileId, sourceRevision: before.revision, changes: Object.freeze(changes) }), mutations, recordCount: listed.value.length };
    } finally { lease.value.dispose(); }
  }
  async plan(session: VaultSession): Promise<Result<MigrationPlan>> {
    try { return { ok: true, value: (await this.#candidate(session)).plan }; } catch (error) { return failed(error); }
  }
  /** Recomputes the plan instead of trusting the supplied one; G02 CAS rejects concurrent writers. */
  async apply(session: VaultSession, plan: MigrationPlan, signal?: AbortSignal): Promise<Result<MigrationResult>> {
    try {
      if (signal?.aborted) throw new MigrationError('CANCELLED');
      const candidate = await this.#candidate(session);
      if (JSON.stringify(candidate.plan) !== JSON.stringify({ sourceProfileId: plan?.sourceProfileId, sourceRevision: plan?.sourceRevision, changes: plan?.changes })) {
        throw new MigrationError('CONFLICT');
      }
      if (signal?.aborted) throw new MigrationError('CANCELLED');
      if (candidate.mutations.length === 0) {
        // The cached snapshot alone is not a synchronization point (G02 §7): another tab may have advanced
        // persisted storage. Check freshness read-only; an empty migration never writes or bumps revision.
        const fresh = await this.#vault.assertFresh(session.sessionId, signal);
        if (!fresh.ok) throw new MigrationError(fresh.error.code);
        if (fresh.value !== candidate.plan.sourceRevision) throw new MigrationError('CONFLICT');
        return { ok: true, value: { profileId: candidate.plan.sourceProfileId, revision: candidate.plan.sourceRevision, verified: true } };
      }
      const committed = await this.#vault.commit(session.sessionId, candidate.plan.sourceRevision, candidate.mutations, signal);
      if (!committed.ok) throw new MigrationError(committed.error.code);
      // From here the new revision is durable: a later lock, cancel or readback failure must never be
      // reported as a failed migration. Readback only qualifies the result.
      // verified = authenticated decrypt of the persisted row (G09 §4: count + readback), never the cache.
      let verified = false;
      try {
        const persisted = await this.#vault.readPersisted(session.sessionId);
        if (persisted.ok) {
          const expected = new Map(candidate.mutations.map(m => m.op === 'put' ? [m.record.id, m.record] : [m.id, undefined]));
          verified = persisted.value.length === candidate.recordCount &&
            persisted.value.every(record => this.#registry.target(record) === record.schemaVersion &&
              (!expected.has(record.id) || JSON.stringify(expected.get(record.id)) === JSON.stringify(record)));
        }
      } catch { /* durable, unverified */ }
      return { ok: true, value: { profileId: candidate.plan.sourceProfileId, revision: committed.value, verified } };
    } catch (error) { return failed(error); }
  }
}

/** G03 MigrationResealRequest. `migrationId` names a bundled registry; imported code is never accepted. */
export interface MigrationResealRequest {
  readonly sourceSessionId: string;
  readonly expectedKeyId: string;
  readonly expectedRevision: number;
  readonly migrationId: string;
}
/**
 * G03 InternalMigrationResealer: migrates every record into a new fresh-key profile and retains the
 * source. Used when an in-place commit is too large or fresh keys are required. Storage-internal only:
 * not reachable from backup import or the Worker protocol.
 */
export class InternalMigrationResealer {
  readonly #vault: Pick<EncryptedVaultService, 'resealSnapshot'>;
  readonly #registries: ReadonlyMap<string, MigrationRegistry>;
  constructor(vault: Pick<EncryptedVaultService, 'resealSnapshot'>, registries: ReadonlyMap<string, MigrationRegistry>) {
    this.#vault = vault; this.#registries = new Map(registries);
  }
  async migrateAndReseal(request: MigrationResealRequest, destinationPassphrase: string, signal?: AbortSignal): Promise<Result<ResealReceipt>> {
    const registry = typeof request?.migrationId === 'string' ? this.#registries.get(request.migrationId) : undefined;
    if (!registry) return failed(new MigrationError('UNSUPPORTED_VERSION'));
    return this.#vault.resealSnapshot(request.sourceSessionId, request.expectedKeyId, request.expectedRevision,
      records => records.map(record => registry.migrate(record)), destinationPassphrase, signal);
  }
}
