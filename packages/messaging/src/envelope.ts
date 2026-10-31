/** G20 text application envelope. Parsing grants no sender authentication or economic authority. */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { intentData, parseTradeBinding, sameBinding, type CoreErrorCode, type CoreResult, type TradeBinding } from '../../schemas/index.ts';
import { parseEventJson } from '../../nostr-crypto/index.ts';

export const MESSAGE_FORMAT = 'p2p-offramp-message';
export const MAX_TEXT_BYTES = 16_384;
export const MAX_MESSAGE_BYTES = 24_576;
export interface TextMessageV1 {
  readonly format: typeof MESSAGE_FORMAT; readonly version: 1; readonly binding: TradeBinding; readonly termsHash: string;
  readonly messageId: string; readonly sender: string; readonly recipient: string; readonly kind: 'text';
  /** Sender claim, not receipt chronology or chain time. */
  readonly createdAt: number; readonly body: string;
}
export interface MessageExpectation { readonly binding: TradeBinding; readonly sender: string; readonly recipient: string; }
const codes = new WeakMap<object, CoreErrorCode>();
export function stop(code: CoreErrorCode): never { const error = new Error('Messaging operation unavailable.'); codes.set(error, code); throw error; }
export function errorCode(error: unknown): CoreErrorCode { return typeof error === 'object' && error !== null ? codes.get(error) ?? 'INVALID_INPUT' : 'INVALID_INPUT'; }
export function failure<T = never>(code: CoreErrorCode): CoreResult<T> { return Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) }); }
const key = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : stop('INVALID_INPUT');
export function copyBytes(input: unknown, maximum: number, minimum = 1): Uint8Array<ArrayBuffer> {
  try {
    if (!(input instanceof Uint8Array)) return stop('INVALID_INPUT');
    const length = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!.call(input) as number;
    if (length > maximum) return stop('LIMIT_EXCEEDED');
    if (length < minimum) return stop('INVALID_INPUT');
    const copy = new Uint8Array(length); Uint8Array.prototype.set.call(copy, input); return copy;
  } catch (error) { return stop(errorCode(error)); }
}
/** Detached exact-key object; the field order below is the documented deterministic UTF-8 JSON encoding. */
export function parseTextMessage(input: unknown): TextMessageV1 {
  const raw = intentData(input, ['format', 'version', 'binding', 'termsHash', 'messageId', 'sender', 'recipient', 'kind', 'createdAt', 'body']);
  if (raw.format !== MESSAGE_FORMAT) return stop('INVALID_INPUT');
  if (raw.version !== 1) return stop('UNSUPPORTED_VERSION');
  if (raw.kind === 'terms' || raw.kind === 'receipt-status') return stop('UNSUPPORTED_PROVIDER');
  if (raw.kind !== 'text') return stop('INVALID_INPUT');
  const binding = parseTradeBinding(raw.binding), termsHash = key(raw.termsHash), sender = key(raw.sender), recipient = key(raw.recipient);
  if (binding.tradeId !== termsHash || sender === recipient || typeof raw.messageId !== 'string' || !/^[0-9a-f]{32}$/.test(raw.messageId) ||
      typeof raw.createdAt !== 'number' || !Number.isSafeInteger(raw.createdAt) || raw.createdAt < 0 || typeof raw.body !== 'string' || !raw.body.length) return stop('INVALID_INPUT');
  // UTF-8 cannot be shorter than this UTF-16 unit count; bound allocation before encoding foreign strings.
  if (raw.body.length > MAX_TEXT_BYTES) return stop('LIMIT_EXCEEDED');
  const bodyBytes = new TextEncoder().encode(raw.body);
  try {
    if (bodyBytes.length > MAX_TEXT_BYTES) return stop('LIMIT_EXCEEDED');
    if (new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes) !== raw.body) return stop('INVALID_INPUT');
  } finally { bodyBytes.fill(0); }
  return Object.freeze({ format: MESSAGE_FORMAT, version: 1, binding, termsHash, messageId: raw.messageId, sender, recipient,
    kind: 'text', createdAt: raw.createdAt, body: raw.body });
}
export function messageBytes(input: TextMessageV1): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  if (bytes.length > MAX_MESSAGE_BYTES) { bytes.fill(0); return stop('LIMIT_EXCEEDED'); } return bytes;
}
export function encodeMessage(input: unknown): CoreResult<Uint8Array<ArrayBuffer>> {
  try { return { ok: true, value: messageBytes(parseTextMessage(input)) }; } catch (error) { return failure(errorCode(error)); }
}
export function decodeMessage(input: unknown, expected?: MessageExpectation): CoreResult<TextMessageV1> {
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    bytes = copyBytes(input, MAX_MESSAGE_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const message = parseTextMessage(parseEventJson(text, MAX_MESSAGE_BYTES, 3));
    if (expected !== undefined) {
      const raw = intentData(expected, ['binding', 'sender', 'recipient']);
      if (!sameBinding(message.binding, parseTradeBinding(raw.binding)) || message.sender !== key(raw.sender) || message.recipient !== key(raw.recipient)) return failure('UNAUTHORIZED');
    }
    return { ok: true, value: message };
  } catch (error) { return failure(errorCode(error)); } finally { bytes?.fill(0); }
}
