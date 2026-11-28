// Reproduces every frozen vector of the independent Python implementation (contracts/solana/vectors/acceptance.py)
// byte for byte, then runs the TypeScript verifier, decoder and replay ledger on the same inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { encodeSolanaTerms } from '../../domain/index.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import {
  decodeSolanaPeerAcceptance, decodeSolanaTermsConsent, solanaPeerAcceptanceRequest, solanaTermsConsentRequest,
  verifySolanaPeerAcceptance,
} from '../src/acceptance.ts';
import { bindSolanaTrade } from '../src/bind.ts';
import { SolanaPeerReplayLedger } from '../src/replay.ts';
import { COMPILED_GENESIS, DEPLOYMENT_ID, makeRegistry, MINT, NETWORK_ID, ok, PROGRAM } from './support.mjs';

const FIXTURE = new URL('../../../contracts/solana/vectors/peer-acceptance-v1.json', import.meta.url);
const text = readFileSync(FIXTURE, 'utf8');
const vectors = JSON.parse(text);
const hexOf = bytes => Buffer.from(bytes).toString('hex');
const fromHex = value => Uint8Array.from(Buffer.from(value, 'hex'));
const registry = makeRegistry();
const trades = Object.fromEntries(Object.entries(vectors.trades).map(([name, trade]) => {
  const binding = { chain: 'solana', networkId: trade.networkId, deploymentId: trade.deploymentId,
    tradeId: trade.termsHash };
  return [name, ok(bindSolanaTrade(registry, binding, trade.terms))];
}));
const seeds = Object.fromEntries(Object.entries(vectors.wallets)
  .map(([name, wallet]) => [name, fromHex(wallet.seedHex)]));
/** Fixture proof (hex fields) to the API shape; absent fields stay absent. */
function proofOf(raw) {
  const out = {};
  if ('statement' in raw) out.statement = raw.statement;
  if ('termsSignatureHex' in raw) out.termsSignature = fromHex(raw.termsSignatureHex);
  if ('acceptanceSignatureHex' in raw) out.acceptanceSignature = fromHex(raw.acceptanceSignatureHex);
  return out;
}
const code = result => (result.ok ? 'ok' : result.error.code);

test('fixture identity: format, generator, test-only labels and the README hash', () => {
  assert.equal(vectors.format, 'p2p-offramp/solana/peer-acceptance-vectors/v1');
  assert.equal(vectors.generator.file, 'contracts/solana/vectors/acceptance.py');
  assert.match(vectors.warning, /TEST-ONLY/);
  const readme = readFileSync(new URL('../../../contracts/solana/vectors/README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(createHash('sha256').update(text).digest('hex')), 'README records the fixture SHA-256');
  assert.equal(vectors.constants.genesisHash, COMPILED_GENESIS);
  assert.equal(vectors.constants.programId, PROGRAM);
  assert.equal(vectors.constants.mint, MINT);
  assert.equal(vectors.constants.networkId, NETWORK_ID);
  assert.equal(vectors.constants.deploymentId, DEPLOYMENT_ID);
});

test('G16 terms, termsHash and wallet keys match the independent encoder', () => {
  for (const [name, trade] of Object.entries(vectors.trades)) {
    const raw = encodeSolanaTerms(trade.terms);
    assert.equal(hexOf(raw), trade.g16Hex, name);
    assert.equal(createHash('sha256').update(raw).digest('hex'), trade.termsHash, name);
    assert.equal(trades[name].termsHash, trade.termsHash, name);
  }
  for (const [name, wallet] of Object.entries(vectors.wallets)) {
    assert.equal(hexOf(ed25519.getPublicKey(seeds[name])), hexOfKey(wallet.publicKey), name);
  }
});
function hexOfKey(base58) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const character of base58) value = value * 58n + BigInt(alphabet.indexOf(character));
  return value.toString(16).padStart(64, '0');
}

test('positive vectors: messages, texts and signatures reproduce byte for byte and verify', () => {
  for (const item of vectors.positive) {
    const trade = trades[item.trade], statement = item.proof.statement;
    const terms = ok(solanaTermsConsentRequest(trade));
    assert.equal(hexOf(terms.message), item.termsMessageHex, item.id);
    assert.equal(terms.text, item.termsText, item.id);
    assert.deepEqual([...terms.requiredSigners], [trade.terms.seller, trade.terms.buyer]);
    const acceptance = ok(solanaPeerAcceptanceRequest(trade, { role: statement.role,
      ownMessagingKey: statement.ownMessagingKey, counterpartyMessagingKey: statement.counterpartyMessagingKey,
      notAfterSeconds: statement.notAfterSeconds }));
    assert.equal(hexOf(acceptance.message), item.acceptanceMessageHex, item.id);
    assert.equal(acceptance.text, item.acceptanceText, item.id);
    assert.deepEqual({ ...acceptance.statement }, statement, item.id);
    const seed = seeds[statement.role];
    assert.equal(hexOf(ed25519.sign(terms.message, seed)), item.proof.termsSignatureHex, item.id);
    assert.equal(hexOf(ed25519.sign(acceptance.message, seed)), item.proof.acceptanceSignatureHex, item.id);
    const verified = ok(verifySolanaPeerAcceptance(trade, item.context, proofOf(item.proof)));
    assert.equal(verified.termsMessageSha256, item.expect.termsMessageSha256, item.id);
    assert.equal(verified.acceptanceMessageSha256, item.expect.acceptanceMessageSha256, item.id);
    assert.equal(verified.effectiveNotAfterSeconds, item.expect.effectiveNotAfterSeconds, item.id);
    assert.equal(verified.candidateOnly, true);
    assert.equal(verified.economicPreparationAllowed, false);
  }
});

