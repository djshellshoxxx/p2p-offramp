/** Partial G04 offline content boundary. No DOM/rendering, navigation, network or origin authorizer.
 * Text is validated, never HTML-sanitized: callers must use text rendering, never an HTML sink.
 * G04 deployed header/meta enforcement, UI/build sinks, G06/G11/G15 provenance and the browser
 * matrix remain release gates. A generated header is not deployed evidence of framing protection.
 * Primary semantics: https://www.w3.org/TR/2026/WD-CSP3-20260916/#meta-element
 * https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-content-security-policy
 * https://w3c.github.io/webappsec-referrer-policy/
 */
export const MAX_ORDER_TEXT_BYTES = 4096;
export const MAX_CHAT_TEXT_BYTES = 16384;
export const MAX_EXTERNAL_LINK_BYTES = 2048;
export const MAX_EXTERNAL_LINK_LABEL_BYTES = 256;
export type ContentErrorCode = 'INVALID_INPUT' | 'LIMIT_EXCEEDED';
export type PlainTextKind = 'order' | 'chat';
export class ContentBoundaryError extends Error {
  readonly code: ContentErrorCode;
  readonly messageKey: string;
  constructor(code: ContentErrorCode = 'INVALID_INPUT') {
    super('Content boundary input unavailable.'); this.name = 'ContentBoundaryError'; this.code = code; this.messageKey = `content.error.${code.toLowerCase()}`;
  }
}
function fail(code: ContentErrorCode = 'INVALID_INPUT'): never { throw new ContentBoundaryError(code); }
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const prototype: unknown = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) return fail();
    const own = Reflect.ownKeys(input); if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (!descriptor || !('value' in descriptor)) return fail(); copy[key] = descriptor.value; }
    return copy;
  } catch { return fail(); }
}
function limit(kind: PlainTextKind): number {
  if (kind === 'order') return MAX_ORDER_TEXT_BYTES;
  if (kind === 'chat') return MAX_CHAT_TEXT_BYTES;
  return fail();
}
function control(code: number, multiline: boolean): boolean {
  if (code < 0x20) return !multiline || (code !== 9 && code !== 10 && code !== 13);
  return (code >= 0x7f && code <= 0x9f) || code === 0x061c || code === 0x200b || code === 0x200e || code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) || code === 0x2060 || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff;
}
/** Count UTF8 bytes while validating UTF16, without allocating an unbounded encoded copy. */
function text(input: unknown, maximum: number, multiline: boolean): string {
  if (typeof input !== 'string') return fail();
  if (input.length > maximum) return fail('LIMIT_EXCEEDED');
  let bytes = 0;
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    if (control(code, multiline)) return fail();
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) return fail(); bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) return fail();
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    if (bytes > maximum) return fail('LIMIT_EXCEEDED');
  }
  return input;
}
/** Preserves exact characters; TAB/LF/CR and language/emoji joiners are allowed. */
export function validatePlainText(input: unknown, kind: PlainTextKind): string { return text(input, limit(kind), true); }
export function decodePlainText(input: unknown, kind: PlainTextKind): string {
  const maximum = limit(kind); let length: number;
  try {
    const typed: object = Object.getPrototypeOf(Uint8Array.prototype) as object;
    const size: unknown = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!.call(input);
    const buffer: unknown = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!.call(input);
    if (!(input instanceof Uint8Array) || !(buffer instanceof ArrayBuffer) || typeof size !== 'number') return fail();
    length = size;
  } catch { return fail(); }
  if (length > maximum) return fail('LIMIT_EXCEEDED');
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(length); Uint8Array.prototype.set.call(bytes, input); } catch { return fail(); }
  let decoded: string;
  // Including rather than stripping a BOM lets the common validator reject its invisible control.
  try { decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return fail(); }
  finally { bytes.fill(0); }
  return validatePlainText(decoded, kind);
}

