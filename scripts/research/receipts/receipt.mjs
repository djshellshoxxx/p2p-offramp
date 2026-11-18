/** Development-only receipt admission. No network, private keys, command runner or release authority. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url), 'utf8'));
export const MAX_RECEIPT_BYTES = 262144;
export const MAX_LOG_BYTES = 8192;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
const schemaError = () => fail('EVIDENCE_SCHEMA');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

/** This wire profile is deliberately narrower than general JSON: sorted keys, UTF-8, no whitespace. */
export function canonicalize(value, depth = 0) {
  if (depth > 16) return schemaError();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
  if (Array.isArray(value)) return '[' + value.map(item => canonicalize(item, depth + 1)).join(',') + ']';
  if (!plain(value)) return schemaError();
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalize(value[key], depth + 1)).join(',') + '}';
}

export function parseCanonical(input) {
  try {
    if (typeof input !== 'string' && !Buffer.isBuffer(input)) return schemaError();
    if (Buffer.byteLength(input) > MAX_RECEIPT_BYTES) return schemaError();
    const text = Buffer.isBuffer(input) ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input) : input;
    const value = JSON.parse(text);
    if (canonicalize(value) !== text) return schemaError();
    return value;
  } catch { return schemaError(); }
}

// This intentionally small validator consumes the checked-in schema, never a caller-supplied schema.
// Reject unsupported keywords so a schema change cannot silently weaken local validation.
const keywords = new Set(['$schema', '$id', 'title', '$defs', '$ref', 'type', 'const', 'enum', 'anyOf',
  'additionalProperties', 'required', 'properties', 'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum', 'minItems', 'maxItems', 'items']);
function shape(value, rule) {
  if (Object.keys(rule).some(key => !keywords.has(key))) return schemaError();
  if (rule.$ref) {
    if (Object.keys(rule).length !== 1) return schemaError();
    const name = rule.$ref.match(/^#\/\$defs\/([A-Za-z0-9]+)$/)?.[1];
    if (!name || !Object.hasOwn(schema.$defs, name)) return schemaError();
    return shape(value, schema.$defs[name]);
  }
  if (rule.anyOf) {
    if (Object.keys(rule).length !== 1) return schemaError();
    return rule.anyOf.some(option => shape(value, option));
  }
  if (Object.hasOwn(rule, 'const') && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isSafeInteger(value) ? 'integer' : typeof value;
  if (rule.type && ![rule.type].flat().includes(type)) return false;
  if (typeof value === 'string') {
    const length = [...value].length;
    if (length < (rule.minLength ?? 0) || length > (rule.maxLength ?? Infinity)) return false;
    if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) return false;
    // Lone surrogate values cannot have an unambiguous UTF-8 representation.
    if (!value.isWellFormed()) return false;
  }
  if (type === 'integer' && (value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity))) return false;
  if (type === 'array') return value.length >= (rule.minItems ?? 0) && value.length <= (rule.maxItems ?? Infinity)
    && value.every(item => shape(item, rule.items));
  if (type === 'object') {
    if (!plain(value) || rule.additionalProperties !== false) return false;
    if (rule.required.some(key => !Object.hasOwn(value, key))) return false;
    return Object.keys(value).every(key => Object.hasOwn(rule.properties, key) && shape(value[key], rule.properties[key]));
  }
  return true;
}

