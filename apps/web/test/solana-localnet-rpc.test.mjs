import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSolanaLocalRpc } from '../src/solana-localnet/rpc.ts';
import { parseSolanaCommand } from '../src/solana-localnet/validation.ts';
import { MAX_BACKUP_BYTES } from '../../../packages/schemas/index.ts';

test('RPC transport preserves actual genesis and fences allowed methods, replies and disposal', async t => {
  const seen = []; let mode = 'normal';
  const server = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    const value = JSON.parse(text); seen.push(value);
    const reply = { jsonrpc: '2.0', id: mode === 'wrong-id' ? value.id + 1 : value.id, result: 'actual-validator-genesis' };
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const rpc = createSolanaLocalRpc(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(await rpc.request({ method: 'getGenesisHash', params: [] }), 'actual-validator-genesis');
  await assert.rejects(rpc.request({ method: 'requestAirdrop', params: [] })); assert.equal(seen.length, 1);
  mode = 'wrong-id'; await assert.rejects(rpc.request({ method: 'getGenesisHash' }));
  rpc.dispose(); await assert.rejects(rpc.request({ method: 'getGenesisHash' })); assert.equal(seen.length, 2);
});
test('Worker command parser refuses funding, generic signing, hidden fields and malformed recovery input', () => {
  const id = 'ab'.repeat(32);
  for (const input of [{ type: 'fund', tradeId: id }, { type: 'review.prepare', action: 'fund', tradeId: id },
    { type: 'rpc', method: 'sendTransaction' }, { type: 'wallet.sign', message: 'anything' },
    { type: 'profile.lock', extra: true }, { type: 'recovery.import', text: '{}', role: 'operator' }]) assert.throws(() => parseSolanaCommand(input));
  assert.deepEqual(parseSolanaCommand({ type: 'review.prepare', action: 'release', tradeId: id, fiatReceiptConfirmed: true }),
    { type: 'review.prepare', action: 'release', tradeId: id, fiatReceiptConfirmed: true });
});
test('restore input is bounded before copying and cannot invoke a caller-owned iterator', () => {
  let iterated = 0;
  const bytes = new Uint8Array([1, 2, 3]);
  Object.defineProperty(bytes, Symbol.iterator, { value() { iterated++; throw Error('caller iterator'); } });
  const command = { type: 'backup.restore', bytes, sourcePassphrase: 'source', destinationPassphrase: 'destination' };
  assert.deepEqual(parseSolanaCommand(command).bytes, new Uint8Array([1, 2, 3])); assert.equal(iterated, 0);
  const oversized = new Uint8Array(MAX_BACKUP_BYTES + 1);
  Object.defineProperty(oversized, Symbol.iterator, { value() { iterated++; throw Error('caller iterator'); } });
  assert.throws(() => parseSolanaCommand({ ...command, bytes: oversized })); assert.equal(iterated, 0);
});
