/** Selected broker policy only. These scalars issue no routing evidence, endpoint consent or drain receipt. */
import type { AppTransportChannel, TransportMode } from './transport.ts';

export const MAX_TRANSPORT_SELECTION_GENERATION = Number.MAX_SAFE_INTEGER - 1;
const CHANNELS: readonly AppTransportChannel[] = Object.freeze(['rpc', 'relay', 'map', 'proof', 'update']);

export interface RuntimeTransportSelection {
  readonly version: 1;
  readonly mode: TransportMode;
  readonly brokerGeneration: number;
  readonly brokeredChannels: readonly AppTransportChannel[];
}
export interface RuntimeSelectTransportMode {
  readonly mode: TransportMode;
  readonly expectedBrokerGeneration: number;
  readonly ordinaryConsent: boolean;
}
export class TransportSelectionValidationError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor() { super('Invalid transport selection.'); this.name = 'TransportSelectionValidationError'; }
}
function fail(): never { throw new TransportSelectionValidationError(); }
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) return fail();
      output[key] = descriptor.value;
    }
    return output;
  } catch { return fail(); }
}
function generation(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < 0 || input > MAX_TRANSPORT_SELECTION_GENERATION) return fail();
  return input;
}
function mode(input: unknown): TransportMode {
  return input === 'ordinary' || input === 'strict' ? input : fail();
}
function channels(input: unknown): readonly AppTransportChannel[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
    const length: unknown = Object.getOwnPropertyDescriptor(input, 'length')?.value;
    if (typeof length !== 'number' || length > CHANNELS.length || Reflect.ownKeys(input).length !== length + 1) return fail();
    const accepted = new Set<AppTransportChannel>();
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !('value' in descriptor)) return fail();
      const value: unknown = descriptor.value;
      if (typeof value !== 'string' || !(CHANNELS as readonly string[]).includes(value)) return fail();
      const channel = value as AppTransportChannel;
      if (accepted.has(channel)) return fail();
      accepted.add(channel);
    }
    return Object.freeze(CHANNELS.filter(channel => accepted.has(channel)));
  } catch { return fail(); }
}
export function parseRuntimeTransportSelection(input: unknown): RuntimeTransportSelection {
  const raw = record(input, ['version', 'mode', 'brokerGeneration', 'brokeredChannels']);
  if (raw.version !== 1) return fail();
  return Object.freeze({ version: 1, mode: mode(raw.mode), brokerGeneration: generation(raw.brokerGeneration), brokeredChannels: channels(raw.brokeredChannels) });
}
export function parseRuntimeSelectTransportMode(input: unknown): RuntimeSelectTransportMode {
  const raw = record(input, ['mode', 'expectedBrokerGeneration', 'ordinaryConsent']);
  if (typeof raw.ordinaryConsent !== 'boolean') return fail();
  return Object.freeze({ mode: mode(raw.mode), expectedBrokerGeneration: generation(raw.expectedBrokerGeneration), ordinaryConsent: raw.ordinaryConsent });
}
