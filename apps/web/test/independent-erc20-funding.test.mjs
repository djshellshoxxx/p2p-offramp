/** Independent lifetime/canonical-query review of the localnet ERC-20 observer. No wallet authority or network is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readErc20FundingState } from '../src/localnet/erc20-funding.ts';

const hash = octet => `0x${octet.repeat(32)}`;
const anchor = { height: '10', hash: hash('aa'), timestampSeconds: '1000', codeKeccak256: 'dd'.repeat(32) };
const token = `0x${'11'.repeat(20)}`, seller = `0x${'22'.repeat(20)}`, spender = `0x${'33'.repeat(20)}`;
const headers = {
  '0xa': { number: '0xa', hash: anchor.hash, timestamp: '0x3e8' },
  '0xb': { number: '0xb', hash: hash('bb'), timestamp: '0x3e9' },
  '0x0': { number: '0x0', hash: hash('cc'), timestamp: '0x0' },
};
const word = quantity => `0x${BigInt(quantity).toString(16).padStart(64, '0')}`;
function fixture(intercept = (_, reply) => reply) {
  const calls = [], controller = new AbortController(); let current = true;
  const options = { anchor, token, seller, spender, genesisHash: hash('cc'), signal: controller.signal,
    assertCurrent() { assert.ok(current, 'owner revoked'); },
    async request(request) {
      calls.push(structuredClone(request));
      let reply;
      if (request.method === 'eth_chainId') reply = '0x7a69';
      else if (request.method === 'eth_getBlockByNumber') reply = headers[request.params[0] === 'latest' ? '0xb' : request.params[0]];
      else if (request.method === 'eth_getCode') reply = '0x6000';
      else if (request.method === 'eth_call') reply = request.params[0].data.startsWith('0xdd62ed3e') ? word(0) : word(100);
      else assert.fail(`unexpected RPC: ${request.method}`);
      return intercept(request, reply, calls.length);
    } };
  return { options, calls, controller, revoke() { current = false; } };
}

test('independent ERC20 observer binds both token state tuples to exact canonical block hashes', async () => {
  const f = fixture();
  const result = await readErc20FundingState(f.options);
  assert.deepEqual(result, { allowanceBaseUnits: '0', balanceBaseUnits: '100', settled: true });
  const tokenCalls = f.calls.filter(call => call.method === 'eth_call' || call.method === 'eth_getCode');
  assert.equal(tokenCalls.length, 6);
  for (let i = 0; i < tokenCalls.length; i++) assert.deepEqual(tokenCalls[i].params[1], { blockHash: i < 3 ? anchor.hash : hash('bb'), requireCanonical: true });
  for (const call of tokenCalls.filter(call => call.method === 'eth_call')) assert.equal(call.params[0].to, token);
  assert.ok(f.calls.every(call => !/send|sign|requestAccounts/.test(call.method)));
});

test('independent ERC20 observer stops after cancellation at every RPC completion boundary', async () => {
  // Eleven independent read boundaries: latest header; finalized/latest token code, allowance and balance;
  // both canonical-header rereads; chain ID; genesis. No later read or result may escape cancellation.
  for (let cutoff = 1; cutoff <= 11; cutoff++) {
    const f = fixture((_request, reply, index) => { if (index === cutoff) f.controller.abort(); return reply; });
    await assert.rejects(readErc20FundingState(f.options), error => error.code === 'CANCELLED');
    assert.equal(f.calls.length, cutoff);
  }
});

test('independent ERC20 observer refuses dispatch if a provider getter revokes ownership', async () => {
  const f = fixture(), request = f.options.request;
  Object.defineProperty(f.options, 'request', { get() { f.revoke(); return request; } });
  await assert.rejects(readErc20FundingState(f.options), /owner revoked/);
  assert.equal(f.calls.length, 0);
});

test('independent ERC20 observer stops after revocation inside a hostile header descriptor trap', async () => {
  const f = fixture((request, reply) => request.method === 'eth_getBlockByNumber' && request.params[0] === 'latest'
    ? new Proxy(reply, { getOwnPropertyDescriptor(target, key) { f.revoke(); return Reflect.getOwnPropertyDescriptor(target, key); } }) : reply);
  await assert.rejects(readErc20FundingState(f.options), /owner revoked/);
  assert.equal(f.calls.length, 1);
});

test('independent ERC20 observer bounds a hanging read and never resumes RPC after timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve;
  const f = fixture((_request, reply) => new Promise(complete => { resolve = () => complete(reply); }));
  const result = readErc20FundingState(f.options);
  const refused = assert.rejects(result, error => error.code === 'TIMEOUT');
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(10_000); await refused;
  resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.calls.length, 1);
});
