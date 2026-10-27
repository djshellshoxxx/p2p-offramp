/** Storage-internal G02 operations. UI uses VaultService, never these key handles. */
import {
  decodeBase64url, encodeBase64url, encodePassphrase, encodeSnapshot, decodeSnapshot,
  parsePrivateSnapshot, parseVaultEnvelope, ValidationError,
  MAX_REVISION, MAX_ENCRYPTIONS_PER_HANDLE,
  type PrivateSnapshotV1, type VaultEnvelopeV1,
} from '../../schemas/index.ts';

export interface UnlockedMaterial { readonly profileId: string; readonly keyId: string; }
export type CryptoProvider = Pick<Crypto, 'subtle' | 'getRandomValues'>;
export class VaultCryptoError extends Error {
  readonly code: 'AUTHENTICATION_FAILED' | 'LOCKED' | 'REKEY_REQUIRED' | 'UNSUPPORTED_ENVIRONMENT';
  constructor(code: VaultCryptoError['code']) {
    super(code === 'AUTHENTICATION_FAILED' ? 'Vault authentication failed.' : 'Vault operation unavailable.');
    this.name = 'VaultCryptoError'; this.code = code;
  }
}
interface MaterialState {
  key: CryptoKey; provider: CryptoProvider; envelope: VaultEnvelopeV1; attempts: number;
}
const materials = new WeakMap<UnlockedMaterial, MaterialState>();
const utf8 = new TextEncoder();
function owned(bytes: Uint8Array, secrets?: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes);
  secrets?.push(copy);
  return copy;
}
function requireProvider(provider: CryptoProvider): void {
  try {
    if (!provider || typeof provider.getRandomValues !== 'function' || !provider.subtle ||
        ['importKey', 'deriveKey', 'encrypt', 'decrypt'].some(name =>
          typeof Reflect.get(provider.subtle, name) !== 'function')) throw new Error();
  } catch { throw new VaultCryptoError('UNSUPPORTED_ENVIRONMENT'); }
}
function unsupported(error: unknown): boolean {
  try { return error instanceof DOMException && error.name === 'NotSupportedError'; }
  catch { return false; }
}
const aad = (values: readonly unknown[]): Uint8Array<ArrayBuffer> => utf8.encode(JSON.stringify(values));
function wrapAAD(envelope: VaultEnvelopeV1): Uint8Array<ArrayBuffer> {
  return aad(['p2p-offramp', 'vault-key', 1, envelope.profileId, envelope.keyId,
    'PBKDF2-SHA256', 600000, envelope.wrappedKey.salt]);
}
function snapshotAAD(snapshot: Pick<PrivateSnapshotV1, 'profileId' | 'keyId' | 'revision'>): Uint8Array<ArrayBuffer> {
  return aad(['p2p-offramp', 'vault-snapshot', 1, snapshot.profileId, snapshot.keyId, snapshot.revision]);
}
function random(provider: CryptoProvider, length: number): Uint8Array<ArrayBuffer> {
  try { return provider.getRandomValues(new Uint8Array(length)); }
  catch { throw new VaultCryptoError('UNSUPPORTED_ENVIRONMENT'); }
}
async function kek(provider: CryptoProvider, passphrase: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const passwordCopy = owned(passphrase);
  try {
    const source = await provider.subtle.importKey('raw', passwordCopy, 'PBKDF2', false, ['deriveKey']);
    return await provider.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: owned(salt), iterations: 600000 },
      source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { passwordCopy.fill(0); }
}
function material(envelope: VaultEnvelopeV1, key: CryptoKey, provider: CryptoProvider, attempts: number): UnlockedMaterial {
  const handle = Object.freeze({ profileId: envelope.profileId, keyId: envelope.keyId });
  materials.set(handle, { key, provider, envelope: parseVaultEnvelope(envelope), attempts });
  return handle;
}
export function disposeMaterial(handle: UnlockedMaterial): void { materials.delete(handle); }

