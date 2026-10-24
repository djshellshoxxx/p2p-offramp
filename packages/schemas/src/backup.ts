/** G03 portable encrypted backup. A checksum detects transport corruption, never authenticity or freshness. */
import { parseVaultEnvelope, ValidationError, type VaultEnvelopeV1 } from './vault.ts';
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;
export interface BackupV1 { format: 'p2p-offramp-backup'; version: 1; envelope: VaultEnvelopeV1; checksum: string; }
export interface RestoreReceipt { sourceProfileId: string; newProfileId: string; newKeyId: string; revision: 0; records: number; }

/** Only G03's object/string/integer JSON domain is permitted; duplicate decoded keys never survive parsing. */
class BackupJsonParser {
  private index = 0;
  private objects = 0;
  private readonly source: string;
  constructor(source: string) { this.source = source; }
  private fail(): never { throw new ValidationError(); }
  private whitespace(): void { while (/[\t\n\r ]/.test(this.source[this.index] ?? 'x')) this.index++; }
  private string(): string {
    const start = this.index++;
    for (;;) {
      const character = this.source[this.index++];
      if (character === undefined) return this.fail();
      if (character === '\\') { if (this.source[this.index++] === undefined) return this.fail(); }
      else if (character === '"') {
        try { return JSON.parse(this.source.slice(start, this.index)) as string; } catch { return this.fail(); }
      }
    }
  }
  private value(depth: number): unknown {
    if (depth > 8) return this.fail();
    this.whitespace();
    const character = this.source[this.index];
    if (character === '"') return this.string();
    if (character === '{') {
      // Exact v1 wire data has four objects; reject amplification before allocating extra nodes.
      if (++this.objects > 4) return this.fail();
      this.index++; this.whitespace();
      const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      let count = 0;
      if (this.source[this.index] === '}') { this.index++; return value; }
      for (;;) {
        this.whitespace(); if (this.source[this.index] !== '"') return this.fail();
        const key = this.string();
        if (++count > 64 || Object.hasOwn(value, key) || key === '__proto__' || key === 'constructor' || key === 'prototype') return this.fail();
        this.whitespace(); if (this.source[this.index++] !== ':') return this.fail();
        value[key] = this.value(depth + 1); this.whitespace();
        const separator = this.source[this.index++];
        if (separator === '}') return value;
        if (separator !== ',') return this.fail();
      }
    }
    const start = this.index;
    while (/[0-9]/.test(this.source[this.index] ?? 'x')) this.index++;
    const encoded = this.source.slice(start, this.index);
    if (!/^(0|[1-9][0-9]{0,15})$/.test(encoded) || !Number.isSafeInteger(Number(encoded))) return this.fail();
    return Number(encoded);
  }
  parse(): unknown {
    const value = this.value(0); this.whitespace();
    if (this.index !== this.source.length) return this.fail();
    return value;
  }
}
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ValidationError();
    const proto: unknown = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) throw new ValidationError();
    const actual = Reflect.ownKeys(input);
    if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) throw new ValidationError();
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) throw new ValidationError();
      output[key] = descriptor.value;
    }
    return output;
  } catch { throw new ValidationError(); }
}
export function parseBackup(input: unknown): BackupV1 {
  const value = exact(input, ['format', 'version', 'envelope', 'checksum']);
  if (value.format !== 'p2p-offramp-backup') throw new ValidationError();
  if (value.version !== 1) throw new ValidationError('UNSUPPORTED_VERSION');
  if (typeof value.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(value.checksum)) throw new ValidationError();
  return { format: 'p2p-offramp-backup', version: 1, envelope: parseVaultEnvelope(value.envelope), checksum: value.checksum };
}
export function canonicalEnvelopeBytes(input: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(parseVaultEnvelope(input)));
}
export function parseBackupBytes(input: Uint8Array): BackupV1 {
  let owned: Uint8Array<ArrayBuffer>;
  try {
    if (!(input instanceof Uint8Array) || !ArrayBuffer.isView(input)) throw new ValidationError();
    const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype) as object, 'byteLength')!.get!;
    const length = Reflect.apply(getter, input, []) as number;
    if (length > MAX_BACKUP_BYTES) throw new ValidationError('LIMIT_EXCEEDED');
    owned = new Uint8Array(length); Reflect.apply(Uint8Array.prototype.set, owned, [input]);
  } catch (error) { if (error instanceof ValidationError) throw error; throw new ValidationError(); }
  let parsed: unknown;
  try { parsed = new BackupJsonParser(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(owned)).parse(); }
  catch { throw new ValidationError(); }
  return parseBackup(parsed);
}
export function encodeBackup(input: BackupV1): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(parseBackup(input)));
  if (bytes.byteLength > MAX_BACKUP_BYTES) throw new ValidationError('LIMIT_EXCEEDED');
  return bytes;
}
