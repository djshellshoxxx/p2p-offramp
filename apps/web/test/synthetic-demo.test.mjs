import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FROZEN_ERC20_DOCUMENT, FROZEN_NATIVE_DOCUMENT, SYNTHETIC_REGISTRY_JSON, SYNTHETIC_REGISTRY_SHA256 } from '../src/demo/synthetic-data.ts';
import { SYNTHETIC_SAMPLES, freshCoreNativeDocument, syntheticDemoSource } from '../src/demo/synthetic-local.ts';
import { createTradeReviewController } from '../src/trade/review-controller.ts';
import { RegistryService, reviewTermsBytes } from '../../../packages/domain/index.ts';
import { SYNTHETIC_MARKERS } from '../scripts/build.mjs';

// The demo module embeds copies of the synthetic test fixtures (the app may not import test directories).
// These checks keep the copies identical to the fixtures. Synthetic regression data only, not golden vectors.
const dir = new URL('../../../packages/domain/test/fixtures/local-evm-scenario/', import.meta.url);
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const documentFor = set => JSON.stringify({ format: 'p2p-offramp/local-terms-review/v1', terms: scenario.sets[set].terms, privateAgreement: scenario.sets[set].privateAgreementInput }, null, 2) + '\n';

test('embedded registry is byte-identical to the fixture and matches its pinned digest', async () => {
  assert.equal(SYNTHETIC_REGISTRY_JSON, await readFile(new URL('registry.json', dir), 'utf8'));
  assert.equal(SYNTHETIC_REGISTRY_SHA256, scenario.registrySha256);
  assert.equal(createHash('sha256').update(SYNTHETIC_REGISTRY_JSON).digest('hex'), SYNTHETIC_REGISTRY_SHA256);
  assert.ok(SYNTHETIC_MARKERS.every(marker => SYNTHETIC_REGISTRY_JSON.includes(marker) || SYNTHETIC_REGISTRY_SHA256 === marker), 'artifact markers identify the demo data');
});

test('embedded frozen documents equal the scenario term sets', () => {
  assert.equal(FROZEN_NATIVE_DOCUMENT, documentFor('native'));
  assert.equal(FROZEN_ERC20_DOCUMENT, documentFor('erc20'));
});

test('demo source loads only through the digest-first registry and every sample passes the real review', async () => {
  const source = await syntheticDemoSource();
  assert.equal(source.kind, 'ready');
  assert.ok(source.registry instanceof RegistryService);
  assert.deepEqual(SYNTHETIC_SAMPLES.map(sample => sample.id), ['fresh-native', 'frozen-native', 'frozen-erc20']);
  const now = 1_767_225_600n;
  for (const sample of SYNTHETIC_SAMPLES) {
    const result = await reviewTermsBytes(source.registry, await sample.load(now));
    assert.equal(result.ok, true, `${sample.id}: ${JSON.stringify(result)}`);
  }
  const fresh = await reviewTermsBytes(source.registry, await freshCoreNativeDocument(now));
  assert.equal(fresh.value.acceptBeforeSeconds, (now + 3600n).toString());
  assert.equal(fresh.value.escrowExpirySeconds, (now + 3600n + 86_400n).toString());
  assert.deepEqual(fresh.value.unsupportedCapabilities, []);
  assert.equal(fresh.value.amountBaseUnits, '250000000000000000');
});

test('end to end through the controller with the real domain review: accept, reject tampering, keep amounts exact', async () => {
  const trade = createTradeReviewController({ source: syntheticDemoSource, nowSeconds: () => 1_767_225_600n });
  await trade.loadRegistry();
  assert.equal(trade.getSnapshot().registry.kind, 'ready');
  const encode = text => new TextEncoder().encode(text);
  const fileOf = text => ({ size: encode(text).byteLength, arrayBuffer: async () => encode(text).buffer });
  const native = await trade.importFile(fileOf(FROZEN_NATIVE_DOCUMENT));
  assert.equal(native.kind, 'accepted');
  const stored = trade.find(native.localId);
  assert.equal(stored.review.amountBaseUnits, '1000000000000000000');
  assert.equal(stored.review.asset.decimals, 18);
  assert.deepEqual(stored.review.unsupportedCapabilities, ['local-test-cap']);
  const tampered = FROZEN_NATIVE_DOCUMENT.replace('"fiatMinorUnits": "5000"', '"fiatMinorUnits": "5001"');
  assert.notEqual(tampered, FROZEN_NATIVE_DOCUMENT);
  assert.deepEqual(await trade.importFile(fileOf(tampered)), { kind: 'rejected', code: 'AGREEMENT_HASH_MISMATCH' });
  const sample = await trade.importSample('fresh-native');
  assert.equal(sample.kind, 'accepted');
  assert.equal(trade.find(sample.localId).source, 'synthetic-sample');
  assert.equal(trade.getSnapshot().reviews.length, 2);
});
