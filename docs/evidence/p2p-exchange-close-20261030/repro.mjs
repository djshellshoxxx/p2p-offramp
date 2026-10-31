// Isolated close-lifecycle evidence, not cryptographic qualification.
// Native source imports with explicit fixed fixtures; never evaluate source text.
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';

const fixtures = new URL('./lifecycle-fixtures.mjs', import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '../../domain/index.ts' || specifier === '../../nostr-crypto/index.ts') {
    return { url: fixtures, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { createTermsExchange } = await import('../../../packages/exchange/src/exchange.ts');
const self = 'a'.repeat(64), seller = 'b'.repeat(64), order = 'c'.repeat(64);
try {
  for (const operation of ['take', 'receive']) {
    let release, entered;
    const reached = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const provider = { publicKey: async () => { entered(); await gate; return self; } };
    const ex = createTermsExchange({ provider, selfPublicKey: self, registry: {}, hashTerms: () => '', now: () => 100,
      ads: { revalidate: () => ({ ok: true, ad: { author: seller,
        ad: { maker: seller, orderId: order, expiresAtSeconds: '200', amountMin: '1', amountMax: '100' } } }) } });
    const pending = operation === 'take'
      ? ex.take('fixture', '0x' + '1'.repeat(40), new Uint8Array(32))
      : ex.receive({}, new Uint8Array(32));
    await reached; ex.close(); release();
    const result = await pending;
    console.log(JSON.stringify({ operation, result, sessionCount: ex.sessionCount }));
    assert.deepEqual(result, { ok: false, code: 'CLOSED' });
    assert.equal(ex.sessionCount, 0);
  }
} finally { hooks.deregister(); }
