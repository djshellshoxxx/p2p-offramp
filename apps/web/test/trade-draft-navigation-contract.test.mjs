import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../../packages/domain/index.ts';
import { createTradeReviewController } from '../src/trade/review-controller.ts';
import { createTradeDraftController } from '../src/trade/draft-controller.ts';

// Independent integration probes for the generation used by the maintained form's navigation guard.
// Actual registry, canonical draft builder and both controllers run; no browser or native persistence is claimed.
async function setup(t) {
  const bytes = new Uint8Array(await readFile(new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
  const registry = new RegistryService();
  assert.equal((await registry.load(bytes, createHash('sha256').update(bytes).digest('hex'))).ok, true);
  const listeners = new Set(); let sequence = 0, scope = 1;
  const port = {
    getSnapshot: () => ({ state: 'unlocked' }), selectionScope: () => scope,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    select() { scope++; for (const listener of listeners) listener(); },
  };
  const trade = createTradeReviewController({
    source: async () => ({ kind: 'ready', label: 'synthetic-demo', registry, samples: [] }),
    nowSeconds: () => 1700000000n, randomBytes: length => new Uint8Array(length).fill(++sequence),
  });
  await trade.loadRegistry();
  const drafts = createTradeDraftController(port, trade);
  t.after(() => { drafts.dispose(); trade.dispose(); });
  const values = {
    networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native',
    amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: '2',
    seller: `0x${'12'.repeat(20)}`, buyer: `0x${'34'.repeat(20)}`, paymentInstructions: '',
    acceptBeforeSeconds: '1700000600', escrowExpirySeconds: '1700007200',
  };
  for (const [field, value] of Object.entries(values)) drafts.edit(field, value);
  return { port, drafts, trade };
}

test('real accepted draft review retains the generation required by current-page navigation', async t => {
  const { drafts, trade } = await setup(t);
  const submittedGeneration = drafts.getSnapshot().generation;
  const id = await drafts.review({ amounts: true, identities: true, emptyInstructions: true });
  assert.equal(typeof id, 'string');
  assert.equal(drafts.getSnapshot().unlocked, true);
  assert.equal(drafts.getSnapshot().generation, submittedGeneration);
  assert.equal(trade.find(id)?.source, 'local-draft');
  assert.equal(trade.find(id)?.savedId, null);
});

test('real profile selection retirement invalidates the accepted draft before a late navigation guard', async t => {
  const { port, drafts, trade } = await setup(t);
  const submittedGeneration = drafts.getSnapshot().generation;
  const id = await drafts.review({ amounts: true, identities: true, emptyInstructions: true });
  assert.equal(typeof id, 'string');
  const retainedBytes = trade.find(id).bytes;
  port.select();
  assert.notEqual(drafts.getSnapshot().generation, submittedGeneration);
  assert.equal(trade.find(id), null);
  assert.equal(retainedBytes.every(byte => byte === 0), true);
});
