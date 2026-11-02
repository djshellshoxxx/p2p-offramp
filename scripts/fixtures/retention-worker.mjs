/** Explicit LOCALPROOF composition. Native capabilities and fixture controls never enter the default Worker. */
import { EncryptedVaultService, EncryptedBackupService } from '../../packages/storage/index.ts';
import { IndexedDbVaultStore } from '../../packages/storage/src/idb-vault-store.ts';
import { createVaultWorkerEndpoint } from '../../apps/web/src/runtime/worker-endpoint.ts';
import { createNativeRetentionAuthority } from '../../apps/web/src/retention/native-retention.ts';
import { RegistryService, reviewTermsBytes } from '../../packages/domain/index.ts';
import { MessagingIdentityService } from '../../packages/identity/src/identity-service.ts';
import { createLocalNobleIdentityProvider } from '../../packages/identity/index.ts';
import { createLocalNobleNostrProvider } from '../../packages/nostr-crypto/index.ts';
import { createDurableTradeChat, encodeMessage } from '../../packages/messaging/index.ts';
import { createLifecycleJournal } from '../../packages/domain/src/intent-journal.ts';
import { createEvmTxLifecycle, evmFinalityPolicy } from '../../packages/domain/src/tx-lifecycle.ts';
import { createEip1193ChainReader, escrowCallFor } from '../../packages/wallet/src/evm-submit.ts';
import { evmTermsHash, keccak256 } from '../../packages/wallet/src/evm-terms.ts';
import { buildGetTrade, buildTradeIdOf, decodeTrade, tradeMatchesTerms, buildChainObservation,
  buildPendingWithdrawals } from '../../packages/wallet/src/evm-escrow.ts';
import { parseCanonicalPreparedRequest } from '../../apps/web/src/journey/private-trade.ts';
import { encodeSavedReviewPayload, encodeIntentPayload, decodeIntentPayload, encodeBase64url } from '../../packages/schemas/index.ts';

const good = result => { if (!result.ok) throw Error(result.error.code); return result.value; };
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
let endpoint, vault, selected, configuration, registry, rpcId = 0, writes = 0, journalPutWrites = 0, scope = 0, factories = 0;
const contexts = [];
async function request({ method, params = [] }) {
  const control = new AbortController(), timer = setTimeout(() => control.abort(), 10_000);
  try {
    const response = await fetch('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }), signal: control.signal });
    const text = await response.text(); if (text.length > 262144) throw Error('LIMIT_EXCEEDED');
    const value = JSON.parse(text); if (!response.ok || value.error) throw Error('NATIVE_RPC_FAILED');
    return value.result;
  } finally { clearTimeout(timer); }
}
async function readObservation({ registry, binding, terms, domain, request, generation, requestSequence, signal }) {
  try {
    const read = async (method, params = []) => {
      if (signal.aborted) throw Error(); const value = await request({ method, params });
      if (signal.aborted) throw Error(); return value;
    };
    const network = registry.network(binding.networkId), deployment = registry.deployment(binding.networkId, binding.deploymentId);
    if (BigInt(await read('eth_chainId')) !== BigInt(network.chainIdentity) ||
        (await read('eth_getBlockByNumber', ['0x0', false])).hash !== network.genesisHash) throw Error();
    const anchor = await read('eth_getBlockByNumber', ['finalized', false]); if (!anchor) throw Error();
    const code = await read('eth_getCode', [deployment.address, anchor.number]);
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(code) || hex(keccak256(Uint8Array.from(code.slice(2).match(/../g), n => parseInt(n, 16)))) !== deployment.runtime.keccak256) throw Error();
    if (await read('eth_call', [{ to: deployment.address, data: buildTradeIdOf(domain, terms).data }, anchor.number]) !== `0x${binding.tradeId}`) throw Error();
    const encoded = await read('eth_call', [{ to: deployment.address, data: buildGetTrade(deployment.address, binding.tradeId).data }, anchor.number]);
    const trade = decodeTrade(encoded); if (trade.state !== 'absent' && !tradeMatchesTerms(trade, terms)) throw Error();
    const repeated = await read('eth_getBlockByNumber', [anchor.number, false]);
    if (repeated?.hash !== anchor.hash || repeated.number !== anchor.number) throw Error();
    return { ok: true, value: buildChainObservation(deployment.address, { binding, generation, requestSequence,
      getTradeReturn: encoded, anchor: { height: String(BigInt(anchor.number)), hash: anchor.hash }, finality: 'finalized', observedAt: Date.now() }) };
  } catch { return { ok: false, error: { code: 'INTEGRITY_FAILURE' } }; }
}
const native = { evmTermsHash, escrowCallFor, createEip1193ChainReader, createEvmTxLifecycle, createLifecycleJournal,
  readObservation, buildPendingWithdrawals, policy: evmFinalityPolicy({ chain: 'evm', finality: { kind: 'evm-finalized-tag' } }, 2, 3) };
