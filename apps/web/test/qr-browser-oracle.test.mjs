import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPublicEnvelope } from '../../../scripts/lib/qr-browser-fixture.mjs';

test('browser fixture text oracle independently recovers frozen envelopes with the complete 13-character prefix', async () => {
  const matrices = JSON.parse(await readFile(new URL('../../../packages/qr/test/fixtures/vectors.json', import.meta.url), 'utf8')).vectors.qrSymbol.matrices;
  const envelopes = matrices.filter(symbol => symbol.name.startsWith('envelope-'));
  assert.ok(envelopes.length >= 10);
  for (const symbol of envelopes) {
    const decoded = readPublicEnvelope(symbol.text);
    assert.equal(decoded.protocol, 'p2p-offramp-qr'); assert.equal(decoded.v, 1);
  }
  assert.throws(() => readPublicEnvelope('https://example.test/'));
  assert.throws(() => readPublicEnvelope(envelopes[0].text + '\n'));
  assert.throws(() => readPublicEnvelope(envelopes[0].text.replace(':1:', ':2:')));
});
