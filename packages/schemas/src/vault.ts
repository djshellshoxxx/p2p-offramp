/** G02 wire format. Validation grants no claim that ciphertext is authentic. */
export const MAX_REVISION = 1_048_575;
export const MAX_RECORDS = 10_000;
export const MAX_PAYLOAD_BYTES = 262_144;
export const MAX_SNAPSHOT_BYTES = 8_388_608;
export const MAX_SNAPSHOT_JSON_BYTES = MAX_SNAPSHOT_BYTES - 4;
export const SNAPSHOT_BLOCK_BYTES = 4096;
export const MAX_ENCRYPTIONS_PER_HANDLE = 4096;

export type RecordKind = 'identity' | 'preference' | 'trade' | 'chat' | 'journal';
export interface WrappedKeyV1 {
  kdf: 'PBKDF2-SHA256'; iterations: 600000; salt: string;
  cipher: 'AES-256-GCM'; nonce: string; ciphertext: string;
}
export interface VaultEnvelopeV1 {
  format: 'p2p-offramp-vault'; version: 1; profileId: string; keyId: string; revision: number;
  wrappedKey: WrappedKeyV1;
  snapshot: { nonce: string; ciphertext: string };
}
export interface PrivateRecordV1 { id: string; kind: RecordKind; schemaVersion: number; payload: string; }
export interface PrivateSnapshotV1 {
  format: 'p2p-offramp-private-records'; version: 1;
  profileId: string; keyId: string; revision: number; records: PrivateRecordV1[];
}
export type ValidationCode = 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'LIMIT_EXCEEDED';
export class ValidationError extends Error {
  readonly code: ValidationCode;
  constructor(code: ValidationCode = 'INVALID_INPUT') {
    super('Invalid vault data.');
    this.name = 'ValidationError';
    this.code = code;
  }
}
function fail(code: ValidationCode = 'INVALID_INPUT'): never { throw new ValidationError(code); }
function reflect<T>(operation: () => T): T {
  try { return operation(); } catch { fail(); }
}

