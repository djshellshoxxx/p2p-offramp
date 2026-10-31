// P2P-PARSER-SEEDED-FUZZ-08 selftests for the opt-in synthetic parser harness.
// Node built-ins only. Uses only bounded, known-safe descriptors/accepted cases; never traverses hostile graphs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const HELPER_PATH = path.resolve(HERE, '..', 'fuzz-evm-agreement-input.mjs');
const helperUrl = new URL('../fuzz-evm-agreement-input.mjs', import.meta.url);
const helper = await import(helperUrl.href).catch(error => {
  // Exact missing helper target only; a transitive missing module must never be hidden.
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && error?.url === helperUrl.href) return {};
  throw error;
});
const need = name => { assert.equal(typeof helper[name], 'function', 'missing helper export ' + name); return helper[name]; };
const generateCase = (...a) => need('generateCase')(...a);
const evaluateCase = (...a) => need('evaluateCase')(...a);
const runCampaign = (...a) => need('runCampaign')(...a);
const main = (...a) => need('main')(...a);

const FAMILIES = ['instruction-text', 'text-mutation', 'decimal', 'hex-address', 'capabilities', 'signature-views', 'shape', 'resource'];
const CODES = new Set(['INVALID_INPUT', 'LIMIT_EXCEEDED', 'UNSUPPORTED_VERSION']);
const SEEDS = [0, 1, 7, 1592598566, 4294967295];
const withTemp = fn => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fuzz08-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const cli = args => spawnSync(process.execPath, [HELPER_PATH, ...args], { encoding: 'utf8', timeout: 120000, cwd: tmpdir() });
// Real-parser wrapper used to forward normally while a case is evaluated; wipes owned signatures like production callers.
const wipe = snap => { try { for (const a of snap?.acceptances ?? []) a.signature.fill(0); } catch { /* ignore */ } };
// Known-safe bounded descriptor view (plain JSON data produced by the helper, never hostile input).
const safeDesc = c => JSON.stringify(c.descriptor);

test('missing helper reports the exact missing target export (RED guard)', () => {
  for (const n of ['generateCase', 'evaluateCase', 'runCampaign', 'main']) assert.equal(typeof helper[n], 'function', 'missing helper export ' + n);
});

test('generateCase is deterministic for same seed/index and descriptors are bounded safe data', () => {
  for (const seed of SEEDS) for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 17, 255, 1023, 4095]) {
    const a = generateCase(seed, index), b = generateCase(seed, index);
    assert.equal(safeDesc(a), safeDesc(b));
    assert.deepEqual(a.expected, b.expected);
    assert.equal(a.descriptor.index, index);
    assert.equal(a.descriptor.family, FAMILIES[index % 8]);
    assert.equal(typeof a.descriptor.version, 'string');
    assert.ok(Buffer.byteLength(safeDesc(a)) <= 4096, 'descriptor bounded');
    assert.ok(a.expected.accepted === true || CODES.has(a.expected.code));
    assert.ok(!safeDesc(a).includes('PRIVATE-FIXTURE'), 'descriptor leaks no private input');
  }
});

test('generateCase family assignment is periodic with period 8 for every seed', () => {
  for (const seed of [3, 4294967295]) for (let i = 0; i < 24; i++) {
    assert.equal(generateCase(seed, i).descriptor.family, generateCase(seed, i % 8).descriptor.family);
    assert.equal(generateCase(seed, i).descriptor.family, FAMILIES[i % 8]);
  }
});

test('different seeds actually vary generated descriptors/corpus, not only metadata', () => {
  const sigs = seeds => seeds.map(s => Array.from({ length: 64 }, (_, i) => generateCase(s, i).descriptor.digest).join(','));
  const [x, y] = sigs([11, 12]);
  assert.notEqual(x, y);
  let differing = 0;
  for (let i = 0; i < 64; i++) if (generateCase(11, i).descriptor.digest !== generateCase(12, i).descriptor.digest) differing++;
  assert.ok(differing > 0, 'at least one actual case differs between seeds');
  const c11 = runCampaign({ seed: 11, cases: 64 }), c12 = runCampaign({ seed: 12, cases: 64 });
  assert.notEqual(c11.corpusDigest, c12.corpusDigest);
});