test('variant vectors verify on their own (the ledger refuses some of them later)', () => {
  for (const item of vectors.variants) {
    const verified = ok(verifySolanaPeerAcceptance(trades[item.trade], item.context, proofOf(item.proof)));
    assert.equal(verified.effectiveNotAfterSeconds, item.expect.effectiveNotAfterSeconds, item.id);
  }
});

test('negative vectors: same refusal code as the independent verifier', () => {
  assert.ok(vectors.negative.length >= 40);
  for (const item of vectors.negative) {
    if (item.signedMessageHex) {
      // Our Ed25519 signer reproduces the foreign signature, so the refusal is about the bytes, not the key.
      const signature = item.proof[`${item.signedSlot}SignatureHex`];
      assert.equal(hexOf(ed25519.sign(fromHex(item.signedMessageHex), seeds[item.signedBy])), signature, item.id);
    }
    const result = verifySolanaPeerAcceptance(trades[item.trade], item.context, proofOf(item.proof));
    assert.equal(code(result), item.expect, `${item.id}: ${item.description}`);
  }
});

test('mixed-order keys and R: the library accepts the signatures, the strict policy refuses them', () => {
  const items = vectors.negative.filter(row => row.cofactoredValid);
  assert.deepEqual(items.map(row => row.id),
    ['mixed-order-wallet-key', 'mixed-order-r', 'identity-r', 'mixed-order-wallet-key-all-equations-hold']);
  for (const item of items) {
    const trade = trades[item.trade], wallet = fromHex(hexOfKey(trade.terms.seller)), statement = item.proof.statement;
    const message = ok(solanaPeerAcceptanceRequest(trade, { role: 'seller', ownMessagingKey: statement.ownMessagingKey,
      counterpartyMessagingKey: statement.counterpartyMessagingKey,
      notAfterSeconds: statement.notAfterSeconds })).message;
    const signature = fromHex(item.proof.acceptanceSignatureHex);
    assert.equal(ed25519.verify(signature, message, wallet, { zip215: false }), true, `${item.id}: noble strict mode`);
    assert.equal(ed25519.verify(signature, message, wallet, { zip215: true }), true, `${item.id}: ZIP-215`);
    assert.equal(code(verifySolanaPeerAcceptance(trade, item.context, proofOf(item.proof))), 'UNAUTHORIZED');
  }
});

test('decoding vectors: strict decoders agree with the independent decoder', () => {
  for (const item of vectors.decoding) {
    const decode = item.kind === 'terms' ? decodeSolanaTermsConsent : decodeSolanaPeerAcceptance;
    const result = decode(fromHex(item.messageHex));
    assert.equal(code(result), item.expect, item.id);
    if (item.expect === 'ok') assert.deepEqual({ ...result.value }, item.decoded, item.id);
  }
});

class Store {
  rows = new Map();
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row) { this.rows.set(row.profileId, structuredClone(row)); }
  async compareAndSwap(expected, next) {
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw Error('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next));
  }
}
test('ledger scenarios: the real encrypted ledger gives the model results step by step', async t => {
  const proofs = new Map([...vectors.positive, ...vectors.variants].map(item => [item.id, item]));
  for (const scenario of vectors.ledger) {
    const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
    const session = ok(await vault.create('synthetic solana replay vector passphrase'));
    let clock = '0';
    const ledger = new SolanaPeerReplayLedger(vault, session, { nowSeconds: () => clock });
    t.after(() => { ledger.dispose(); vault.dispose(); });
    for (const step of scenario.steps) {
      clock = step.clockSeconds;
      let actual;
      if (step.op === 'admit') {
        const item = proofs.get(step.vector), { nowSeconds: _, ...context } = item.context;
        const result = await ledger.admit(trades[item.trade], context, proofOf(item.proof));
        actual = result.ok ? result.value.status : result.error.code;
      } else if (step.op === 'tombstone') {
        const result = await ledger.tombstone(trades[step.trade]);
        actual = result.ok ? 'ok' : result.error.code;
      } else {
        const result = await ledger.status(trades[step.trade]);
        actual = result.ok ? { ...result.value } : result.error.code;
      }
      assert.deepEqual(actual, step.expect, `${scenario.id}: ${JSON.stringify(step)}`);
    }
  }
});

test('unit-test helpers derive the same TEST-ONLY keys as the Python generator', async () => {
  const support = await import('./acceptance-support.mjs');
  const wallets = Object.fromEntries(Object.entries(vectors.wallets).map(([name, w]) => [name, w.publicKey]));
  assert.deepEqual(support.WALLETS, wallets);
  assert.deepEqual(support.KEYS, vectors.messagingKeys);
});
