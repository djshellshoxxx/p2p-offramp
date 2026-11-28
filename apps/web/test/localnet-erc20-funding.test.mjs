import assert from 'node:assert/strict';
import test from 'node:test';
import { erc20FundingReady, nextErc20Approval, readErc20FundingState } from '../src/localnet/erc20-funding.ts';
import { parseLocalnetCommand } from '../src/localnet/validation.ts';
import { selectorOf } from '../../../packages/wallet/localnet.ts';

const token = `0x${'11'.repeat(20)}`, seller = `0x${'22'.repeat(20)}`, spender = `0x${'33'.repeat(20)}`;
const hash = byte => `0x${byte.repeat(32)}`, anchor = { height: '10', hash: hash('aa'), timestampSeconds: '1000', codeKeccak256: 'dd'.repeat(32) };
const headers = { '0xa': { number: '0xa', hash: anchor.hash, timestamp: '0x3e8' }, '0xb': { number: '0xb', hash: hash('bb'), timestamp: '0x3e9' },
  '0x0': { number: '0x0', hash: hash('cc'), timestamp: '0x0' } };
const word = value => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
function fixture({ allowance = '0', latestAllowance = allowance, balance = '100', latestBalance = balance, mutate = (_, output) => output } = {}) {
  const requests = [], controller = new AbortController(); let valid = true;
  const options = { anchor, genesisHash: hash('cc'), token, seller, spender, signal: controller.signal,
    assertCurrent() { if (!valid) throw new Error('revoked'); },
    async request(request) {
      requests.push(structuredClone(request));
      const { method, params } = request;
      let output;
      if (method === 'eth_chainId') output = '0x7a69';
      else if (method === 'eth_getBlockByNumber') output = headers[params[0] === 'latest' ? '0xb' : params[0]];
      else if (method === 'eth_getCode') output = '0x6000';
      else if (method === 'eth_call') {
        assert.equal(params[0].to, token);
        assert.equal(params[1].requireCanonical, true);
        const latest = params[1].blockHash === hash('bb');
        if (params[0].data.startsWith(`0x${selectorOf('allowance(address,address)')}`)) {
          assert.equal(params[0].data, `0xdd62ed3e${seller.slice(2).padStart(64, '0')}${spender.slice(2).padStart(64, '0')}`);
          output = word(latest ? latestAllowance : allowance);
        } else output = word(latest ? latestBalance : balance);
      } else assert.fail(`unexpected read ${method}`);
      return mutate(request, output);
    } };
  return { options, requests, controller, revoke() { valid = false; } };
}

test('ERC20 funding reads exact owner/spender at canonical hashes and resets existing non-exact allowance', async () => {
  for (const [allowance, proposed, fundable] of [['0', '25', false], ['10', '0', false], ['50', '0', false], ['25', null, true]]) {
    const f = fixture({ allowance }); const result = await readErc20FundingState(f.options);
    assert.deepEqual(result, { allowanceBaseUnits: allowance, balanceBaseUnits: '100', settled: true });
    assert.equal(nextErc20Approval('25', result), proposed); assert.equal(erc20FundingReady('25', result), fundable);
    const queries = f.requests.filter(request => ['eth_call', 'eth_getCode'].includes(request.method));
    assert.equal(queries.length, 6);
    assert.ok(queries.every(request => [anchor.hash, hash('bb')].includes(request.params[1].blockHash) && request.params[1].requireCanonical === true));
    assert.ok(f.requests.every(request => !/sign|send|requestAccounts/i.test(request.method)));
  }
});
test('latest allowance can veto but never substitute for finalized allowance; both balances constrain funding', async () => {
  for (const inputs of [{ allowance: '0', latestAllowance: '25' }, { allowance: '25', latestAllowance: '0' },
    { allowance: '25', balance: '1', latestBalance: '100' }, { allowance: '25', balance: '100', latestBalance: '1' }]) {
    const result = await readErc20FundingState(fixture(inputs).options);
    assert.equal(nextErc20Approval('25', result), null); assert.equal(erc20FundingReady('25', result), false);
  }
});
test('malformed token ABI, missing or oversized code and reorged headers fail without fallback', async () => {
  for (const mutate of [
    (request, output) => request.method === 'eth_call' ? '0x01' : output,
    (request, output) => request.method === 'eth_call' ? `${output}00` : output,
    (request, output) => request.method === 'eth_getCode' ? '0x' : output,
    (request, output) => request.method === 'eth_getCode' ? `0x${'11'.repeat(24_577)}` : output,
    (request, output) => request.method === 'eth_getBlockByNumber' && request.params[0] === '0xa' ? { ...output, hash: hash('ee') } : output,
    (request, output) => request.method === 'eth_getBlockByNumber' && request.params[0] === '0xb' ? { ...output, timestamp: '0x3ea' } : output,
  ]) {
    const f = fixture({ mutate }); await assert.rejects(readErc20FundingState(f.options), error => error.code === 'INTEGRITY_FAILURE');
  }
});
test('chain/genesis changes and revoked owner stop token state publication', async () => {
  for (const mutate of [
    (request, output) => request.method === 'eth_chainId' ? '0x1' : output,
    (request, output) => request.method === 'eth_getBlockByNumber' && request.params[0] === '0x0' ? { ...output, hash: hash('ee') } : output,
  ]) await assert.rejects(readErc20FundingState(fixture({ mutate }).options), error => error.code === 'WRONG_CHAIN');
  const cancelled = fixture(); cancelled.controller.abort(); await assert.rejects(readErc20FundingState(cancelled.options)); assert.equal(cancelled.requests.length, 0);
  const revoked = fixture({ mutate(request, output) { if (request.method === 'eth_call') revoked.revoke(); return output; } });
  await assert.rejects(readErc20FundingState(revoked.options)); assert.equal(revoked.requests.filter(request => request.method === 'eth_call').length, 1);
});
test('token response accessors are not executed and code changes between anchors disable approval', async () => {
  let accessed = false;
  const f = fixture({ mutate(request, output) { return request.method === 'eth_getBlockByNumber' && request.params[0] === 'latest' ?
    { ...output, get timestamp() { accessed = true; return '0x3e9'; } } : output; } });
  await assert.rejects(readErc20FundingState(f.options)); assert.equal(accessed, false);
  const changed = fixture({ mutate(request, output) { return request.method === 'eth_getCode' && request.params[1].blockHash === hash('bb') ? '0x6001' : output; } });
  const state = await readErc20FundingState(changed.options); assert.equal(state.settled, false); assert.equal(nextErc20Approval('25', state), null);
});
test('approval commands cannot choose a token, spender, amount or raw transaction', () => {
  const command = { type: 'review.prepare', action: 'approve', tradeId: 'aa'.repeat(32) };
  assert.deepEqual(parseLocalnetCommand(command), command);
  for (const extra of [{ token }, { spender }, { amountBaseUnits: '9999999' }, { data: '0x095ea7b3' }, { approvalAmount: '25' }])
    assert.throws(() => parseLocalnetCommand({ ...command, ...extra }));
});