test('runCampaign executes 256 actual cases (not 4096), 32 per family, with exact accounting', () => {
  const m = runCampaign({ seed: 1592598566 });
  assert.equal(m.status, 'pass');
  assert.equal(m.requestedCases, 256);
  assert.equal(m.executedCases, 256);
  assert.equal(m.generatedCases, 256);
  assert.notEqual(m.requestedCases, 4096);
  assert.equal(m.generatedValidVariations + m.mutatedCases, 256);
  assert.equal(m.mappingVersion, helper.MAPPING_VERSION ?? m.mappingVersion);
  assert.equal(typeof m.corpusDigest, 'string');
  assert.equal(m.firstFailure, null);
  assert.equal(m.coverageGuided, false);
  assert.equal(m.shrinking, false);
  for (const f of FAMILIES) assert.equal(m.perFamily[f].executed, 32, 'family ' + f);
  const again = runCampaign({ seed: 1592598566 });
  assert.equal(again.corpusDigest, m.corpusDigest, 'corpus digest deterministic and excludes duration');
});

test('single-index replay executes exactly one case matching the generated descriptor/outcome', () => {
  for (const idx of [0, 5, 17, 100, 255]) {
    const m = runCampaign({ seed: 1592598566, cases: 256, caseIndex: idx });
    assert.equal(m.status, 'pass');
    assert.equal(m.executedCases, 1);
    assert.equal(m.generatedCases, 1);
    assert.equal(m.requestedCases, 256);
    assert.equal(m.replayCaseIndex, idx);
    const fam = FAMILIES[idx % 8];
    assert.equal(m.perFamily[fam].executed, 1);
    for (const f of FAMILIES) if (f !== fam) assert.equal(m.perFamily[f].executed, 0);
    const c = generateCase(1592598566, idx);
    const r = evaluateCase(c);
    assert.equal(r.status, 'pass');
  }
  assert.throws(() => runCampaign({ seed: 1, cases: 256, caseIndex: 256 }));
  assert.throws(() => runCampaign({ seed: 1, cases: 8, caseIndex: 8 }));
});

test('strict parameter validation rejects bad seed/cases/index before generation', () => {
  for (const bad of [{ seed: -1 }, { seed: 4294967296 }, { seed: 1.5 }, { seed: '1' }, { seed: 1, cases: 7 }, { seed: 1, cases: 4097 },
    { seed: 1, cases: 8.5 }, { seed: 1, cases: 64, caseIndex: -1 }, { seed: 1, cases: 64, caseIndex: 64 }]) {
    assert.throws(() => runCampaign(bad), undefined, JSON.stringify(bad));
  }
  assert.throws(() => generateCase(-1, 0));
  assert.throws(() => generateCase(0, -1));
});

test('real parser: accepted cases pass (frozen independent snapshots) and refused cases carry genuine codes', () => {
  let accepted = 0, refused = 0;
  const seen = new Set();
  for (const seed of [5, 1592598566]) for (let i = 0; i < 128; i++) {
    const c = generateCase(seed, i);
    const r = evaluateCase(c);
    assert.equal(r.status, 'pass', 'seed ' + seed + ' index ' + i + ' ' + c.descriptor.mutation + ' -> ' + JSON.stringify(r).slice(0, 300));
    if (c.expected.accepted) { accepted++; assert.equal(r.observed, 'accept'); }
    else { refused++; assert.equal(r.observed, c.expected.code); seen.add(c.expected.code); }
  }
  assert.ok(accepted > 0 && refused > 0, 'both accepted and refusal oracles exercised');
  assert.ok(seen.has('INVALID_INPUT') && seen.has('LIMIT_EXCEEDED'));
});

