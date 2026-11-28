import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64url, projectRecoveryReferences } from '../index.ts';
import { parseSolanaIntent } from '../../chain-solana/src/intent.ts';
import { solanaJournalRecordId, SOLANA_VAULT_JOURNAL_FORMAT } from '../../chain-solana/src/vaultjournal.ts';
import { connected, setupClient } from '../../chain-solana/test/lifecycle-support.mjs';
import { ok } from '../../chain-solana/test/support.mjs';

const rows = [], env = setupClient('native', {
  journal: { hooks: { after: record => rows.push(structuredClone(record)) } },
});
try { ok(await env.client.release(env.trade, await connected(env, 'seller'))); }
finally { env.client.dispose(); }

for (const defect of ['duplicate account key', 'fee payer used as program']) {
  test(`independent review: native recovery keeps a ${defect} structurally unsupported`, () => {
    // Use the original unsigned preparation: rejection cannot be attributed to a stale signature.
    const prepared = structuredClone(rows[0]), bytes = Buffer.from(prepared.message, 'base64');
    assert.ok(bytes[3] > 1 && bytes[3] < 128, 'fixture has one-byte compact key count');
    const keyStart = 4, instructions = keyStart + bytes[3] * 32 + 32;
    assert.equal(bytes[instructions], 1, 'fixture has one instruction');
    if (defect === 'duplicate account key') bytes.copy(bytes, keyStart + 32, keyStart, keyStart + 32);
    else bytes[instructions + 1] = 0;
    prepared.message = bytes.toString('base64');
    assert.equal(prepared.signature, null);
    assert.throws(() => parseSolanaIntent(prepared), 'native structural parser refuses this message');
    const record = { id: solanaJournalRecordId(prepared.binding), kind: 'journal', schemaVersion: 1,
      payload: encodeBase64url(new TextEncoder().encode(JSON.stringify({ format: SOLANA_VAULT_JOURNAL_FORMAT,
        binding: prepared.binding, revision: 1, records: [prepared] }))) };
    const before = JSON.stringify(record), page = projectRecoveryReferences([record], 0, 0);
    assert.equal(page.authority, 'unverified-offline-reference');
    assert.equal(page.unsupported, 1);
    assert.equal(page.items.length, 0);
    assert.equal(JSON.stringify(record), before, 'malformed encrypted payload remains unchanged');
  });
}
