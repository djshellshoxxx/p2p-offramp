// Optional modules gain no authority over funded trades (D7 / invariant 8): this package only evaluates
// proposals against the existing G05 broker and G14 registry. It cannot spend, release, refund or deny exits.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as facade from '../index.ts';
import { createExtensionRegistry } from '../../extensions/index.ts';
import { makeBroker } from '../../relay/test/support/harness.mjs';

const here = new URL('../', import.meta.url);
const sources = ['index.ts', ...readdirSync(new URL('src/', here)).map(name => `src/${name}`)];
const text = name => readFileSync(new URL(name, here), 'utf8');
const hash = 'a'.repeat(64), ref = { name: 'local:display', protocolVersion: 1, schemaHash: hash };
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };

test('privacy-policy: sources import only schemas, domain, extensions and transport facades, with no wallet, exchange, escrow or network surface', () => {
  const allowed = new Set(['../../domain/index.ts', '../../schemas/index.ts', '../../extensions/index.ts', '../../transport/index.ts']);
  for (const name of sources) {
    const body = text(name);
    for (const match of body.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`\n]+)\1/g)) {
      const specifier = match[2];
      assert.ok(specifier.startsWith('./') || allowed.has(specifier), `${name} imports ${specifier}`);
    }
    assert.doesNotMatch(body, /\b(?:fetch|WebSocket|XMLHttpRequest|Worker|SharedWorker|EventSource|localStorage|sessionStorage|indexedDB|navigator|window|document|ethereum|solana)\b/, `${name} touches a browser/provider global`);
  }
});

test('privacy-policy: the public surface is policy parse/diff/evaluate/mode only, with no spend, release or refund function', () => {
  assert.deepEqual(Object.keys(facade).sort(), ['POLICY_LIMITS', 'createModeController', 'createPolicyRuntime', 'diffPolicy', 'evaluatePolicy', 'parsePolicy', 'validatePrivacyPlan']);
});

test('privacy-policy: an evaluation that can prepare is still configuration only (economicAuthority false, fixed fields)', async () => {
  const { broker } = makeBroker({ mode: 'ordinary', coverage: 'direct' });
  const manifest = { format: 'p2p-offramp-extension', version: 1, id: 'local-display', protocolVersion: 1, coreApiVersion: 1, capabilities: [ref.name], schemaHashes: [hash] };
  const instance = { manifest, initialize: async () => ({ ok: true, value: undefined }), dispose: async () => {} };
  const native = ok(createExtensionRegistry({ entries: [{ instance }], registeredCapabilities: [ref.name] }));
  try {
    const catalog = [{ ...ref, moduleId: 'local-display', profileId: null, mandatory: false, dependencies: [], conflicts: [], channels: [], unbrokeredPaths: [], dataClasses: ['private'] }];
    const runtime = ok(facade.createPolicyRuntime({ broker, registry: native, catalog, unbrokeredPaths: [] }));
    const policy = { format: 'p2p-offramp-feature-policy', version: 1, policyId: 'local-test', revision: 0, required: [ref], optional: [], disabled: [], mode: 'ordinary', profileIds: [] };
    const evaluation = ok(facade.evaluatePolicy(policy, runtime));
    assert.equal(evaluation.economicAuthority, false);
    assert.deepEqual(Object.keys(evaluation).sort(), ['blockedPaths', 'brokerGeneration', 'canPrepare', 'economicAuthority', 'nodes', 'policy', 'registryGeneration']);
    for (const value of Object.values(evaluation)) assert.notEqual(typeof value, 'function');
    assert.equal(facade.evaluatePolicy(policy, { ...runtime, available: true, coverage: 'verified-private' }).ok, false, 'imported status never substitutes for a native runtime');
  } finally { await native.disposeAll(); broker.dispose(); }
});

test('privacy-policy: authority flag is only ever false in source', () => {
  const body = sources.map(text).join('\n');
  assert.doesNotMatch(body, /economicAuthority\s*:\s*(?:true|boolean)/);
  assert.match(body, /economicAuthority:\s*false/);
});