const secretName = '(?:password|passwd|secret|client[-_]?secret|api[-_]?key|access[-_]?token|refresh[-_]?token|token|private[-_]?key|mnemonic|seed|authorization|cookie|credentials?|x[-_]amz[-_](?:signature|credential)|signature|sig)';
const secretPatterns = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|$)/gu,
  /\b(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9+/_=.-]+/giu,
  new RegExp(String.raw`["']?\b${secretName}["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&]+)`, 'giu'),
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{16,})\b/gu,
  /https?:\/\/[^\s/@]+:[^\s/@]+@[^\s]+/giu,
];
function checkSecrets(secrets) {
  if (!Array.isArray(secrets) || secrets.length > 256 || secrets.some(s => typeof s !== 'string' || !s.length || s.length > 4096)) {
    fail('EVIDENCE_SECRET_CONFIGURATION');
  }
}
function redact(text, secrets) {
  let output = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) output = output.split(secret).join('[REDACTED]');
  for (const pattern of secretPatterns) output = output.replace(pattern, '[REDACTED]');
  return output;
}
function assertNoSecrets(value, secrets) {
  if (typeof value === 'string' && redact(value, secrets) !== value) fail('EVIDENCE_SECRET');
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) { assertNoSecrets(key, secrets); assertNoSecrets(item, secrets); }
  }
}
function assertNoContextualSecrets(receipt, secrets) {
  const sensitive = name => new RegExp('^' + secretName + '$', 'iu').test(name.replace(/^--?/, ''));
  for (const setting of receipt.buildConfiguration) {
    if (sensitive(setting.name) && setting.value !== '[REDACTED]') fail('EVIDENCE_SECRET');
  }
  for (const command of receipt.commands) {
    for (let i = 0; i < command.argv.length; i++) {
      if (sensitive(command.argv[i]) && command.argv[i + 1] !== '[REDACTED]') fail('EVIDENCE_SECRET');
    }
    // Known literals can span argv entries; do not hide them by checking strings separately.
    assertNoSecrets(command.argv.join(' '), secrets);
  }
}

/** Hash only retained, redacted bytes. Never publish a digest of the pre-redaction secret-bearing log. */
export function makeLog(commandIndex, text, { secrets = [] } = {}) {
  checkSecrets(secrets);
  if (!Number.isSafeInteger(commandIndex) || commandIndex < 0 || commandIndex > 63
    || typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024 || !text.isWellFormed()) return schemaError();
  const sanitized = redact(text, secrets);
  let bytes = 0, retained = '';
  for (const character of sanitized) {
    const length = Buffer.byteLength(character);
    if (bytes + length > MAX_LOG_BYTES) break;
    retained += character; bytes += length;
  }
  return { commandIndex, text: retained, sha256: sha256(retained), redacted: sanitized !== text,
    truncated: retained.length !== sanitized.length };
}

function safePath(path, allowRoot = false) {
  return (allowRoot && path === '.') || !path.split('/').some(part => part === '.' || part === '..' || part === '.git');
}
const unique = values => new Set(values).size === values.length;
function semantics(receipt) {
  if (!Number.isFinite(Date.parse(receipt.createdAt)) || new Date(receipt.createdAt).toISOString() !== receipt.createdAt) return schemaError();
  let url;
  try { url = new URL(receipt.repository); } catch { return schemaError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== receipt.repository) return schemaError();
  for (const field of ['sources', 'fixtures']) {
    if (!unique(receipt[field].map(item => item.path)) || receipt[field].some(item => !safePath(item.path))) return schemaError();
  }
  for (const field of ['tools', 'buildConfiguration']) if (!unique(receipt[field].map(item => item.name))) return schemaError();
  if (receipt.fixtures.some(f => !receipt.sources.some(s => f.path === s.path && f.sha256 === s.sha256))) return schemaError();
  if (receipt.commands.some(c => !safePath(c.cwd, true))) return schemaError();
  if (!unique(receipt.logs.map(log => log.commandIndex)) || receipt.logs.length !== receipt.commands.length) return schemaError();
  if (receipt.logs.some(log => log.commandIndex >= receipt.commands.length || Buffer.byteLength(log.text) > MAX_LOG_BYTES || sha256(log.text) !== log.sha256)) return schemaError();
  if (receipt.result === 'PASS') {
    const clean = receipt.commands.every(c => c.execution === 'EXECUTED' && c.exitCode === 0 && c.signal === null
      && (c.tests === null || (c.tests.passed > 0 && c.tests.failed === 0 && c.tests.skipped === 0 && c.tests.todo === 0 && c.tests.cancelled === 0)));
    if (!clean || !receipt.commands.some(c => c.tests?.passed > 0)) fail('EVIDENCE_RESULT_CONTRADICTION');
  }
}

