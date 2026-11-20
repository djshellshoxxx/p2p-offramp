/** Fixture-only oracle: runs in Node against the ACTUAL encrypted IndexedDB row before the proxy forwards a send. */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { decodeBase64url, parseStrictJsonBytes, sameBinding } from '../../packages/schemas/index.ts';
import { parseSolanaIntent } from '../../packages/chain-solana/src/intent.ts';
import { parseRecoveryDocument } from '../../packages/chain-solana/src/recovery.ts';
import { base58Encode, decodeKey } from '../../contracts/solana/vectors/derive.mjs';

export function readSolanaVaultRecords(snapshot) {
  const intents = [], documents = [];
  for (const record of snapshot.records) {
    if (record.kind !== 'journal' && record.kind !== 'trade') continue;
    const raw = parseStrictJsonBytes(decodeBase64url(record.payload, 1, 262144), 262144);
    assert.equal(record.schemaVersion, 1);
    if (record.kind === 'journal') {
      assert.equal(raw.format, 'p2p-offramp/solana/vault-journal/v1');
      const expectedId = createHash('sha256').update(JSON.stringify([raw.format, raw.binding.chain,
        raw.binding.networkId, raw.binding.deploymentId, raw.binding.tradeId])).digest('hex').slice(0, 32);
      assert.equal(record.id, expectedId); assert.ok(raw.records.length > 0);
      assert.ok(Number.isSafeInteger(raw.revision) && raw.revision >= raw.records.length);
      for (const input of raw.records) {
        const intent = parseSolanaIntent(input); assert.equal(sameBinding(raw.binding, intent.binding), true); intents.push(intent);
      }
    } else {
      assert.equal(raw.format, 'p2p-offramp/solana-local-recovery/v1');
      const document = parseRecoveryDocument(raw.document);
      const expectedId = createHash('sha256').update(`${raw.format}\0${document.termsHash}`).digest('hex').slice(0, 32);
      assert.equal(record.id, expectedId); assert.match(raw.originProfileId, /^[0-9a-f]{32}$/);
      assert.ok(['seller', 'buyer'].includes(raw.role)); documents.push({ document, role: raw.role, originProfileId: raw.originProfileId });
    }
  }
  assert.equal(new Set(intents.map(r => r.intentId)).size, intents.length);
  return { intents, documents };
}

export function assertSolanaSendMarked(intents, base64Wire, profileId, pins, seenSignatures) {
  assert.equal(typeof base64Wire, 'string'); assert.ok(base64Wire.length <= 1644);
  const wire = Buffer.from(base64Wire, 'base64'); assert.equal(wire.toString('base64'), base64Wire);
  assert.ok(wire.length <= 1232 && wire.length > 100); assert.equal(wire[0], 1, 'one legacy signature');
  const signatureBytes = wire.subarray(1, 65), message = wire.subarray(65), signature = base58Encode(signatureBytes);
  const matching = intents.filter(record => record.state === 'sendMarked' && record.signature === signature &&
    record.message === message.toString('base64'));
  assert.equal(matching.length, 1, 'exactly one durable marker precedes these exact signed bytes');
  const marker = parseSolanaIntent(matching[0]);
  assert.equal(marker.originProfileId, profileId, 'the current profile owns the new physical broadcast');
  assert.equal(marker.genesisHash, pins.genesisHash); assert.equal(marker.programId, pins.programId);
  assert.equal(marker.programDataSha256, pins.programDataSha256);
  assert.ok(Number.isSafeInteger(marker.sendMarkedAt) && marker.sendMarkedAt >= marker.createdAt && marker.sendMarkedAt <= marker.updatedAt);
  assert.equal(marker.outcome, null); assert.ok(['release', 'refund', 'payout'].includes(marker.action), 'browser never funds');
  // Node's independent OpenSSL Ed25519 implementation verifies the actual physical wire, not a UI projection.
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(decodeKey(marker.feePayer))]), type: 'spki', format: 'der' });
  assert.equal(verify(null, message, publicKey, signatureBytes), true, 'physical transaction has the recorded role signature');
  assert.equal(seenSignatures.has(signature), false, 'one physical attempt per signed transaction; no retries or resends');
  seenSignatures.add(signature);
  return { intentId: marker.intentId, tradeId: marker.binding.tradeId, action: marker.action, signature,
    profileId, originProfileId: marker.originProfileId, durableState: marker.state, sendMarkedAt: marker.sendMarkedAt,
    messageSha256: createHash('sha256').update(message).digest('hex'), replacementOf: marker.replacementOf };
}