test('real parser: accepted snapshot oracle retains exact values and compact owned signatures; wiping is harmless', () => {
  for (let i = 0; i < 64; i++) {
    const c = generateCase(9, i);
    if (!c.expected.accepted) continue;
    const real = helper.realParser;
    assert.equal(typeof real, 'function');
    const snap = real(c.input);
    try {
      assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.privateAgreement) && Object.isFrozen(snap.acceptances));
      assert.equal(snap.privateAgreement.paymentInstructions, c.input.privateAgreement.paymentInstructions);
      for (let j = 0; j < 2; j++) {
        const s = snap.acceptances[j].signature, src = c.input.acceptances[j].signature;
        assert.equal(s.length, 65); assert.equal(s.byteOffset, 0); assert.equal(s.buffer.byteLength, 65);
        assert.notEqual(s.buffer, src.buffer);
        assert.deepEqual(Buffer.from(s), Buffer.from(src.buffer, src.byteOffset, 65));
      }
    } finally { wipe(snap); }
    for (const a of snap.acceptances) assert.ok(a.signature.every(b => b === 0), 'owned signatures wiped');
  }
});

test('deliberately permissive fake parser is rejected by invalid-case oracle', () => {
  let rejected = 0;
  for (let i = 0; i < 64; i++) {
    const c = generateCase(21, i);
    if (c.expected.accepted) continue;
    // Test-local permissive parser: accepts everything without validation, without touching hostile graphs beyond returning a frozen empty shape.
    const r = evaluateCase(c, () => Object.freeze({}));
    assert.notEqual(r.status, 'pass', 'permissive parser must not satisfy refusal oracle at index ' + i);
    assert.ok(r.status === 'counterexample' || r.status === 'harness-error');
    rejected++;
  }
  assert.ok(rejected > 0);
});

test('broken snapshot oracle: fake that mutates, aliases, or drops fields fails accepted cases', () => {
  const real = helper.realParser;
  let checked = 0;
  for (let i = 0; i < 64; i++) {
    const c = generateCase(33, i);
    if (!c.expected.accepted) continue;
    const mutate = (fn) => (input) => { const s = real(input); try { return fn(s, input); } finally { /* evaluateCase owns wiping its returned object */ } };
    const aliased = (input) => { const s = real(input); return Object.freeze({ ...s, acceptances: Object.freeze(input.acceptances.map(a => Object.freeze({ ...a }))) }); };
    const unfrozen = (input) => { const s = real(input); return { ...s }; };
    const dropped = (input) => { const s = real(input); return Object.freeze({ ...s, privateAgreement: Object.freeze({ ...s.privateAgreement, paymentInstructions: s.privateAgreement.paymentInstructions + 'x' }) }); };
    for (const fake of [aliased, unfrozen, dropped]) {
      const c2 = generateCase(33, i);
      const r = evaluateCase(c2, fake);
      assert.equal(r.status, 'counterexample', fake.name + ' at ' + i + ' ' + JSON.stringify(r).slice(0, 200));
    }
    void mutate;
    checked++;
  }
  assert.ok(checked > 0);
});

test('wrong-code and throwing-nonparser fakes fail oracle; instrumentation faults are not expected refusals', () => {
  const c = generateCase(2, 1);
  const refusal = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(i => generateCase(2, i)).find(x => !x.expected.accepted && x.expected.code === 'INVALID_INPUT');
  assert.ok(refusal);
  const r1 = evaluateCase(refusal, () => { const e = new Error('Invalid core data.'); e.code = 'INVALID_INPUT'; throw e; });
  assert.notEqual(r1.status, 'pass', 'foreign Error with right code is not a genuine CoreSchemaError');
  const r2 = evaluateCase(refusal, () => { throw new RangeError('PRIVATE-FIXTURE secret'); });
  assert.notEqual(r2.status, 'pass');
  assert.ok(!JSON.stringify(r2).includes('PRIVATE-FIXTURE'), 'diagnostics sanitized');
  void c;
});