function sourceAdmission(receipt, { root, repository, commit }) {
  if (typeof root !== 'string' || repository !== receipt.repository || commit !== receipt.commit) fail('EVIDENCE_SOURCE_MISMATCH');
  try {
    const directory = realpathSync(root);
    const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    const git = args => execFileSync('git', ['-C', directory, ...args], { maxBuffer: MAX_SOURCE_BYTES, timeout: 10000,
      // Avoid ambient replacement objects or local external diff/pager behavior.
      env: { ...gitEnvironment, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (realpathSync(git(['rev-parse', '--show-toplevel']).toString().trim()) !== directory
      || git(['rev-parse', 'HEAD']).toString().trim() !== commit) fail('EVIDENCE_SOURCE_MISMATCH');
    let total = 0;
    for (const source of receipt.sources) {
      const path = resolve(directory, source.path);
      if (realpathSync(path) !== path || !statSync(path).isFile()) fail('EVIDENCE_SOURCE_MISMATCH');
      const size = statSync(path).size; total += size;
      if (size > MAX_SOURCE_BYTES || total > 64 * 1024 * 1024) fail('EVIDENCE_SOURCE_MISMATCH');
      const tree = git(['ls-tree', '-z', commit, '--', source.path]).toString();
      if (!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(tree) || tree.split('\0').length !== 2) fail('EVIDENCE_SOURCE_MISMATCH');
      if (sha256(readFileSync(path)) !== source.sha256 || sha256(git(['show', `${commit}:${source.path}`])) !== source.sha256) fail('EVIDENCE_SOURCE_MISMATCH');
    }
  } catch { fail('EVIDENCE_SOURCE_MISMATCH'); }
}

function trustedPolicy(policy, repository, commit) {
  if (policy === undefined) return { requireSigner: false, keys: new Map() };
  try {
    const exact = (object, fields) => plain(object) && Object.keys(object).sort().join(',') === fields.sort().join(',');
    if (!exact(policy, ['format', 'repository', 'commit', 'requireSigner', 'trustedSigners'])
      || policy.format !== 'p2p-offramp/research-trust/v1' || policy.repository !== repository || policy.commit !== commit
      || typeof policy.requireSigner !== 'boolean' || !Array.isArray(policy.trustedSigners) || policy.trustedSigners.length > 64) fail('EVIDENCE_POLICY');
    const keys = new Map();
    for (const signer of policy.trustedSigners) {
      if (!exact(signer, ['id', 'publicKeyPem']) || typeof signer.id !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(signer.id) || keys.has(signer.id)
        || typeof signer.publicKeyPem !== 'string' || signer.publicKeyPem.length > 1024
        || !/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/.test(signer.publicKeyPem)) fail('EVIDENCE_POLICY');
      const key = createPublicKey(signer.publicKeyPem);
      if (key.asymmetricKeyType !== 'ed25519') fail('EVIDENCE_POLICY');
      keys.set(signer.id, key);
    }
    return { requireSigner: policy.requireSigner, keys };
  } catch { fail('EVIDENCE_POLICY'); }
}

/** Domain-separated complete receipt, including signer identity/algorithm, excluding only signature. */
export function signingBytes(receipt) {
  if (!receipt.attestation) fail('EVIDENCE_SIGNER_REQUIRED');
  const { signature: _signature, ...identity } = receipt.attestation;
  return Buffer.from('p2p-offramp/research-evidence-attestation/v1\n' + canonicalize({ ...receipt, attestation: identity }));
}

/** Admission never re-executes commands. Trust must be supplied independently of receipt contents. */
export function admitReceipt(input, options) {
  const receipt = parseCanonical(input);
  if (!shape(receipt, schema)) return schemaError();
  const secrets = options?.secrets ?? []; checkSecrets(secrets); assertNoSecrets(receipt, secrets);
  assertNoContextualSecrets(receipt, secrets);
  semantics(receipt);
  sourceAdmission(receipt, options ?? {});
  const trust = trustedPolicy(options?.policy, receipt.repository, receipt.commit);
  if (!receipt.attestation && (trust.requireSigner || receipt.result === 'PASS')) fail('EVIDENCE_SIGNER_REQUIRED');
  if (receipt.attestation) {
    const key = trust.keys.get(receipt.attestation.signer);
    if (!key) fail('EVIDENCE_UNTRUSTED_SIGNER');
    if (!verify(null, signingBytes(receipt), key, Buffer.from(receipt.attestation.signature, 'hex'))) fail('EVIDENCE_BAD_SIGNATURE');
  }
  return { result: receipt.result, admission: receipt.attestation ? 'TRUSTED_ATTESTATION' : 'UNAUTHENTICATED_RECORD',
    signer: receipt.attestation?.signer ?? null, executionVerified: false, releaseAuthorized: false };
}
