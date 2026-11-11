/** Local compatibility evidence, not a wallet/chain permission or device certification.
 * The maintained catalog pins and source identity are trusted composition inputs. They must never come
 * from an imported report, URL, wallet announcement or the record's own result/status fields.
 * No measured wallet records are bundled by default. Exact versions and capability sets never expand
 * to browser families, later releases, other devices, wallet versions, connectors or chains.
 */
import { parseStrictJsonBytes } from '../../../../packages/schemas/index.ts';

export const COMPATIBILITY_LIMITS = Object.freeze({ records: 64, evidenceBytes: 64 * 1024, capabilities: 16, limitations: 16 });
export const REQUIRED_CAPABILITIES = Object.freeze(['secure-context', 'webcrypto', 'bounded-worker', 'indexeddb', 'file-import', 'file-export'] as const);
export const OPTIONAL_CAPABILITIES = Object.freeze(['camera', 'share', 'clipboard'] as const);
const connectorCapabilities = Object.freeze(['evm-injected', 'evm-discovery', 'mobile-session', 'mobile-deep-link', 'solana-wallet'] as const);
export type CompatibilityCapability = typeof REQUIRED_CAPABILITIES[number] | typeof OPTIONAL_CAPABILITIES[number] | typeof connectorCapabilities[number];
export type CompatibilityStatus = 'tested' | 'supported' | 'unsupported' | 'untested';
export type CompatibilityOutcome = 'pass' | 'fail' | 'unsupported' | 'not-run';
export type EvidenceKind = 'automated' | 'emulated-device' | 'physical-device';
export type CompatibilityConnector = 'none' | 'eip1193' | 'eip6963' | 'mobile-session' | 'mobile-deep-link' | 'solana-wallet';
export interface CompatibilityTarget {
  readonly browser: string; readonly version: string; readonly os: string; readonly device: string;
  readonly wallet: string; readonly walletVersion: string; readonly connector: CompatibilityConnector; readonly chain: string;
}
/** Exact fields from the cross-device specification. Parsing is structural and grants no support authority. */
export interface CompatibilityRecord extends CompatibilityTarget {
  readonly capabilities: readonly CompatibilityCapability[]; readonly testedAt: number;
  readonly result: CompatibilityOutcome; readonly limitations: readonly string[];
}
export interface CompatibilityQuery extends CompatibilityTarget {
  readonly capabilities: readonly CompatibilityCapability[]; readonly sourceCommit: string; readonly sourceSha256: string;
}
export interface CompatibilityCatalogPins {
  readonly sourceCommit: string; readonly sourceSha256: string; readonly expiresAt: number;
  readonly entries: readonly Readonly<{ evidenceSha256: string; status: Exclude<CompatibilityStatus, 'untested'> }>[];
}
/** An opaque, identity-bound result of checking separately maintained pins against exact report bytes. */
export interface CompatibilityCatalog {
  readonly sourceCommit: string | null; readonly sourceSha256: string | null; readonly expiresAt: number | null; readonly size: number;
}
export type CompatibilityReason = 'matched-evidence' | 'unmeasured-target' | 'untrusted-catalog' | 'source-mismatch' | 'evidence-expired' | 'evidence-not-current';
export interface CompatibilityView {
  readonly status: CompatibilityStatus; readonly reason: CompatibilityReason;
  readonly result: Exclude<CompatibilityOutcome, 'not-run'> | null; readonly testedAt: number | null;
  readonly evidenceKind: EvidenceKind | null; readonly evidenceSha256: string | null;
  readonly limitations: readonly string[]; readonly certified: false; readonly economicActionsAllowed: false;
}
export type CompatibilityErrorCode = 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'EVIDENCE_MISMATCH' | 'UNAVAILABLE';
const errors = new WeakMap<object, CompatibilityErrorCode>();
export class CompatibilityError extends Error {
  readonly code: CompatibilityErrorCode;
  constructor(code: CompatibilityErrorCode) { super('Compatibility evidence is unavailable.'); this.name = 'CompatibilityError'; this.code = code; errors.set(this, code); }
}
const stop = (code: CompatibilityErrorCode = 'INVALID_INPUT'): never => { throw new CompatibilityError(code); };
function normalized(error: unknown): never {
  return stop(typeof error === 'object' && error !== null ? errors.get(error) ?? 'INVALID_INPUT' : 'INVALID_INPUT');
}
const targetFields = ['browser', 'version', 'os', 'device', 'wallet', 'walletVersion', 'connector', 'chain'] as const;
const recordFields = [...targetFields, 'capabilities', 'testedAt', 'result', 'limitations'] as const;
const capabilities: readonly string[] = [...REQUIRED_CAPABILITIES, ...OPTIONAL_CAPABILITIES, ...connectorCapabilities];
const connectors: readonly CompatibilityConnector[] = ['none', 'eip1193', 'eip6963', 'mobile-session', 'mobile-deep-link', 'solana-wallet'];
const browsers = ['chrome', 'chromium', 'firefox', 'safari', 'edge', 'samsung-internet', 'opera'];
const unsafe = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff<>]/u;
function data(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return stop();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return stop();
  const out: Record<string, unknown> = Object.create(null);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return stop();
    out[field] = descriptor.value;
  }
  return out;
}
function list(input: unknown, maximum: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop();
  const size: unknown = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return stop();
  if (size > maximum) return stop('LIMIT_EXCEEDED');
  if (Reflect.ownKeys(input).length !== size + 1) return stop();
  const out: unknown[] = [];
  for (let index = 0; index < size; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return stop();
    out.push(descriptor.value);
  }
  return out;
}
function text(input: unknown, maximum = 160): string {
  if (typeof input !== 'string' || !input.length || input.length > maximum || input.trim() !== input || unsafe.test(input)) return stop();
  return input;
}
function version(input: unknown): string {
  const value = text(input, 64);
  return /^(?:0|[1-9][0-9]{0,8})(?:\.(?:0|[1-9][0-9]{0,8})){0,3}(?:[-+][A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(value) ? value : stop();
}
function digest(input: unknown): string { return typeof input === 'string' && /^[0-9a-f]{64}$/.test(input) ? input : stop(); }
function commit(input: unknown): string { return typeof input === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input) ? input : stop(); }
function seconds(input: unknown): number { return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : stop(); }
function choice<T extends string>(input: unknown, values: readonly T[]): T { return typeof input === 'string' && values.includes(input as T) ? input as T : stop(); }
function capabilitySet(input: unknown): readonly CompatibilityCapability[] {
  const values = list(input, COMPATIBILITY_LIMITS.capabilities).map(value => choice(value, capabilities) as CompatibilityCapability);
  if (new Set(values).size !== values.length) return stop();
  return Object.freeze(values.sort());
}
function target(raw: Record<string, unknown>): CompatibilityTarget {
  const browser = choice(raw.browser, browsers), connector = choice(raw.connector, connectors), chain = text(raw.chain, 110);
  if (!/^(?:eip155:[1-9][0-9]{0,77}|solana:[A-Za-z0-9_-]{1,100})$/.test(chain)) return stop();
  if (connector === 'solana-wallet' && !chain.startsWith('solana:') || ['eip1193', 'eip6963'].includes(connector) && !chain.startsWith('eip155:')) return stop();
  const wallet = text(raw.wallet), walletVersion = wallet === 'none' ? choice(raw.walletVersion, ['none']) : version(raw.walletVersion);
  if ((connector === 'none') !== (wallet === 'none')) return stop();
  return Object.freeze({ browser, version: version(raw.version), os: text(raw.os), device: text(raw.device), wallet, walletVersion, connector, chain });
}
export function parseCompatibilityRecord(input: unknown): CompatibilityRecord {
  try {
    const raw = data(input, recordFields);
    return Object.freeze({ ...target(raw), capabilities: capabilitySet(raw.capabilities), testedAt: seconds(raw.testedAt),
      result: choice(raw.result, ['pass', 'fail', 'unsupported', 'not-run'] as const),
      limitations: Object.freeze(list(raw.limitations, COMPATIBILITY_LIMITS.limitations).map(value => text(value, 500))) });
  } catch (error) { return normalized(error); }
}
export function parseCompatibilityQuery(input: unknown): CompatibilityQuery {
  try {
    const raw = data(input, [...targetFields, 'capabilities', 'sourceCommit', 'sourceSha256']);
    return Object.freeze({ ...target(raw), capabilities: capabilitySet(raw.capabilities), sourceCommit: commit(raw.sourceCommit), sourceSha256: digest(raw.sourceSha256) });
  } catch (error) { return normalized(error); }
}
function pins(input: unknown): CompatibilityCatalogPins {
  const raw = data(input, ['sourceCommit', 'sourceSha256', 'expiresAt', 'entries']);
  const entries = list(raw.entries, COMPATIBILITY_LIMITS.records).map(value => {
    const entry = data(value, ['evidenceSha256', 'status']);
    return Object.freeze({ evidenceSha256: digest(entry.evidenceSha256), status: choice(entry.status, ['tested', 'supported', 'unsupported'] as const) });
  });
  if (new Set(entries.map(entry => entry.evidenceSha256)).size !== entries.length) return stop('EVIDENCE_MISMATCH');
  return Object.freeze({ sourceCommit: commit(raw.sourceCommit), sourceSha256: digest(raw.sourceSha256), expiresAt: seconds(raw.expiresAt), entries: Object.freeze(entries) });
}
const nativeByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
const nativeTypedArrayName = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!.get!;
function ownedBytes(input: unknown): Uint8Array<ArrayBuffer> {
  let length: number;
  try {
    if (Reflect.apply(nativeTypedArrayName, input, []) !== 'Uint8Array') return stop();
    length = Reflect.apply(nativeByteLength, input, []) as number;
  } catch { return stop(); }
  if (length > COMPATIBILITY_LIMITS.evidenceBytes) return stop('LIMIT_EXCEEDED');
  const copy = new Uint8Array(length);
  try { Uint8Array.prototype.set.call(copy, input as Uint8Array); } catch { return stop(); }
  return copy;
}
async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return stop('UNAVAILABLE'); }
}
interface Enrolled { readonly record: CompatibilityRecord; readonly kind: EvidenceKind; readonly evidenceSha256: string; readonly status: Exclude<CompatibilityStatus, 'untested'>; }
interface CatalogProof { readonly pins: CompatibilityCatalogPins | null; readonly records: ReadonlyMap<string, Enrolled>; }
const catalogs = new WeakMap<object, CatalogProof>();
function key(query: CompatibilityTarget & { readonly capabilities: readonly CompatibilityCapability[] }): string {
  return JSON.stringify([...targetFields.map(field => query[field]), query.capabilities]);
}
const emptyRecords = new Map<string, Enrolled>();
export const emptyCompatibilityCatalog: CompatibilityCatalog = Object.freeze({ sourceCommit: null, sourceSha256: null, expiresAt: null, size: 0 });
catalogs.set(emptyCompatibilityCatalog, { pins: null, records: emptyRecords });
/** Local maintained-catalog enrollment, not a public import or review-approval API.
 * `trustedPins` must be bundled/reviewed independently of `evidenceBytes`; a matching self-declared digest
 * authenticates nobody. Reports are copied before awaiting, hashed, strictly parsed and source-bound.
 * A supported enrollment requires a measured passing physical-device record. It still grants no funds gate.
 */
