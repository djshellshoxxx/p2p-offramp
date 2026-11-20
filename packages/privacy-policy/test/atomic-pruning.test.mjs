// Native G05/G14 fixtures: final policy consistency, not a production provider grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRuntime, evaluatePolicy, createModeController } from '../index.ts';
import { createExtensionRegistry } from '../../extensions/index.ts';
import { makeBroker } from '../../relay/test/support/harness.mjs';

const hash = 'a'.repeat(64);
const reference = name => ({ name, protocolVersion: 1, schemaHash: hash });
const primary = reference('local:primary');
const companion = reference('local:companion');
const absent = reference('local:absent');
const leaf = reference('local:leaf');
const consumer = reference('local:consumer');
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const node = (ref, moduleId, dependencies = []) => ({
  ...ref, moduleId, profileId: null, mandatory: false, dependencies, conflicts: [],
  channels: [], unbrokeredPaths: [], dataClasses: ['private'],
});

async function observe({ required = false, cascade = false, retainCompanion = false } = {}) {
  const { broker } = makeBroker({ mode: 'ordinary' });
  const started = [];
  const catalog = [
    node(primary, 'paired', cascade ? [leaf.name] : []),
    node(companion, 'paired'),
    node(absent, 'missing', [companion.name]),
    ...(cascade ? [node(leaf, 'leaf'), node(consumer, 'consumer', [primary.name])] : []),
  ];
  const instance = (id, capabilities) => ({
    manifest: {
      format: 'p2p-offramp-extension', version: 1, id, protocolVersion: 1,
      coreApiVersion: 1, capabilities, schemaHashes: [hash],
    },
    initialize: async () => { started.push(id); return { ok: true, value: undefined }; },
    dispose: async () => {},
  });
  const createRegistry = (generation = 0, isCurrent) => createExtensionRegistry({
    generation, ...(isCurrent ? { isCurrent } : {}),
    registeredCapabilities: catalog.map(value => value.name),
    entries: [
      { instance: instance('paired', [primary.name, companion.name]) },
      ...(cascade ? [
        { instance: instance('leaf', [leaf.name]) },
        { instance: instance('consumer', [consumer.name]) },
      ] : []),
    ],
  });
  const policy = {
    format: 'p2p-offramp-feature-policy', version: 1, policyId: 'atomic-pruning', revision: 0,
    required: required ? [primary] : [],
    optional: [absent, ...(!required ? [primary] : []), ...(cascade ? [consumer] : []), ...(retainCompanion ? [companion] : [])],
    disabled: [], mode: 'ordinary', profileIds: [],
  };
  const registry = ok(createRegistry());
  const controller = createModeController({ broker, catalog, unbrokeredPaths: [], createRegistry });
  try {
    const runtime = ok(createPolicyRuntime({ broker, registry, catalog, unbrokeredPaths: [] }));
    const evaluation = ok(evaluatePolicy(policy, runtime));
    const result = await controller.requestMode(policy);
    return { evaluation, result, snapshot: controller.inspectMode(), started: [...started] };
  } finally {
    await controller.dispose();
    await registry.disposeAll();
    broker.dispose();
  }
}

function states(evaluation) {
  return Object.fromEntries(evaluation.nodes.map(value => [value.name, value.state]));
}

test('orphan pruning refuses a required atomic primary before native initialization', async () => {
  const observed = await observe({ required: true });
  assert.deepEqual(observed.started, [], 'the paired native module must not initialize a pruned companion');
  assert.equal(observed.evaluation.canPrepare, false);
  assert.equal(observed.evaluation.economicAuthority, false);
  assert.deepEqual(states(observed.evaluation), {
    'local:absent': 'blocked', 'local:companion': 'disabled', 'local:primary': 'blocked',
  });
  assert.equal(observed.result.ok, false);
  assert.equal(observed.result.error.code, 'UNSUPPORTED_PROVIDER');
  assert.equal(observed.snapshot.preparationFrozen, true);
});

test('orphan pruning leaves core-only preparation active without a partial optional module', async () => {
  const observed = await observe();
  assert.deepEqual(observed.started, [], 'optional module refusal must still prevent all paired initialization');
  assert.equal(observed.evaluation.canPrepare, true);
  assert.deepEqual(states(observed.evaluation), {
    'local:absent': 'blocked', 'local:companion': 'disabled', 'local:primary': 'blocked',
  });
  const state = ok(observed.result);
  assert.equal(state.state, 'active');
  assert.equal(state.preparationFrozen, false);
  assert.deepEqual(states(state.evaluation), states(observed.evaluation));
});

test('atomic pruning converges through dependent roots and newly orphaned dependencies', async () => {
  const observed = await observe({ cascade: true });
  assert.deepEqual(observed.started, [], 'neither a blocked consumer nor the newly orphaned leaf may initialize');
  assert.equal(observed.evaluation.canPrepare, true);
  assert.deepEqual(states(observed.evaluation), {
    'local:absent': 'blocked', 'local:companion': 'disabled', 'local:consumer': 'blocked',
    'local:leaf': 'disabled', 'local:primary': 'blocked',
  });
  const state = ok(observed.result);
  assert.equal(state.state, 'active');
  assert.equal(state.preparationFrozen, false);
  assert.deepEqual(states(state.evaluation), states(observed.evaluation));
});

test('explicitly retaining both atomic capabilities initializes their native module once', async () => {
  const observed = await observe({ required: true, retainCompanion: true });
  assert.deepEqual(observed.started, ['paired']);
  assert.equal(observed.evaluation.canPrepare, true);
  assert.deepEqual(states(observed.evaluation), {
    'local:absent': 'blocked', 'local:companion': 'enabled', 'local:primary': 'enabled',
  });
  assert.equal(ok(observed.result).preparationFrozen, false);
});