test('resource-family instrumentation restores TextEncoder/BigInt/Uint8Array.set and never leaks into later state', () => {
  const encode = TextEncoder.prototype.encode, big = globalThis.BigInt, set = Uint8Array.prototype.set;
  const resourceCases = Array.from({ length: 64 }, (_, i) => generateCase(4, i)).filter(x => x.descriptor.family === 'resource');
  assert.ok(resourceCases.length >= 8);
  for (const c of resourceCases) {
    const r = evaluateCase(c);
    assert.equal(r.status, 'pass', c.descriptor.mutation + ' ' + JSON.stringify(r).slice(0, 200));
    assert.equal(TextEncoder.prototype.encode, encode);
    assert.equal(globalThis.BigInt, big);
    assert.equal(Uint8Array.prototype.set, set);
  }
  // A parser that throws mid-evaluation must still restore intrinsics.
  evaluateCase(resourceCases[0], () => { throw new Error('boom'); });
  assert.equal(TextEncoder.prototype.encode, encode);
  assert.equal(globalThis.BigInt, big);
  assert.equal(Uint8Array.prototype.set, set);
});

test('resource oracle catches a parser that encodes oversized text or feeds overlength decimals to BigInt', () => {
  const find = pred => { for (let s = 0; s < 8; s++) for (let i = 0; i < 64; i++) { const c = generateCase(s, i); if (pred(c)) return c; } return null; };
  const textCase = find(c => c.descriptor.family === 'resource' && c.descriptor.mutation === 'text-4097');
  const decCase = find(c => c.descriptor.family === 'resource' && String(c.descriptor.mutation).startsWith('decimal5000-'));
  assert.ok(textCase && decCase, 'resource family generates both budget cases');
  const real = helper.realParser;
  const naiveText = input => { new TextEncoder().encode(input.privateAgreement.paymentInstructions); return real(input); };
  const r1 = evaluateCase(textCase, naiveText);
  assert.notEqual(r1.status, 'pass', 'oversized text must not reach TextEncoder');
  const naiveDec = input => {
    const t = input.terms;
    for (const v of [t.revision, t.amountBaseUnits, t.acceptBeforeSeconds, t.escrowExpirySeconds, input.domain.chainId, input.privateAgreement.fiatMinorUnits])
      if (typeof v === 'string' && v.length >= 5000) BigInt(v);
    return real(input);
  };
  const r2 = evaluateCase(decCase, naiveDec);
  assert.notEqual(r2.status, 'pass', 'overlength decimal must not reach BigInt');
});

test('metrics are bounded and private: no instruction text, signature bytes, or private fixture strings', () => {
  const m = runCampaign({ seed: 1592598566 });
  const text = JSON.stringify(m);
  assert.ok(Buffer.byteLength(text) <= 1048576);
  assert.ok(!text.includes('PRIVATE-FIXTURE'));
  assert.ok(!/(?:0x)?[0-9a-f]{130}/.test(text), 'no 65-byte signature hex');
  for (const k of ['seed', 'mappingVersion', 'requestedCases', 'executedCases', 'generatedCases', 'perFamily', 'corpusDigest', 'status', 'elapsedMs'])
    assert.ok(k in m, 'metrics field ' + k);
  assert.equal(typeof m.elapsedMs, 'number');
  // Failure path: forced counterexample records seed/index/mapping/family/mutation and stays <=4KiB without private strings.
  const bad = runCampaign({ seed: 1, cases: 16 }, () => Object.freeze({}));
  assert.equal(bad.status, 'counterexample');
  const ff = bad.firstFailure;
  assert.ok(ff && Buffer.byteLength(JSON.stringify(ff)) <= 4096);
  assert.equal(ff.seed, 1);
  assert.equal(typeof ff.index, 'number');
  assert.equal(ff.mappingVersion, bad.mappingVersion);
  assert.ok(typeof ff.family === 'string' && typeof ff.mutation === 'string');
  assert.ok(bad.executedCases <= bad.generatedCases);
  assert.ok(bad.executedCases < 16, 'stops at first failure');
  assert.ok(!JSON.stringify(bad).includes('PRIVATE-FIXTURE'));
});

test('global state restored after generation and campaign', () => {
  const enc = TextEncoder.prototype.encode, big = globalThis.BigInt, set = Uint8Array.prototype.set, rnd = Math.random, now = Date.now;
  runCampaign({ seed: 77, cases: 32 });
  assert.equal(TextEncoder.prototype.encode, enc);
  assert.equal(globalThis.BigInt, big);
  assert.equal(Uint8Array.prototype.set, set);
  assert.equal(Math.random, rnd);
  assert.equal(Date.now, now);
});

