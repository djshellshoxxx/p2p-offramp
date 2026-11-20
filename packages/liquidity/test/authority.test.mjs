// Optional modules gain no authority over funded trades (D7 / invariant 8): the liquidity model only
// does local accounting. Its reserve/consume/refund/release are simulated ledger moves, never native actions.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as facade from '../index.ts';

const here = new URL('../', import.meta.url);
const sources = ['index.ts', ...readdirSync(new URL('src/', here)).map(name => `src/${name}`)];
const text = name => readFileSync(new URL(name, here), 'utf8');
const MAKER = '0x' + '11'.repeat(20), TAKER = '0x' + '22'.repeat(20), HASH = '0x' + 'ab'.repeat(32);
const options = { domainId: 'local-model', maker: MAKER, assetId: 'native', networkId: 'local-evm', deploymentId: 'local-basic' };
const quote = { quoteId: 'q1', maker: MAKER, taker: TAKER, binding: { chain: 'evm', networkId: 'local-evm', deploymentId: 'local-basic', tradeId: HASH },
  termsHash: HASH, assetId: 'native', principal: '30', fee: '0', nonce: 'n1', expiresAtSeconds: '220' };
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };

test('liquidity: sources import only schemas/domain and use no network, browser, wallet or escrow surface', () => {
  const allowed = new Set(['../../domain/index.ts', '../../schemas/index.ts']);
  for (const name of sources) {
    const body = text(name);
    for (const match of body.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`\n]+)\1/g)) {
      const specifier = match[2];
      assert.ok(specifier.startsWith('./') || allowed.has(specifier), `${name} imports ${specifier}`);
    }
    assert.doesNotMatch(body, /\b(?:fetch|WebSocket|XMLHttpRequest|Worker|SharedWorker|EventSource|localStorage|sessionStorage|indexedDB|navigator|window|document|ethereum|solana)\b/, `${name} touches a browser/provider global`);
  }
});

test('liquidity: the public surface is two diagnostic functions and the model has no executor method', () => {
  assert.deepEqual(Object.keys(facade).sort(), ['createLiquidityReference', 'inspectVaultAccounting']);
  const model = ok(facade.createLiquidityReference(options, { readContext: () => ({ active: true, chainTimeSeconds: '100' }) }));
  assert.deepEqual(Object.keys(model).sort(), ['apply', 'close', 'observeQuote', 'view']);
});

test('liquidity: a full simulated lifecycle never calls any port but readContext and every output is diagnostic-only data', () => {
  const calls = [];
  const trap = name => () => { calls.push(name); throw new Error(name); };
  const ports = { readContext: () => ({ active: true, chainTimeSeconds: '100' }), fund: trap('fund'), release: trap('release'), refund: trap('refund'), send: trap('send') };
  const created = facade.createLiquidityReference(options, ports);
  const model = created.ok ? created.value : facade.createLiquidityReference(options, { readContext: ports.readContext }).value;
  const outputs = [
    model.apply({ kind: 'deposit', actor: MAKER, amount: '100', received: '100' }),
    model.observeQuote(quote),
    model.apply({ kind: 'reserve', actor: TAKER, quote, outcome: 'applied' }),
    model.apply({ kind: 'consume', actor: TAKER, quoteId: 'q1', termsHash: HASH, amount: '30', outcome: 'applied' }),
    model.apply({ kind: 'refund', quoteId: 'q1', returned: '30' }),
  ];
  outputs.forEach(ok);
  const seen = [...outputs.map(ok), model.view()];
  const walk = (value, path) => {
    assert.notEqual(typeof value, 'function', `function value at ${path}`);
    if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) {
      assert.doesNotMatch(key, /^(?:tx|txHash|transaction|signature|permit|calldata|intent|approval|authorization)$/i, `authority-like field ${path}.${key}`);
      walk(inner, `${path}.${key}`);
    }
  };
  seen.forEach((value, index) => walk(value, `out${index}`));
  for (const value of [model.view(), ok(model.observeQuote(quote))]) {
    assert.equal(value.diagnosticOnly, true); assert.equal(value.economicAuthority, false); assert.equal(value.nativeReservationStatus, 'unavailable');
  }
  assert.deepEqual(calls, [], 'no fund/release/refund/send port was ever invoked');
});

test('liquidity: refund and release cannot act on a quote that was never consumed (no funded trade, no authority)', () => {
  const model = ok(facade.createLiquidityReference(options, { readContext: () => ({ active: true, chainTimeSeconds: '100' }) }));
  ok(model.apply({ kind: 'deposit', actor: MAKER, amount: '100', received: '100' }));
  const unreserved = model.view();
  for (const command of [{ kind: 'refund', quoteId: 'q1', returned: '30' }, { kind: 'release', quoteId: 'q1' }]) {
    assert.equal(model.apply(command).ok, false); assert.deepEqual(model.view(), unreserved);
  }
  ok(model.apply({ kind: 'reserve', actor: TAKER, quote, outcome: 'applied' }));
  const reserved = model.view();
  for (const command of [{ kind: 'refund', quoteId: 'q1', returned: '30' }, { kind: 'release', quoteId: 'q1' }]) {
    assert.equal(model.apply(command).ok, false, `${command.kind} on a reservation that was not consumed`);
    assert.deepEqual(model.view(), reserved);
  }
  assert.equal(reserved.ledger.reserved, '30'); assert.equal(reserved.ledger.releasedToBuyers, '0');
  assert.equal(model.apply({ kind: 'withdraw', actor: MAKER, amount: '71', outcome: 'applied' }).ok, false, 'reserved principal cannot be withdrawn by the maker');
});