export async function createCompatibilityCatalog(trustedPins: unknown, evidenceBytes: unknown): Promise<CompatibilityCatalog> {
  try {
    const trusted = pins(trustedPins), reports = list(evidenceBytes, COMPATIBILITY_LIMITS.records).map(ownedBytes);
    if (reports.length !== trusted.entries.length) return stop('EVIDENCE_MISMATCH');
    const enrolled = new Map<string, Enrolled>(), hashes = new Set<string>();
    for (const bytes of reports) {
      const evidenceSha256 = await sha256(bytes), pin = trusted.entries.find(entry => entry.evidenceSha256 === evidenceSha256);
      if (!pin || hashes.has(evidenceSha256)) return stop('EVIDENCE_MISMATCH');
      hashes.add(evidenceSha256);
      const raw = data(parseStrictJsonBytes(bytes, COMPATIBILITY_LIMITS.evidenceBytes), ['format', 'sourceCommit', 'sourceSha256', 'kind', 'record']);
      if (raw.format !== 'p2p-offramp/compatibility-evidence/v1') return stop();
      if (commit(raw.sourceCommit) !== trusted.sourceCommit || digest(raw.sourceSha256) !== trusted.sourceSha256) return stop('EVIDENCE_MISMATCH');
      const kind = choice(raw.kind, ['automated', 'emulated-device', 'physical-device'] as const), record = parseCompatibilityRecord(raw.record);
      if (record.testedAt >= trusted.expiresAt || record.result === 'not-run' ||
          pin.status === 'supported' && (record.result !== 'pass' || kind !== 'physical-device' || !REQUIRED_CAPABILITIES.every(capability => record.capabilities.includes(capability))) ||
          pin.status === 'tested' && record.result === 'unsupported' || pin.status === 'unsupported' && record.result === 'pass') return stop('EVIDENCE_MISMATCH');
      const connectorCapability: Partial<Record<CompatibilityConnector, CompatibilityCapability>> = { eip1193: 'evm-injected', eip6963: 'evm-discovery', 'mobile-session': 'mobile-session', 'mobile-deep-link': 'mobile-deep-link', 'solana-wallet': 'solana-wallet' };
      const required = connectorCapability[record.connector];
      if (pin.status === 'supported' && required && !record.capabilities.includes(required)) return stop('EVIDENCE_MISMATCH');
      const identity = key(record);
      if (enrolled.has(identity)) return stop('EVIDENCE_MISMATCH');
      enrolled.set(identity, Object.freeze({ record, kind, evidenceSha256, status: pin.status }));
    }
    const catalog = Object.freeze({ sourceCommit: trusted.sourceCommit, sourceSha256: trusted.sourceSha256, expiresAt: trusted.expiresAt, size: enrolled.size });
    catalogs.set(catalog, { pins: trusted, records: enrolled }); return catalog;
  } catch (error) { return normalized(error); }
}
const noLimitations = Object.freeze([]) as readonly string[];
function untested(reason: CompatibilityReason): CompatibilityView {
  return Object.freeze({ status: 'untested', reason, result: null, testedAt: null, evidenceKind: null, evidenceSha256: null,
    limitations: noLimitations, certified: false, economicActionsAllowed: false });
}
/** Exact scope lookup only. No UA sniffing, wildcard/range, imported approval, permission or network operation. */
export function getCompatibility(input: unknown, catalog: CompatibilityCatalog = emptyCompatibilityCatalog, nowSeconds: number = Math.floor(Date.now() / 1000)): CompatibilityView {
  const query = parseCompatibilityQuery(input), now = seconds(nowSeconds);
  const proof = typeof catalog === 'object' && catalog !== null ? catalogs.get(catalog) : undefined;
  if (!proof) return untested('untrusted-catalog');
  if (!proof.pins) return untested('unmeasured-target');
  if (query.sourceCommit !== proof.pins.sourceCommit || query.sourceSha256 !== proof.pins.sourceSha256) return untested('source-mismatch');
  if (now >= proof.pins.expiresAt) return untested('evidence-expired');
  const enrolled = proof.records.get(key(query));
  if (!enrolled) return untested('unmeasured-target');
  if (now < enrolled.record.testedAt) return untested('evidence-not-current');
  // A not-run record cannot be enrolled; preserve this narrower type without copying a report assertion.
  const result = enrolled.record.result as Exclude<CompatibilityOutcome, 'not-run'>;
  return Object.freeze({ status: enrolled.status, reason: 'matched-evidence', result, testedAt: enrolled.record.testedAt,
    evidenceKind: enrolled.kind, evidenceSha256: enrolled.evidenceSha256, limitations: enrolled.record.limitations,
    certified: false, economicActionsAllowed: false });
}