export interface SafeExternalLink {
  readonly href: string; readonly label: string;
  readonly rel: 'noopener noreferrer'; readonly referrerPolicy: 'no-referrer';
}
/** Structural link validation only: no destination trust, request authorization or automatic navigation.
 * Queries/fragments have no reviewed nonsecret schema here and are therefore all rejected.
 * Callers must also avoid putting private data in a URL path or a displayed link label.
 */
export function parseSafeExternalLink(input: unknown): SafeExternalLink {
  const raw = exact(input, ['href', 'label']);
  const href = text(raw.href, MAX_EXTERNAL_LINK_BYTES, false), label = text(raw.label, MAX_EXTERNAL_LINK_LABEL_BYTES, false);
  if (!href || !label.trim() || !/^https:\/\//i.test(href) || /[\s\\?#]/u.test(href)) return fail();
  const authority = href.slice(href.indexOf('://') + 3).split('/')[0]!;
  if (authority.includes('@')) return fail();
  let parsed: URL;
  try { parsed = new URL(href); } catch { return fail(); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) return fail();
  text(parsed.href, MAX_EXTERNAL_LINK_BYTES, false);
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(parsed.pathname); } catch { return fail(); }
  text(decodedPath, MAX_EXTERNAL_LINK_BYTES, false);
  return Object.freeze({ href: parsed.href, label, rel: 'noopener noreferrer', referrerPolicy: 'no-referrer' });
}

export interface ContentPolicyManifest {
  readonly version: 1; readonly releaseId: string; readonly connectOrigins: readonly [];
  readonly delivery: 'header' | 'meta'; readonly framingProtected: false;
}
export type ContentMetaRecord = { readonly httpEquiv: 'Content-Security-Policy'; readonly content: string } |
  { readonly name: 'referrer'; readonly content: 'no-referrer' };
export interface OfflineContentPolicy {
  readonly manifest: ContentPolicyManifest;
  readonly csp: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Attribute data only. Composition must put these in head before every resource tag. */
  readonly meta: readonly ContentMetaRecord[];
  readonly notices: readonly string[];
}
/** Offline-only build data. Registry-derived external origins require a separate authenticated issuer. */
export function buildOfflineContentPolicy(input: unknown): OfflineContentPolicy {
  const raw = exact(input, ['version', 'releaseId', 'delivery']);
  if (raw.version !== 1 || typeof raw.releaseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(raw.releaseId) ||
      (raw.delivery !== 'header' && raw.delivery !== 'meta')) return fail();
  const directives: Record<string, string> = {
    'default-src': "'none'", 'script-src': "'self'", 'style-src': "'self'", 'img-src': "'self'", 'font-src': "'self'",
    'connect-src': "'none'", 'worker-src': "'self'", 'manifest-src': "'self'", 'base-uri': "'none'", 'object-src': "'none'",
    'form-action': "'none'", 'frame-src': "'none'",
  };
  if (raw.delivery === 'header') directives['frame-ancestors'] = "'none'";
  const csp = Object.keys(directives).sort().map(name => `${name} ${directives[name]!}`).join('; ');
  const manifest: ContentPolicyManifest = Object.freeze({ version: 1, releaseId: raw.releaseId, connectOrigins: Object.freeze([]) as readonly [], delivery: raw.delivery, framingProtected: false });
  const headers = raw.delivery === 'header' ? Object.freeze({ 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }) : Object.freeze({});
  const meta: readonly ContentMetaRecord[] = raw.delivery === 'header' ? Object.freeze([]) : Object.freeze([
    Object.freeze({ httpEquiv: 'Content-Security-Policy' as const, content: csp }), Object.freeze({ name: 'referrer' as const, content: 'no-referrer' as const }),
  ]);
  const notices = ['content.policy.deployment-unverified', 'content.policy.framing-unverified'];
  if (raw.delivery === 'meta') notices.push('content.policy.meta-before-resources-required');
  return Object.freeze({ manifest, csp, headers, meta, notices: Object.freeze(notices) });
}