/** The service creates random IDs first; this helper seals that validated revision-zero snapshot. */
export async function createEnvelope(input: PrivateSnapshotV1, passphrase: string,
  provider: CryptoProvider = globalThis.crypto): Promise<{envelope: VaultEnvelopeV1; material: UnlockedMaterial}> {
  const snapshot = parsePrivateSnapshot(input);
  if (snapshot.revision !== 0) throw new ValidationError();
  requireProvider(provider);
  const password = encodePassphrase(passphrase);
  const secrets: Uint8Array[] = [];
  let rawKey: Uint8Array | undefined, plain: Uint8Array | undefined;
  try {
    rawKey = random(provider, 32);
    const salt = random(provider, 32), wrapNonce = random(provider, 12), snapshotNonce = random(provider, 12);
    const wrappingKey = await kek(provider, password, salt);
    const key = await provider.subtle.importKey('raw', owned(rawKey, secrets), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const envelope: VaultEnvelopeV1 = {
      format: 'p2p-offramp-vault', version: 1, profileId: snapshot.profileId, keyId: snapshot.keyId, revision: 0,
      wrappedKey: { kdf: 'PBKDF2-SHA256', iterations: 600000, salt: encodeBase64url(salt),
        cipher: 'AES-256-GCM', nonce: encodeBase64url(wrapNonce), ciphertext: '' },
      snapshot: { nonce: encodeBase64url(snapshotNonce), ciphertext: '' },
    };
    const wrapped = await provider.subtle.encrypt({ name: 'AES-GCM', iv: wrapNonce, additionalData: wrapAAD(envelope), tagLength: 128 },
      wrappingKey, owned(rawKey, secrets));
    envelope.wrappedKey.ciphertext = encodeBase64url(new Uint8Array(wrapped));
    plain = encodeSnapshot(snapshot);
    const encrypted = await provider.subtle.encrypt({ name: 'AES-GCM', iv: snapshotNonce,
      additionalData: snapshotAAD(snapshot), tagLength: 128 }, key, owned(plain, secrets));
    envelope.snapshot.ciphertext = encodeBase64url(new Uint8Array(encrypted));
    return { envelope, material: material(envelope, key, provider, 1) };
  } catch {
    throw new VaultCryptoError('UNSUPPORTED_ENVIRONMENT');
  } finally { password.fill(0); rawKey?.fill(0); plain?.fill(0); secrets.forEach(copy => copy.fill(0)); }
}
export async function openEnvelope(input: unknown, passphrase: string,
  provider: CryptoProvider = globalThis.crypto): Promise<{snapshot: PrivateSnapshotV1; material: UnlockedMaterial}> {
  // All public bounds/profile checks happen before any expensive derivation.
  const envelope = parseVaultEnvelope(input);
  requireProvider(provider);
  const password = encodePassphrase(passphrase), secrets: Uint8Array[] = [];
  let rawKey: Uint8Array | undefined, plain: Uint8Array | undefined;
  try {
    const wrappingKey = await kek(provider, password, decodeBase64url(envelope.wrappedKey.salt, 32, 32));
    rawKey = new Uint8Array(await provider.subtle.decrypt({ name: 'AES-GCM',
      iv: owned(decodeBase64url(envelope.wrappedKey.nonce, 12, 12)), additionalData: wrapAAD(envelope), tagLength: 128 },
      wrappingKey, owned(decodeBase64url(envelope.wrappedKey.ciphertext, 48, 48))));
    if (rawKey.length !== 32) throw new Error();
    const key = await provider.subtle.importKey('raw', owned(rawKey, secrets), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    plain = new Uint8Array(await provider.subtle.decrypt({ name: 'AES-GCM',
      iv: owned(decodeBase64url(envelope.snapshot.nonce, 12, 12)), additionalData: snapshotAAD(envelope), tagLength: 128 },
      key, owned(decodeBase64url(envelope.snapshot.ciphertext, 4112, 8_388_624))));
    const snapshot = decodeSnapshot(plain);
    if (snapshot.profileId !== envelope.profileId || snapshot.keyId !== envelope.keyId || snapshot.revision !== envelope.revision) {
      throw new Error();
    }
    return { snapshot, material: material(envelope, key, provider, 0) };
  } catch (error) {
    throw new VaultCryptoError(unsupported(error) ? 'UNSUPPORTED_ENVIRONMENT' : 'AUTHENTICATION_FAILED');
  } finally { password.fill(0); rawKey?.fill(0); plain?.fill(0); secrets.forEach(copy => copy.fill(0)); }
}
/**
 * Authenticated decrypt of a persisted envelope with an already unlocked session key (no KDF). The envelope
 * must belong to this exact profile/key; AAD binds profile, key and revision. Used for readback only.
 */
export async function decryptRevision(handle: UnlockedMaterial, input: unknown): Promise<PrivateSnapshotV1> {
  const state = materials.get(handle);
  if (!state) throw new VaultCryptoError('LOCKED');
  const envelope = parseVaultEnvelope(input);
  if (envelope.profileId !== handle.profileId || envelope.keyId !== handle.keyId ||
      JSON.stringify(envelope.wrappedKey) !== JSON.stringify(state.envelope.wrappedKey)) throw new VaultCryptoError('AUTHENTICATION_FAILED');
  let plain: Uint8Array | undefined;
  try {
    plain = new Uint8Array(await state.provider.subtle.decrypt({ name: 'AES-GCM',
      iv: owned(decodeBase64url(envelope.snapshot.nonce, 12, 12)), additionalData: snapshotAAD(envelope), tagLength: 128 },
      state.key, owned(decodeBase64url(envelope.snapshot.ciphertext, 4112, 8_388_624))));
    const snapshot = decodeSnapshot(plain);
    if (snapshot.profileId !== envelope.profileId || snapshot.keyId !== envelope.keyId || snapshot.revision !== envelope.revision) throw new Error();
    return snapshot;
  } catch (error) {
    throw new VaultCryptoError(unsupported(error) ? 'UNSUPPORTED_ENVIRONMENT' : 'AUTHENTICATION_FAILED');
  } finally { plain?.fill(0); }
}
/** G02 session/store owns durable expectedRevision CAS; encryption does not publish a commit. */
export async function encryptRevision(handle: UnlockedMaterial, input: PrivateSnapshotV1,
  expectedRevision: number): Promise<VaultEnvelopeV1> {
  const state = materials.get(handle);
  if (!state) throw new VaultCryptoError('LOCKED');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < state.envelope.revision) throw new ValidationError();
  if (expectedRevision >= MAX_REVISION || state.attempts >= MAX_ENCRYPTIONS_PER_HANDLE) throw new VaultCryptoError('REKEY_REQUIRED');
  const snapshot = parsePrivateSnapshot(input);
  if (snapshot.revision !== expectedRevision + 1 || snapshot.profileId !== handle.profileId || snapshot.keyId !== handle.keyId) {
    throw new ValidationError();
  }
  let plain: Uint8Array | undefined;
  const secrets: Uint8Array[] = [];
  let result: VaultEnvelopeV1;
  try {
    const nonce = random(state.provider, 12);
    plain = encodeSnapshot(snapshot);
    // Count every attempted encryption, even if it fails or never wins an IDB CAS.
    state.attempts++;
    const ciphertext = await state.provider.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
      additionalData: snapshotAAD(snapshot), tagLength: 128 }, state.key, owned(plain, secrets));
    result = { ...state.envelope, revision: snapshot.revision, wrappedKey: { ...state.envelope.wrappedKey },
      snapshot: { nonce: encodeBase64url(nonce), ciphertext: encodeBase64url(new Uint8Array(ciphertext)) } };
  } catch {
    throw new VaultCryptoError('UNSUPPORTED_ENVIRONMENT');
  } finally { plain?.fill(0); secrets.forEach(copy => copy.fill(0)); }
  if (materials.get(handle) !== state) throw new VaultCryptoError('LOCKED');
  return result;
}
