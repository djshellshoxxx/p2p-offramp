import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalnetSendMarked } from '../../../scripts/lib/localnet-send-evidence.mjs';

const profileId = '11'.repeat(16), account = `0x${'aa'.repeat(20)}`, escrow = `0x${'bb'.repeat(20)}`, token = `0x${'cc'.repeat(20)}`;
function fixture(action = 'fund') {
  const prepared = { v: 1, chainId: '31337', from: account, to: action === 'approve' ? token : escrow,
    data: action === 'approve' ? '0x095ea7b3' : '0x12345678', value: action === 'approve' ? '0' : '1000', nonce: '17', preparedAtBlock: '42' };
  const intent = { version: 2, sendMarkedAt: 1001, originProfileId: profileId, intentId: 'AB'.repeat(21) + 'A',
    binding: { chain: 'evm', networkId: 'local-evm', deploymentId: 'local-escrow', tradeId: 'dd'.repeat(32) },
    account, action, state: 'broadcast-unknown', walletGeneration: 2, expectedEscrowState: 'absent',
    preparedRequest: JSON.stringify(prepared), submission: { chain: 'evm', hash: null, nonce: '17' },
    replacementOf: null, createdAt: 1000, updatedAt: 1001 };
  // Independent EIP-1193 expectation: do not use the production request projector to check itself.
  const transaction = { from: account, to: prepared.to, data: prepared.data, value: action === 'approve' ? '0x0' : '0x3e8', nonce: '0x11', chainId: '0x7a69' };
  return { intent, transaction };
}

test('durable-send evidence accepts the complete native and token approval requests without changing them', () => {
  for (const action of ['fund', 'approve']) {
    const { intent, transaction } = fixture(action), before = structuredClone({ intent, transaction });
    const historical = { ...intent, state: 'finalized' };
    assert.equal(assertLocalnetSendMarked([historical, intent], transaction, profileId), intent);
    assert.deepEqual({ intent, transaction }, before);
  }
});

for (const [field, replacement] of Object.entries({ from: token, to: token, data: '0xffffffff', value: '0x3e9', nonce: '0x12', chainId: '0x1' })) {
  test(`durable-send evidence rejects a substituted ${field} even when every other field matches`, () => {
    const { intent, transaction } = fixture();
    assert.throws(() => assertLocalnetSendMarked([intent], { ...transaction, [field]: replacement }, profileId));
  });
}

test('durable-send evidence rejects an omitted field or an extra wallet field', () => {
  const { intent, transaction } = fixture();
  for (const field of Object.keys(transaction)) {
    const omitted = { ...transaction }; delete omitted[field];
    assert.throws(() => assertLocalnetSendMarked([intent], omitted, profileId), `missing ${field}`);
  }
  assert.throws(() => assertLocalnetSendMarked([intent], { ...transaction, gas: '0x5208' }, profileId));
});

test('durable-send evidence refuses ambiguous markers and markers belonging to an older profile', () => {
  const { intent, transaction } = fixture();
  assert.throws(() => assertLocalnetSendMarked([intent, { ...intent, intentId: 'other' }], transaction, profileId));
  assert.throws(() => assertLocalnetSendMarked([intent], transaction, '22'.repeat(16)));
});

test('durable-send evidence requires persisted pre-send provenance and matching account and nonce metadata', () => {
  const { intent, transaction } = fixture();
  const invalid = [
    { ...intent, version: 1 }, { ...intent, sendMarkedAt: null }, { ...intent, sendMarkedAt: 999 },
    { ...intent, sendMarkedAt: 1002 }, { ...intent, state: 'prepared' }, { ...intent, state: 'pending' },
    { ...intent, account: token }, { ...intent, submission: { ...intent.submission, nonce: '18' } },
    { ...intent, submission: { ...intent.submission, hash: `0x${'ee'.repeat(32)}` } },
  ];
  for (const candidate of invalid) assert.throws(() => assertLocalnetSendMarked([candidate], transaction, profileId));
});
