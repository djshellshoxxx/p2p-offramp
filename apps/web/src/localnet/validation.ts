import { MAX_BACKUP_BYTES } from '../../../../packages/schemas/index.ts';
import type { LocalnetCommand } from './protocol.ts';

export class LocalnetFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'LocalnetFailure'; this.code = code; }
}
export function fail(code = 'INVALID_INPUT'): never { throw new LocalnetFailure(code); }
export function fields(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail();
  const keys = Reflect.ownKeys(input);
  if (keys.some(key => typeof key !== 'string' || !required.includes(key) && !optional.includes(key)) || required.some(key => !keys.includes(key))) return fail();
  const output: Record<string, unknown> = {};
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(input, key)!; if (!('value' in descriptor)) return fail(); output[key as string] = descriptor.value; }
  return output;
}
const string = (value: unknown, max: number, pattern?: RegExp): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || pattern && !pattern.test(value)) return fail(); return value;
};
const integer = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return fail(); return value;
};
export function parseLocalnetCommand(input: unknown): LocalnetCommand {
  if (!input || typeof input !== 'object') return fail();
  const type = Object.getOwnPropertyDescriptor(input, 'type')?.value as unknown;
  if (typeof type !== 'string') return fail();
  if (['status', 'profile.lock', 'wallet.connect', 'refresh', 'review.cancel', 'backup.export'].includes(type)) { fields(input, ['type']); return { type } as LocalnetCommand; }
  if (type === 'profile.create' || type === 'profile.unlock') {
    const raw = fields(input, type === 'profile.create' ? ['type', 'passphrase'] : ['type', 'profileId', 'passphrase']);
    const passphrase = string(raw.passphrase, 1024);
    return type === 'profile.create' ? { type, passphrase } : { type, passphrase, profileId: string(raw.profileId, 32, /^[0-9a-f]{32}$/) };
  }
  if (type === 'backup.restore') {
    const raw = fields(input, ['type', 'bytes', 'sourcePassphrase', 'destinationPassphrase']);
    if (!(raw.bytes instanceof Uint8Array) || raw.bytes.length < 1 || raw.bytes.length > MAX_BACKUP_BYTES) return fail();
    return { type, bytes: Uint8Array.from(raw.bytes), sourcePassphrase: string(raw.sourcePassphrase, 1024), destinationPassphrase: string(raw.destinationPassphrase, 1024) };
  }
  if (type === 'ad.publish') {
    const raw = fields(input, ['type', 'assetId', 'amountBaseUnits', 'currency']);
    return { type, assetId: string(raw.assetId, 128), amountBaseUnits: string(raw.amountBaseUnits, 38, /^[1-9][0-9]*$/), currency: string(raw.currency, 3, /^[A-Z]{3}$/) };
  }
  if (type === 'ad.take') return { type, adKey: string(fields(input, ['type', 'adKey']).adKey, 180) };
  if (type === 'session.select') return { type, sessionId: string(fields(input, ['type', 'sessionId']).sessionId, 300) };
  if (type === 'review.confirm') return { type, reviewId: string(fields(input, ['type', 'reviewId']).reviewId, 32, /^[0-9a-f]{32}$/) };
  if (type === 'chat.send') {
    const raw = fields(input, ['type', 'tradeId', 'text']);
    return { type, tradeId: string(raw.tradeId, 64, /^[0-9a-f]{64}$/), text: string(raw.text, 4096) };
  }
  if (type === 'review.prepare') {
    const action = Object.getOwnPropertyDescriptor(input, 'action')?.value as unknown;
    if (action === 'offer') {
      const raw = fields(input, ['type', 'action', 'sessionId', 'fiatMinorUnits', 'fiatScale', 'paymentInstructions'], ['acceptForSeconds', 'escrowForSeconds']);
      return { type, action, sessionId: string(raw.sessionId, 300), fiatMinorUnits: string(raw.fiatMinorUnits, 38, /^[1-9][0-9]*$/),
        fiatScale: integer(raw.fiatScale, 0, 6), paymentInstructions: string(raw.paymentInstructions, 8192),
        ...(raw.acceptForSeconds === undefined ? {} : { acceptForSeconds: integer(raw.acceptForSeconds, 180, 1800) }),
        ...(raw.escrowForSeconds === undefined ? {} : { escrowForSeconds: integer(raw.escrowForSeconds, 2100, 604800) }) };
    }
    if (action === 'accept') return { type, action, sessionId: string(fields(input, ['type', 'action', 'sessionId']).sessionId, 300) };
    if (action === 'approve' || action === 'fund' || action === 'release' || action === 'refund') {
      const raw = fields(input, ['type', 'action', 'tradeId'], ['fiatReceiptConfirmed']);
      if (raw.fiatReceiptConfirmed !== undefined && typeof raw.fiatReceiptConfirmed !== 'boolean') return fail();
      return { type, action, tradeId: string(raw.tradeId, 64, /^[0-9a-f]{64}$/),
        ...(raw.fiatReceiptConfirmed === undefined ? {} : { fiatReceiptConfirmed: raw.fiatReceiptConfirmed as boolean }) };
    }
  }
  return fail('UNSUPPORTED_COMMAND');
}