/** Read only own data properties; never invoke user-provided getters. */
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || reflect(() => Array.isArray(input))) fail();
  const proto: unknown = reflect(() => Object.getPrototypeOf(input));
  if (proto !== Object.prototype && proto !== null) fail();
  const actual = reflect(() => Reflect.ownKeys(input));
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) fail();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = reflect(() => Object.getOwnPropertyDescriptor(input, key));
    if (!descriptor || !('value' in descriptor)) fail();
    out[key] = descriptor.value;
  }
  return out;
}
function integer(input: unknown, minimum: number, maximum: number): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < minimum || input > maximum) fail();
  return input;
}
function id(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{32}$/.test(input)) fail();
  return input;
}
function version(input: unknown): 1 {
  if (input !== 1) fail('UNSUPPORTED_VERSION');
  return 1;
}
function literal<T extends string>(input: unknown, expected: T): T {
  if (input !== expected) fail();
  return expected;
}
export function encodeBase64url(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) fail();
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeBase64url(input: unknown, minimum: number, maximum: number): Uint8Array {
  integer(minimum, 0, MAX_SNAPSHOT_BYTES + 16);
  integer(maximum, minimum, MAX_SNAPSHOT_BYTES + 16);
  if (typeof input !== 'string') fail();
  // Bound the encoded representation before regex, decoding or allocation.
  if (input.length > Math.ceil(maximum * 4 / 3)) fail('LIMIT_EXCEEDED');
  if (!/^[A-Za-z0-9_-]*$/.test(input) || input.length % 4 === 1) fail();
  let binary: string;
  try { binary = atob(input.replaceAll('-', '+').replaceAll('_', '/')); } catch { fail(); }
  if (binary.length > maximum) fail('LIMIT_EXCEEDED');
  if (binary.length < minimum) fail();
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (encodeBase64url(bytes) !== input) fail(); // Includes nonzero unused trailing bits.
  return bytes;
}
function base64(input: unknown, minimum: number, maximum: number): string {
  decodeBase64url(input, minimum, maximum);
  return input as string;
}
export function parseVaultEnvelope(input: unknown): VaultEnvelopeV1 {
  const value = object(input, ['format', 'version', 'profileId', 'keyId', 'revision', 'wrappedKey', 'snapshot']);
  const format = literal(value.format, 'p2p-offramp-vault');
  const v = version(value.version);
  const profileId = id(value.profileId), keyId = id(value.keyId);
  const revision = integer(value.revision, 0, MAX_REVISION);
  const key = object(value.wrappedKey, ['kdf', 'iterations', 'salt', 'cipher', 'nonce', 'ciphertext']);
  const wrappedKey: WrappedKeyV1 = {
    kdf: literal(key.kdf, 'PBKDF2-SHA256'),
    iterations: integer(key.iterations, 600000, 600000) as 600000,
    salt: base64(key.salt, 32, 32), cipher: literal(key.cipher, 'AES-256-GCM'),
    nonce: base64(key.nonce, 12, 12), ciphertext: base64(key.ciphertext, 48, 48),
  };
  const snapshot = object(value.snapshot, ['nonce', 'ciphertext']);
  const nonce = base64(snapshot.nonce, 12, 12);
  const ciphertext = decodeBase64url(snapshot.ciphertext, 4112, MAX_SNAPSHOT_BYTES + 16);
  if ((ciphertext.length - 16) % SNAPSHOT_BLOCK_BYTES !== 0) fail();
  return { format, version: v, profileId, keyId, revision, wrappedKey,
    snapshot: { nonce, ciphertext: snapshot.ciphertext as string } };
}
function recordArray(input: unknown): unknown[] {
  if (!reflect(() => Array.isArray(input)) || reflect(() => Object.getPrototypeOf(input)) !== Array.prototype) fail();
  const lengthProperty = reflect(() => Object.getOwnPropertyDescriptor(input, 'length'));
  if (!lengthProperty || !('value' in lengthProperty)) fail();
  const length: unknown = lengthProperty.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) fail();
  if (length > MAX_RECORDS) fail('LIMIT_EXCEEDED');
  const keys = reflect(() => Reflect.ownKeys(input as object));
  if (keys.length !== length + 1 || keys.some(key => typeof key !== 'string')) fail();
  const records: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = reflect(() => Object.getOwnPropertyDescriptor(input, String(index)));
    if (!descriptor || !('value' in descriptor)) fail();
    records.push(descriptor.value);
  }
  return records;
}
export function parsePrivateSnapshot(input: unknown): PrivateSnapshotV1 {
  const value = object(input, ['format', 'version', 'profileId', 'keyId', 'revision', 'records']);
  const header = {
    format: literal(value.format, 'p2p-offramp-private-records'), version: version(value.version),
    profileId: id(value.profileId), keyId: id(value.keyId), revision: integer(value.revision, 0, MAX_REVISION),
  };
  const records: PrivateRecordV1[] = [];
  // All permitted values serialize as ASCII without escaping. Bound the aggregate
  // size incrementally, before constructing a potentially enormous JSON string.
  let jsonBytes = JSON.stringify({ ...header, records: [] }).length;
  let previousId = '';
  for (const raw of recordArray(value.records)) {
    const item = object(raw, ['id', 'kind', 'schemaVersion', 'payload']);
    const recordId = id(item.id);
    if (recordId <= previousId) fail();
    const kind = item.kind;
    if (kind !== 'identity' && kind !== 'preference' && kind !== 'trade' && kind !== 'chat' && kind !== 'journal') fail();
    const schemaVersion = integer(item.schemaVersion, 1, 65535);
    if (typeof item.payload !== 'string') fail();
    jsonBytes += JSON.stringify({ id: recordId, kind, schemaVersion, payload: '' }).length + item.payload.length + (records.length ? 1 : 0);
    if (jsonBytes > MAX_SNAPSHOT_JSON_BYTES) fail('LIMIT_EXCEEDED');
    const payload = base64(item.payload, 0, MAX_PAYLOAD_BYTES);
    records.push({ id: recordId, kind, schemaVersion, payload });
    previousId = recordId;
  }
  return { ...header, records };
}
export function encodeSnapshot(input: PrivateSnapshotV1): Uint8Array {
  const snapshot = parsePrivateSnapshot(input);
  const json = new TextEncoder().encode(JSON.stringify(snapshot));
  if (json.length > MAX_SNAPSHOT_JSON_BYTES) fail('LIMIT_EXCEEDED');
  const size = Math.ceil((json.length + 4) / SNAPSHOT_BLOCK_BYTES) * SNAPSHOT_BLOCK_BYTES;
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, json.length, false);
  bytes.set(json, 4);
  return bytes;
}
export function decodeSnapshot(bytes: Uint8Array): PrivateSnapshotV1 {
  if (!(bytes instanceof Uint8Array) || bytes.length < SNAPSHOT_BLOCK_BYTES ||
      bytes.length > MAX_SNAPSHOT_BYTES || bytes.length % SNAPSHOT_BLOCK_BYTES !== 0) fail();
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  if (length > MAX_SNAPSHOT_JSON_BYTES || length > bytes.length - 4 || length === 0) fail();
  for (let index = length + 4; index < bytes.length; index++) if (bytes[index] !== 0) fail();
  let text: string, parsed: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(4, 4 + length));
    parsed = JSON.parse(text);
  } catch { fail(); }
  const snapshot = parsePrivateSnapshot(parsed);
  // Generated-v1 snapshots use exactly this serialization; reject duplicate JSON
  // keys, alternate ordering/whitespace and other ambiguous producer formats.
  if (JSON.stringify(snapshot) !== text) fail();
  return snapshot;
}
export function encodePassphrase(input: unknown): Uint8Array {
  if (typeof input !== 'string' || input.length > 1024) fail();
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
    } else if (code >= 0xdc00 && code <= 0xdfff) fail();
  }
  const bytes = new TextEncoder().encode(input);
  if (bytes.length < 12 || bytes.length > 1024) fail();
  return bytes;
}
