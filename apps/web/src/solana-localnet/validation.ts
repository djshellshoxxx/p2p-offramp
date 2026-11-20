import { MAX_BACKUP_BYTES } from '../../../../packages/schemas/index.ts';
import { dataFields } from './config.ts';
import type { SolanaCommand } from './protocol.ts';
export class SolanaUiFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function fail(code = 'INVALID_INPUT'): never { throw new SolanaUiFailure(code); }
export function fields(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  let copy: Record<string, unknown>;
  try { copy = dataFields(input, [...required, ...optional]); } catch { return fail(); }
  if (required.some(key => !Object.hasOwn(copy, key))) return fail();
  return copy;
}
const text = (input: unknown, max: number, pattern?: RegExp): string =>
  typeof input === 'string' && input.length > 0 && input.length <= max && (!pattern || pattern.test(input)) ? input : fail();
const id = (input: unknown) => text(input, 64, /^[0-9a-f]{64}$/);
const typedByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
function backupBytes(input: unknown): Uint8Array {
  if (!(input instanceof Uint8Array)) return fail();
  let length: number;
  try { length = Reflect.apply(typedByteLength, input, []) as number; } catch { return fail(); }
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BACKUP_BYTES) return fail();
  const copy = new Uint8Array(length);
  try { Uint8Array.prototype.set.call(copy, input); } catch { return fail(); }
  return copy;
}
export function parseSolanaCommand(input: unknown): SolanaCommand {
  if (!input || typeof input !== 'object') return fail();
  const type = Object.getOwnPropertyDescriptor(input, 'type')?.value as unknown;
  if (typeof type !== 'string') return fail();
  if (['status', 'profile.lock', 'refresh', 'review.cancel', 'backup.export'].includes(type)) { fields(input, ['type']); return { type } as SolanaCommand; }
  if (type === 'profile.create') return { type, passphrase: text(fields(input, ['type', 'passphrase']).passphrase, 1024) };
  if (type === 'profile.unlock') {
    const raw = fields(input, ['type', 'profileId', 'passphrase']);
    return { type, profileId: text(raw.profileId, 32, /^[0-9a-f]{32}$/), passphrase: text(raw.passphrase, 1024) };
  }
  if (type === 'backup.restore') {
    const raw = fields(input, ['type', 'bytes', 'sourcePassphrase', 'destinationPassphrase']);
    const bytes = backupBytes(raw.bytes);
    return { type, bytes, sourcePassphrase: text(raw.sourcePassphrase, 1024), destinationPassphrase: text(raw.destinationPassphrase, 1024) };
  }
  if (type === 'funding.proposal.import') return { type, text: text(fields(input, ['type', 'text']).text, 4096) };
  if (type === 'recovery.import') {
    const raw = fields(input, ['type', 'text', 'role']);
    if (raw.role !== 'seller' && raw.role !== 'buyer') return fail();
    return { type, text: text(raw.text, 16384), role: raw.role };
  }
  if (type === 'wallet.connect' || type === 'recovery.export') return { type, tradeId: id(fields(input, ['type', 'tradeId']).tradeId) };
  if (type === 'review.confirm') return { type, reviewId: text(fields(input, ['type', 'reviewId']).reviewId, 32, /^[0-9a-f]{32}$/) };
  if (type === 'review.prepare') {
    const raw = fields(input, ['type', 'tradeId', 'action'], ['fiatReceiptConfirmed', 'maxRentTopUpLamports', 'rebuildOf']);
    if (!['release', 'refund', 'payout'].includes(raw.action as string)) return fail('UNSUPPORTED_COMMAND');
    if (raw.fiatReceiptConfirmed !== undefined && typeof raw.fiatReceiptConfirmed !== 'boolean') return fail();
    return { type, tradeId: id(raw.tradeId), action: raw.action as 'release' | 'refund' | 'payout',
      ...(raw.fiatReceiptConfirmed === undefined ? {} : { fiatReceiptConfirmed: raw.fiatReceiptConfirmed as boolean }),
      ...(raw.maxRentTopUpLamports === undefined ? {} : { maxRentTopUpLamports: text(raw.maxRentTopUpLamports, 16, /^(0|[1-9][0-9]{0,15})$/) }),
      ...(raw.rebuildOf === undefined ? {} : { rebuildOf: text(raw.rebuildOf, 64, /^[A-Za-z0-9_-]+$/) }) };
  }
  return fail('UNSUPPORTED_COMMAND');
}