function session() {
  if (!selected) throw Error('LOCKED');
  const lease = good(vault.captureSession(selected, () => {}));
  try { const current = lease.current(); if (!current) throw Error('LOCKED'); return current; }
  finally { lease.dispose(); }
}
async function records() { return good(await vault.list(session().sessionId)); }
async function stats() {
  const current = session(), rows = await records();
  return { profileId: current.profileId, revision: current.revision, writes, journalPutWrites, factories, total: rows.length,
    identity: rows.filter(r => r.kind === 'identity').length, journal: rows.filter(r => r.kind === 'journal').length,
    review: rows.filter(r => r.kind === 'trade').length, chat: rows.filter(r => r.kind === 'chat').length };
}
async function seed() {
  if (contexts.length) throw Error('CONFLICT');
  const current = session(), terms = configuration.terms, domain = configuration.domain;
  const binding = { chain: 'evm', networkId: terms.networkId, deploymentId: terms.deploymentId, tradeId: evmTermsHash(domain, terms) };
  const canonical = async intent => {
    try {
      const actual = parseCanonicalPreparedRequest(intent.preparedRequest);
      const expected = escrowCallFor(intent.action === 'fund' ? { action: 'fund', domain, terms } :
        { action: intent.action, escrow: domain.verifyingContract, tradeId: binding.tradeId });
      if (intent.binding.tradeId !== binding.tradeId || actual.from !== terms.seller || actual.chainId !== domain.chainId ||
          actual.to !== expected.call.to || actual.data !== expected.call.data || actual.value !== expected.call.value ||
          intent.expectedEscrowState !== expected.expectedEscrowState) throw Error();
      return { ok: true, value: undefined };
    } catch { return { ok: false, error: { code: 'INTEGRITY_FAILURE' } }; }
  };
  const journal = createLifecycleJournal({ vault, session: current, validateCanonical: canonical });
  const base = createEip1193ChainReader({ request, escrow: domain.verifyingContract });
  const reader = { ...base, escrowObservation: (requested, context) => readObservation({ registry, binding: requested, terms, domain, request, ...context }) };
  const life = createEvmTxLifecycle({ journal, reader, wallet: request, policy: native.policy });
  const settle = async id => {
    for (let i = 0; i < 15; i++) {
      const value = good(await life.reconcile(id)); if (value.outcome === 'finalized') return;
      await request({ method: 'anvil_mine', params: ['0x5'] });
    }
    throw Error('NATIVE_FINALITY_MISSING');
  };
  try {
    await life.walletChanged({ account: terms.seller, chainId: domain.chainId, generation: 1 });
    const fund = escrowCallFor({ action: 'fund', domain, terms });
    const funding = good(await life.prepare({ binding, action: 'fund', ...fund }));
    good(await life.submit(funding)); await request({ method: 'anvil_mine', params: ['0x5'] }); await settle(funding.intentId);
    const release = escrowCallFor({ action: 'release', escrow: domain.verifyingContract, tradeId: binding.tradeId });
    const releasing = good(await life.prepare({ binding, action: 'release', ...release }));
    good(await life.submit(releasing)); await request({ method: 'anvil_mine', params: ['0x5'] }); await settle(releasing.intentId);
  } finally { life.dispose(); journal.dispose(); }
  const document = new TextEncoder().encode(JSON.stringify(configuration.document));
  good(await reviewTermsBytes(registry, document));
  let live = session(); good(await vault.commit(live.sessionId, live.revision, [{ op: 'put', record: {
    id: 'a1'.repeat(16), kind: 'trade', schemaVersion: 1, payload: encodeSavedReviewPayload('file', document) } }])); document.fill(0);
  const provider = createLocalNobleIdentityProvider(); let secret;
  const identity = new MessagingIdentityService(vault, { lifecycle: false, provider: { ...provider, async generate() {
    const generated = await provider.generate(); secret = new Uint8Array(generated.secretKey); return generated;
  } } });
  const messaging = createLocalNobleNostrProvider(), peer = await messaging.generate();
  try {
    const reference = good(await identity.create(session())), self = good(await identity.publicIdentity(reference.handle));
    const participants = [self, peer.publicKey], chat = good(createDurableTradeChat({ vault, session: session(), provider: messaging,
      binding, participants, selfPublicKey: self }));
    const bytes = good(encodeMessage({ format: 'p2p-offramp-message', version: 1, binding, termsHash: binding.tradeId,
      messageId: '12'.repeat(16), sender: self, recipient: peer.publicKey, kind: 'text', createdAt: Date.now(), body: 'SYNTHETIC RETENTION PRIVATE HISTORY' }));
    try { good(await chat.send(bytes, secret)); } finally { bytes.fill(0); chat.close(); }
    contexts.push({ identityRecordId: reference.identityRecordId, binding, participants });
  } finally { secret?.fill(0); peer.secretKey.fill(0); identity.dispose(); }
  scope++; return stats();
}
async function mutate(kind) {
  const current = session(), rows = await records(), saved = rows.find(r => r.kind === 'trade'); let added;
  if (kind === 'unknown') added = [{ id: 'e1'.repeat(16), kind: 'preference', schemaVersion: 1, payload: 'e30' }];
  else if (kind === 'future') added = [{ ...saved, id: 'e2'.repeat(16), schemaVersion: 2 }];
  else if (kind === 'foreign') {
    const document = structuredClone(configuration.document); document.terms.sellerNonce = 'ef'.repeat(32);
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    try { added = [{ id: 'e3'.repeat(16), kind: 'trade', schemaVersion: 1, payload: encodeSavedReviewPayload('file', bytes) }]; }
    finally { bytes.fill(0); }
  } else if (kind === 'imported') {
    const original = rows.find(r => r.kind === 'journal'), intent = decodeIntentPayload(original.payload);
    added = [{ ...original, id: 'e4'.repeat(16), payload: encodeIntentPayload({ ...intent,
      intentId: encodeBase64url(crypto.getRandomValues(new Uint8Array(32))), binding: { ...intent.binding, tradeId: 'ef'.repeat(32) } }) }];
  } else if (kind === 'large') added = Array.from({ length: 257 }, (_, n) => ({ ...saved, id: (1000 + n).toString(16).padStart(32, '0') }));
  else throw Error('INVALID_INPUT');
  scope++;
  for (let i = 0; i < added.length; i += 256) {
    const latest = session(); good(await vault.commit(latest.sessionId, latest.revision, added.slice(i, i + 256).map(record => ({ op: 'put', record }))));
  }
  return stats();
}
const ready = (async () => {
  configuration = await (await fetch('/configuration.json')).json();
  registry = new RegistryService(); good(await registry.load(new TextEncoder().encode(JSON.stringify(configuration.registry)), configuration.registryDigest));
  const rawStore = new IndexedDbVaultStore();
  const store = new Proxy(rawStore, { get(target, key) {
    const value = Reflect.get(target, key); if (typeof value !== 'function') return value;
    if (key === 'add' || key === 'compareAndSwap') return async (...args) => { const result = await value.apply(target, args); writes++; return result; };
    return value.bind(target);
  } });
  vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const commit = vault.commit.bind(vault);
  vault.commit = async (...args) => {
    const result = await commit(...args);
    if (result.ok && args[2].some(mutation => mutation.op === 'put' && mutation.record.kind === 'journal')) journalPutWrites++;
    return result;
  };
  const observed = new Proxy(vault, { get(target, key) {
    const value = Reflect.get(target, key); if (typeof value !== 'function') return value;
    if (key === 'create' || key === 'unlock') return async (...args) => { const result = await value.apply(target, args); if (result.ok) selected = result.value; return result; };
    return value.bind(target);
  } });
  endpoint = createVaultWorkerEndpoint(message => self.postMessage(message), { createServices: () => ({ vault: observed,
    backup: new EncryptedBackupService(store), createRetentionAuthority(current) {
      factories++; const epoch = scope;
      return createNativeRetentionAuthority({ vault, session: current, registry, native, request, contexts,
        currentScope: () => epoch === scope, maxAgeMs: 30000 });
    } }) });
})();
self.onmessage = async event => {
  await ready;
  if (event.data?.fixture === 'retention-localproof') {
    const port = event.ports[0]; if (!port) return;
    try {
      const value = event.data.operation === 'seed' ? await seed() : event.data.operation === 'stats' ? await stats() :
        event.data.operation === 'mutate' ? await mutate(event.data.kind) : (() => { throw Error('INVALID_INPUT'); })();
      port.postMessage({ ok: true, value });
    } catch (error) { port.postMessage({ ok: false, error: { code: /^[A-Z_]{1,64}$/.test(error?.message ?? '') ? error.message : 'FIXTURE_FAILED' } }); }
    finally { port.close(); }
    return;
  }
  await endpoint.dispatch(event.data);
};