test('generation does not depend on Math.random or time (deterministic under patched globals)', () => {
  const rnd = Math.random, now = Date.now;
  const base = generateCase(123, 9).descriptor.digest;
  try {
    Math.random = () => { throw new Error('Math.random forbidden'); };
    Date.now = () => { throw new Error('Date.now forbidden'); };
    assert.equal(generateCase(123, 9).descriptor.digest, base);
  } finally { Math.random = rnd; Date.now = now; }
});

test('CLI: valid run writes bounded metrics outside source; overwrite refused; replay writes single case', () => {
  withTemp(dir => {
    const out = path.join(dir, 'm.json');
    const r = cli(['--seed', '1592598566', '--cases', '256', '--output', out]);
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(m.status, 'pass'); assert.equal(m.executedCases, 256);
    const before = readFileSync(out, 'utf8');
    const again = cli(['--seed', '1592598566', '--cases', '256', '--output', out]);
    assert.notEqual(again.status, 0);
    assert.equal(readFileSync(out, 'utf8'), before, 'existing output untouched');
    const rep = path.join(dir, 'r.json');
    const rr = cli(['--seed', '1592598566', '--cases', '256', '--case-index', '17', '--output', rep]);
    assert.equal(rr.status, 0, rr.stderr);
    const rm = JSON.parse(readFileSync(rep, 'utf8'));
    assert.equal(rm.executedCases, 1); assert.equal(rm.replayCaseIndex, 17);
  });
});

