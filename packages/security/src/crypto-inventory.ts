/** G06 metadata gate only. No I/O, imports, provider execution or automatic approval.
 * The explicitly supplied implementation graph cannot discover all crypto imports.
 */
export type CryptoFindingCode = 'UNPINNED_VERSION' | 'INTEGRITY_MISMATCH' | 'MISSING_LICENSE' | 'MISSING_REVIEW' | 'MISSING_VECTOR' | 'FIXTURE_HASH_MISMATCH' | 'UNDECLARED_CRYPTO' | 'UNSUPPORTED_RUNTIME';
export type CapabilityState = 'candidate' | 'test-enabled' | 'release-enabled';
export interface CryptoFinding { readonly code: CryptoFindingCode; readonly path: string; readonly disposition: 'candidate' | 'pending' | 'blocking'; }
export interface CryptoInventoryReport { readonly findings: readonly CryptoFinding[]; /** This metadata gate only, never whole-product approval. */ readonly releaseEligible: boolean; }
export interface CryptoCapability { readonly capability: string; readonly state: CapabilityState; readonly implementations: readonly { readonly inventoryId: string; readonly packageName?: string }[]; }
export interface PublicEvidenceFile { readonly path: string; readonly bytes: Uint8Array; }
export const INVENTORY_LIMITS = Object.freeze({ dependencies: 64, capabilities: 64, implementations: 256, lockPackages: 512, files: 256, fileBytes: 1024 * 1024, totalFileBytes: 16 * 1024 * 1024, profileBytes: 32768 });
type Data = Record<string, unknown>;
class Invalid extends Error { readonly code: CryptoFindingCode; constructor(code: CryptoFindingCode = 'UNSUPPORTED_RUNTIME') { super('Invalid cryptographic inventory metadata.'); this.code = code; } }
const reject = (code?: CryptoFindingCode): never => { throw new Invalid(code); };
function object(value: unknown, allowed?: readonly string[], required: readonly string[] = allowed ?? []): Data {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Uint8Array) return reject();
  const keys = Object.keys(value);
  if (allowed && keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) return reject();
  return value as Data;
}
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) return reject(); return value; }
function text(value: unknown, max = 256, allowEmpty = false): string { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value)) return reject(); return value; }
function id(value: unknown): string { const result = text(value, 128); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) return reject(); return result; }
function path(value: unknown): string {
  const result = text(value, 256);
  if (!/^[A-Za-z0-9._/-]+$/.test(result) || result.startsWith('/') || result.split('/').some(part => !part || part === '.' || part === '..')) return reject();
  return result;
}
function url(value: unknown): string { const result = text(value, 2048); try { const parsed = new URL(result); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return reject(); } catch { return reject(); } return result; }
function packageName(value: unknown): string { const result = text(value, 160); if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(result)) return reject('UNDECLARED_CRYPTO'); return result; }
function exactVersion(value: string): boolean {
  // SemVer 2.0.0 rules 9/10: numeric prerelease identifiers have no leading
  // zeroes; build identifiers may have them. Hyphens are valid in either.
  const match = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  return match !== null && (match[1] === undefined || match[1].split('.').every(part => !/^[0-9]+$/.test(part) || part.length === 1 || part[0] !== '0'));
}
function sri(value: string): boolean { return /^sha512-[A-Za-z0-9+/]{86}==$/.test(value) && /[AQgw]==$/.test(value); }
async function sha256(bytes: Uint8Array): Promise<string> {
  try {
    if (typeof globalThis.crypto?.subtle?.digest !== 'function') return reject('UNSUPPORTED_RUNTIME');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return reject('UNSUPPORTED_RUNTIME'); }
}
/** Snapshot every own-data input, including bytes, before the first asynchronous digest. */
function snapshot(inputs: unknown[]): unknown[] {
  let nodes = 0, characters = 0, byteCount = 0;
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > 20000 || depth > 16) return reject();
    if (typeof value === 'string') { characters += value.length; if (value.length > 65536 || characters > 2 * 1024 * 1024) return reject(); return value; }
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object') return reject();
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Uint8Array.prototype) {
      const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
      const length = Reflect.apply(Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!, value, []) as number;
      const buffer: unknown = Reflect.apply(Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!, value, []);
      if (!(buffer instanceof ArrayBuffer) || length > INVENTORY_LIMITS.fileBytes || (byteCount += length) > INVENTORY_LIMITS.totalFileBytes) return reject();
      const bytes = new Uint8Array(length); Reflect.apply(Uint8Array.prototype.set, bytes, [value]); return bytes;
    }
    if (Array.isArray(value)) {
      const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
      if (proto !== Array.prototype || typeof length !== 'number' || length > 1024 || Reflect.ownKeys(value).length !== length + 1) return reject();
      return Array.from({ length }, (_, index) => { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); if (!descriptor || !('value' in descriptor)) return reject(); return copy(descriptor.value, depth + 1); });
    }
    if (proto !== Object.prototype && proto !== null) return reject();
    const keys = Reflect.ownKeys(value); if (keys.length > 1024) return reject();
    const result: Data = Object.create(null) as Data;
    for (const key of keys) { if (typeof key !== 'string') return reject(); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return reject(); result[key] = copy(descriptor.value, depth + 1); }
    return result;
  };
  return inputs.map(value => copy(value, 0));
}
interface Dependency { id: string; capability: string; version: string; integrity: string; license: string; runtime: string; review: Data; vectors: Data[]; index: number; }
interface Capability { capability: string; state: CapabilityState; implementations: { inventoryId: string; packageName?: string }[]; index: number; }
/** The browser profile is the only JSON byte input; JSON.parse alone loses duplicate keys. */
function profileJson(source: string): unknown {
  const parsed: unknown = JSON.parse(source);
  const stack: (Set<string> | null)[] = []; let objects = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '{' || character === '[') { if (stack.length >= 8 || ++objects > 256) return reject(); stack.push(character === '{' ? new Set() : null); }
    else if (character === '}' || character === ']') stack.pop();
    else if (character === '"') {
      const start = index++;
      while (source[index] !== '"') { if (source[index] === '\\') index++; if (++index >= source.length) return reject(); }
      let next = index + 1; while (/\s/.test(source[next] ?? 'x')) next++;
      if (source[next] === ':') { const keys = stack.at(-1); const key = JSON.parse(source.slice(start, index + 1)) as string; if (!keys || keys.has(key) || keys.size >= 64) return reject(); keys.add(key); }
    }
  }
  return parsed;
}
function browserProfile(bytes: Uint8Array, version: string): boolean {
  try {
    if (bytes.length > INVENTORY_LIMITS.profileBytes || !/^[A-Za-z0-9][A-Za-z0-9.-]*-v[1-9][0-9]*$/.test(version)) return false;
    const raw = object(profileJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)), ['profile', 'observed', 'unassessed']);
    if (text(raw.profile, 128) !== version) return false;
    const observed = list(raw.observed, 32); if (!observed.length) return false;
    for (const item of observed) { const row = object(item, ['engine', 'version', 'platform', 'qualification', 'checks']); for (const name of ['engine', 'version', 'platform', 'qualification']) text(row[name]); if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+){0,2}$/.test(row.version as string)) return false; const checks = list(row.checks, 64); if (!checks.length) return false; for (const check of checks) text(check); }
    for (const entry of list(raw.unassessed, 64)) text(entry);
    return true;
  } catch { return false; }
}
export async function verifyCryptoInventory(inventory: unknown, lockfile: unknown, enabledCapabilities: unknown, fixtureFiles: unknown): Promise<CryptoInventoryReport> {
  const findings: CryptoFinding[] = []; let hasRelease = false;
  const finding = (code: CryptoFindingCode, at: string, state?: CapabilityState): void => {
    const disposition = state === 'candidate' ? 'candidate' : code === 'MISSING_REVIEW' && state === 'test-enabled' ? 'pending' : 'blocking';
    if (!findings.some(entry => entry.code === code && entry.path === at && entry.disposition === disposition)) findings.push(Object.freeze({ code, path: at, disposition }));
  };
  try {
    [inventory, lockfile, enabledCapabilities, fixtureFiles] = snapshot([inventory, lockfile, enabledCapabilities, fixtureFiles]);
    const files = new Map<string, Uint8Array>();
    for (const entry of list(fixtureFiles, INVENTORY_LIMITS.files)) { const raw = object(entry, ['path', 'bytes']); const name = path(raw.path); if (files.has(name) || !(raw.bytes instanceof Uint8Array)) return reject(); files.set(name, raw.bytes); }
    const stateFor = (entry: unknown): CapabilityState | undefined => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
      const capability = (entry as Data).capability;
      for (const value of list(enabledCapabilities, INVENTORY_LIMITS.capabilities)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
        const raw = value as Data;
        if (raw.capability === capability && (raw.state === 'candidate' || raw.state === 'test-enabled' || raw.state === 'release-enabled')) return raw.state;
      }
      return 'candidate';
    };
    const dependencies = new Map<string, Dependency>(); const seenInventoryIds = new Set<string>();
    for (const [index, entry] of list(inventory, INVENTORY_LIMITS.dependencies).entries()) {
      const at = `inventory/${index}`;
      // Reserve claimed IDs before validating the rest of an entry: an invalid
      // candidate placed first cannot hide a duplicate release entry either.
      const claimedId = typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? (entry as Data).id : undefined;
      if (typeof claimedId === 'string') {
        if (seenInventoryIds.has(claimedId)) { finding('UNSUPPORTED_RUNTIME', at); continue; }
        seenInventoryIds.add(claimedId);
      }
      try {
        const raw = object(entry, ['id', 'capability', 'primitive', 'sourceUrl', 'version', 'integrity', 'license', 'runtime', 'review', 'vectors'], ['id', 'capability', 'primitive', 'sourceUrl', 'runtime']);
        for (const [field, code] of [['version', 'UNPINNED_VERSION'], ['integrity', 'INTEGRITY_MISMATCH'], ['license', 'MISSING_LICENSE'], ['review', 'MISSING_REVIEW'], ['vectors', 'MISSING_VECTOR']] as const) if (!Object.hasOwn(raw, field)) return reject(code);
        const name = id(raw.id);
        text(raw.primitive); url(raw.sourceUrl);
        const review = object(raw.review, ['status', 'reviewer', 'evidencePath']);
        if (!['pending', 'accepted', 'rejected'].includes(text(review.status))) return reject('MISSING_REVIEW');
        text(review.reviewer, 256, true); text(review.evidencePath, 256, true);
        if (review.evidencePath) { try { path(review.evidencePath); } catch { return reject('MISSING_REVIEW'); } }
        if (review.status === 'accepted' && (!review.reviewer || !review.evidencePath || !files.get(review.evidencePath as string)?.length)) return reject('MISSING_REVIEW');
        const vectors = list(raw.vectors, 16).map(vector => object(vector, ['path', 'sha256', 'provenanceUrl']));
        for (const vector of vectors) { path(vector.path); url(vector.provenanceUrl); if (typeof vector.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(vector.sha256)) return reject('FIXTURE_HASH_MISMATCH'); }
        const version = text(raw.version, 128), integrity = text(raw.integrity, 256), license = text(raw.license, 256, true), runtime = text(raw.runtime);
        if (!['npm', 'browser-built-in', 'vendored'].includes(runtime)) return reject('UNSUPPORTED_RUNTIME');
        if (!license.trim()) return reject('MISSING_LICENSE');
        if (runtime === 'npm' && !exactVersion(version)) return reject('UNPINNED_VERSION');
        if (runtime === 'npm' && !sri(integrity)) return reject('INTEGRITY_MISMATCH');
        if (runtime === 'browser-built-in') { if (!integrity.startsWith('browser-profile:')) return reject('INTEGRITY_MISMATCH'); path(integrity.slice('browser-profile:'.length)); }
        dependencies.set(name, { id: name, capability: id(raw.capability), version: text(raw.version, 128), integrity: text(raw.integrity, 256), license: text(raw.license, 256, true), runtime: text(raw.runtime), review, vectors, index });
      } catch (error) { finding(error instanceof Invalid ? error.code : 'UNSUPPORTED_RUNTIME', at, stateFor(entry)); }
    }
    const capabilities: Capability[] = []; const capabilityNames = new Set<string>(); let implementationCount = 0;
    for (const [index, entry] of list(enabledCapabilities, INVENTORY_LIMITS.capabilities).entries()) {
      const raw = object(entry, ['capability', 'state', 'implementations']); const name = id(raw.capability);
      if (capabilityNames.has(name) || !['candidate', 'test-enabled', 'release-enabled'].includes(text(raw.state))) return reject(); capabilityNames.add(name);
      const state = raw.state as CapabilityState; hasRelease ||= state === 'release-enabled';
      const seen = new Set<string>();
      const implementations = list(raw.implementations, INVENTORY_LIMITS.dependencies).map(value => { const item = object(value, ['inventoryId', 'packageName'], ['inventoryId']); const inventoryId = id(item.inventoryId); if (seen.has(inventoryId) || ++implementationCount > INVENTORY_LIMITS.implementations) return reject(); seen.add(inventoryId); return Object.hasOwn(item, 'packageName') ? { inventoryId, packageName: packageName(item.packageName) } : { inventoryId }; });
      if (!implementations.length) finding('UNDECLARED_CRYPTO', `capabilities/${index}`, state);
      capabilities.push({ capability: name, state, implementations, index });
    }
    const lock = object(lockfile, ['name', 'version', 'lockfileVersion', 'requires', 'packages'], ['lockfileVersion', 'packages']);
    if (lock.lockfileVersion !== 3) return reject('UNPINNED_VERSION');
    const packages = object(lock.packages); if (Object.keys(packages).length > INVENTORY_LIMITS.lockPackages) return reject();
    const allowedPackageFields = ['name', 'version', 'resolved', 'integrity', 'license', 'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'devDependencies', 'engines', 'funding', 'dev', 'optional', 'devOptional', 'cpu', 'os', 'bin', 'hasInstallScript', 'deprecated', 'inBundle', 'link'];
    for (const [name, entry] of Object.entries(packages)) { if (name && !/^node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/.test(name)) return reject(); object(entry, allowedPackageFields, []); }
    const root = object(packages['']);
    const rootDependencies = root.dependencies === undefined ? Object.create(null) as Data : object(root.dependencies);
    for (const capability of capabilities) {
      const state = capability.state; const declared = new Map<string, Dependency>();
      for (const implementation of capability.implementations) {
        const dependency = dependencies.get(implementation.inventoryId); const at = `capabilities/${capability.index}`;
        if (!dependency || dependency.capability !== capability.capability) { finding('UNDECLARED_CRYPTO', at, state); continue; }
        const location = `inventory/${dependency.index}`;
        if (!dependency.license.trim()) finding('MISSING_LICENSE', location, state);
        const review = dependency.review;
        if (review.status !== 'accepted' || typeof review.reviewer !== 'string' || !review.reviewer.trim() || typeof review.evidencePath !== 'string') finding('MISSING_REVIEW', location, state);
        else { try { text(review.reviewer); const evidence = files.get(path(review.evidencePath)); if (!evidence?.length) finding('MISSING_REVIEW', location, state); } catch { finding('MISSING_REVIEW', location, state); } }
        if (!dependency.vectors.length) finding('MISSING_VECTOR', location, state);
        for (const [index, vector] of dependency.vectors.entries()) {
          const vectorAt = `${location}/vectors/${index}`;
          try { const name = path(vector.path); url(vector.provenanceUrl); if (typeof vector.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(vector.sha256)) return reject('FIXTURE_HASH_MISMATCH'); const bytes = files.get(name); if (!bytes?.length) finding('MISSING_VECTOR', vectorAt, state); else if (await sha256(bytes) !== vector.sha256) finding('FIXTURE_HASH_MISMATCH', vectorAt, state); }
          catch (error) { finding(error instanceof Invalid ? error.code : 'FIXTURE_HASH_MISMATCH', vectorAt, state); }
        }
        if (dependency.runtime === 'npm') {
          if (!implementation.packageName) { finding('UNDECLARED_CRYPTO', location, state); continue; }
          if (declared.has(implementation.packageName)) finding('UNDECLARED_CRYPTO', location, state);
          declared.set(implementation.packageName, dependency);
          if (!exactVersion(dependency.version)) finding('UNPINNED_VERSION', location, state);
          if (!sri(dependency.integrity)) finding('INTEGRITY_MISMATCH', location, state);
        } else if (dependency.runtime === 'browser-built-in') {
          try { if (implementation.packageName || !dependency.integrity.startsWith('browser-profile:')) return reject(); const profile = files.get(path(dependency.integrity.slice('browser-profile:'.length))); if (!profile || !browserProfile(profile, dependency.version)) return reject(); }
          catch { finding('UNSUPPORTED_RUNTIME', location, state); }
        } else if (dependency.runtime === 'vendored') {
          // No vendored manifest exists in this project. Never approve it by npm rules.
          finding('UNSUPPORTED_RUNTIME', location, state);
        } else finding('UNSUPPORTED_RUNTIME', location, state);
      }
      const visited = new Set<string>(); const visitedNames = new Set<string>();
      const visit = (name: string, from: string): void => {
        let parent = from, resolved = '';
        for (;;) {
          const candidate = `${parent ? `${parent}/` : ''}node_modules/${name}`;
          if (Object.hasOwn(packages, candidate)) { resolved = candidate; break; }
          if (!parent) break;
          const boundary = parent.lastIndexOf('/node_modules/'); parent = boundary < 0 ? '' : parent.slice(0, boundary);
        }
        if (!resolved) { finding('UNDECLARED_CRYPTO', `capabilities/${capability.index}/graph`, state); return; }
        if (visited.has(resolved)) return; visited.add(resolved);
        visitedNames.add(name);
        if (visited.size > INVENTORY_LIMITS.lockPackages) return reject();
        const dependency = declared.get(name); const entry = packages[resolved];
        if (!dependency || entry === undefined) { finding('UNDECLARED_CRYPTO', `capabilities/${capability.index}/graph`, state); return; }
        const raw = object(entry); const location = `inventory/${dependency.index}`;
        if (raw.version !== dependency.version || !exactVersion(text(raw.version, 128))) finding('UNPINNED_VERSION', location, state);
        if (raw.integrity !== dependency.integrity || !sri(dependency.integrity) || raw.link === true) finding('INTEGRITY_MISMATCH', location, state);
        if (raw.license !== dependency.license || !dependency.license.trim()) finding('MISSING_LICENSE', location, state);
        for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
          if (raw[field] === undefined) continue;
          for (const [child, version] of Object.entries(object(raw[field]))) { packageName(child); if (typeof version !== 'string' || !exactVersion(version)) finding('UNPINNED_VERSION', location, state); const childDeclaration = declared.get(child); if (!childDeclaration) finding('UNDECLARED_CRYPTO', `capabilities/${capability.index}/graph`, state); else if (version !== childDeclaration.version) finding('UNPINNED_VERSION', `inventory/${childDeclaration.index}`, state); visit(child, resolved); }
        }
      };
      for (const [name, dependency] of declared) {
        if (Object.hasOwn(rootDependencies, name)) {
          if (rootDependencies[name] !== dependency.version) finding('UNPINNED_VERSION', `inventory/${dependency.index}`, state);
          visit(name, '');
        }
      }
      for (const name of declared.keys()) if (!visitedNames.has(name)) finding('UNDECLARED_CRYPTO', `capabilities/${capability.index}/graph`, state);
    }
  } catch (error) { finding(error instanceof Invalid ? error.code : 'UNSUPPORTED_RUNTIME', 'input'); }
  findings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : a.disposition < b.disposition ? -1 : a.disposition > b.disposition ? 1 : 0);
  return Object.freeze({ findings: Object.freeze(findings), releaseEligible: hasRelease && !findings.some(entry => entry.disposition === 'blocking') });
}