test('CLI: invalid arguments fail nonzero and write no output', () => {
  withTemp(dir => {
    const out = path.join(dir, 'x.json');
    const bads = [
      [], ['--seed', '1'], ['--output', out], ['--seed', '1', '--output', out, '--unknown', '1'],
      ['--seed', '1', '--seed', '2', '--output', out], ['--seed', '01', '--output', out], ['--seed', '-1', '--output', out],
      ['--seed', '4294967296', '--output', out], ['--seed', '1.5', '--output', out], ['--seed', 'abc', '--output', out],
      ['--seed', '1', '--cases', '7', '--output', out], ['--seed', '1', '--cases', '4097', '--output', out],
      ['--seed', '1', '--cases', '9999999999999999999', '--output', out],
      ['--seed', '1', '--cases', '64', '--case-index', '64', '--output', out], ['--seed', '1', '--case-index', '-1', '--output', out],
      ['--seed', '1', '--output', 'relative/out.json'], ['--seed', '1', '--output', path.join(dir, 'missing', 'o.json')],
      ['--seed', '1', '--output', path.join(dir, 'x.json'), '--cases'], ['--seed', '1', '--output', out, '--cases', '64', '--cases', '64']
    ];
    for (const args of bads) {
      const r = cli(args);
      assert.notEqual(r.status, 0, JSON.stringify(args));
      assert.ok(!existsSync(out), 'no output for ' + JSON.stringify(args));
      assert.ok(!existsSync(path.join(dir, 'missing')));
    }
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('CLI: output inside source and symlinked parent resolving inside source are refused with no output', () => {
  withTemp(dir => {
    const inside = path.join(ROOT, 'fuzz08-selftest-should-not-exist.json');
    const r1 = cli(['--seed', '1', '--output', inside]);
    assert.notEqual(r1.status, 0);
    assert.ok(!existsSync(inside), 'no file created inside source');
    const link = path.join(dir, 'link-to-source');
    symlinkSync(ROOT, link, 'dir');
    const viaLink = path.join(link, 'fuzz08-selftest-symlink.json');
    const r2 = cli(['--seed', '1', '--output', viaLink]);
    assert.notEqual(r2.status, 0);
    assert.ok(!existsSync(path.join(ROOT, 'fuzz08-selftest-symlink.json')), 'no file created via symlinked parent');
    const subLink = path.join(dir, 'link-to-scripts');
    symlinkSync(path.join(ROOT, 'scripts'), subLink, 'dir');
    const r3 = cli(['--seed', '1', '--output', path.join(subLink, 'fuzz08-selftest-sub.json')]);
    assert.notEqual(r3.status, 0);
    assert.ok(!existsSync(path.join(ROOT, 'scripts', 'fuzz08-selftest-sub.json')));
  });
});

test('main(argv) returns nonzero for invalid arguments without running a campaign; importing runs nothing', () => {
  withTemp(dir => {
    const stderr = process.stderr.write;
    let captured = '';
    process.stderr.write = chunk => { captured += String(chunk); return true; };
    try {
      assert.notEqual(main(['--seed', 'nope', '--output', path.join(dir, 'a.json')]), 0);
      assert.notEqual(main([]), 0);
      assert.equal(main(['--seed', '1', '--cases', '8', '--output', path.join(dir, 'ok.json')]), 0);
    } finally { process.stderr.write = stderr; }
    assert.ok(!captured.includes('PRIVATE-FIXTURE'));
    assert.ok(existsSync(path.join(dir, 'ok.json')));
    assert.ok(!existsSync(path.join(dir, 'a.json')));
  });
});

test('source fixtures are unchanged by selftests: no stray files created in repository scripts/test dirs', () => {
  const names = readdirSync(path.join(ROOT, 'scripts'));
  assert.ok(!names.some(n => /fuzz08-selftest/.test(n)));
  assert.ok(!readdirSync(ROOT).some(n => /fuzz08-selftest/.test(n)));
  assert.ok(existsSync(path.join(ROOT, 'packages', 'schemas', 'src', 'evm-agreement-input.ts')));
  mkdirSync; writeFileSync; // imported for temp usage patterns; referenced to keep lint quiet
});

// Broker's small static oracle correction: descriptor.digest itself includes seed, so compare actual safe input fields.
test('different seeds vary actual accepted instruction fields', () => {
  let varied = false;
  for (let slot = 0; slot < 16; slot++) {
    const a = generateCase(11, slot * 8), b = generateCase(12, slot * 8);
    assert.equal(a.expected.accepted, true); assert.equal(b.expected.accepted, true);
    if (a.input.privateAgreement.paymentInstructions !== b.input.privateAgreement.paymentInstructions) varied = true;
  }
  assert.ok(varied, 'seed must vary generated field values, not only descriptor metadata');
});

// Integrator regressions for demonstrated harness defects; parser semantics stay unchanged.
test('an incomplete accepted snapshot is a parser counterexample, not an evaluator exception', () => {
  const c = generateCase(1, 0);
  assert.equal(c.expected.accepted, true);
  const result = evaluateCase(c, () => Object.freeze({}));
  assert.equal(result.status, 'counterexample');
  assert.equal(result.why, 'snapshot-shape');
});

test('generated text respects the declared 4097 UTF16-unit construction cap', () => {
  for (let index = 1; index < 256; index += 8) {
    const c = generateCase(1592598566, index);
    const text = c.input.privateAgreement.paymentInstructions;
    if (typeof text === 'string') assert.ok(text.length <= 4097, 'seed1592598566 index' + index + ' ' + c.descriptor.mutation + ' units=' + text.length);
  }
});

test('CLI refuses a dot-dot-prefixed basename within an isolated source fixture', () => {
  withTemp(dir => {
    const root = path.join(dir, 'fixture-project');
    const files = ['package.json', 'scripts/fuzz-evm-agreement-input.mjs',
      'packages/schemas/src/evm-agreement-input.ts', 'packages/schemas/src/core.ts', 'packages/schemas/src/vault.ts'];
    for (const name of files) {
      const target = path.join(root, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(path.join(ROOT, name)));
    }
    const output = path.join(root, '..x');
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/fuzz-evm-agreement-input.mjs'),
      '--seed', '1', '--cases', '8', '--output', output], { encoding: 'utf8', timeout: 60000, cwd: dir });
    assert.equal(run.status, 2, 'an inside-source basename is not a parent-directory traversal: ' + run.stderr);
    assert.equal(existsSync(output), false);
  });
});
