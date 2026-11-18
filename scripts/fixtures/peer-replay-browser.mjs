// Synthetic local fixture. Uses real browser crypto, encrypted IndexedDB and CAS.
import { IndexedDbVaultStore } from '../../packages/storage/src/idb-vault-store.ts';
import { EncryptedVaultService } from '../../packages/storage/src/vault-service.ts';
import { EncryptedBackupService } from '../../packages/storage/src/backup-service.ts';
import { RegistryService } from '../../packages/domain/index.ts';
import { decodeBase64url } from '../../packages/schemas/index.ts';
import { evmTermsHash, keccak256 } from '../../packages/wallet/src/evm-terms.ts';
import { createPeerAcceptanceVerifier } from '../../packages/wallet/src/evm-peer-verifier.ts';
import { CandidatePeerReplayLedger, PEER_REPLAY_RECORD_ID } from '../../packages/wallet/src/evm-peer-replay.ts';
import scenario from '../../packages/domain/test/fixtures/local-evm-scenario/scenario.json';
import registryJSON from '../../packages/domain/test/fixtures/local-evm-scenario/registry.json';
import vectors from '../../packages/wallet/test/fixtures/peer-acceptance-v1.json';

const pass = 'synthetic peer replay browser passphrase';
const store = new IndexedDbVaultStore();
const vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
const backup = new EncryptedBackupService(store);
const vector = vectors.vectors.find(row => row.role === 'seller' && row.assetKind === 'native');
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async bytes => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
// The local registry is the only domain trust anchor (escrow runtime hash set for the in-page fake chain below).
const raw = structuredClone(registryJSON);
raw.networks[0].deployments[0].runtime.keccak256 = hex(keccak256(new Uint8Array([0x60, 0x00])));
const registryBytes = new TextEncoder().encode(JSON.stringify(raw));
const registry = new RegistryService();
const loaded = await registry.load(registryBytes, await sha256(registryBytes));
if (!loaded.ok) throw Error('registry');
const scenarioRegistry = new RegistryService();
const scenarioBytes = new TextEncoder().encode(JSON.stringify(registryJSON));
if (!(await scenarioRegistry.load(scenarioBytes, await sha256(scenarioBytes))).ok) throw Error('scenario registry');
// In-page read port: a contract wallet that approves every ERC-1271 query. No network request is made.
const request = async ({ method, params = [] }) => {
  if (method === 'eth_chainId') return '0x7a69';
  if (method === 'eth_getBlockByNumber') return params[0] === '0x0' ? { number: '0x0', hash: raw.networks[0].genesisHash, timestamp: '0x0' }
    : { number: '0x10', hash: '0x' + '12'.repeat(32), timestamp: '0x' + (1_699_990_000).toString(16) };
  if (method === 'eth_getCode') return params[0] === raw.networks[0].deployments[0].address ? '0x6000' : '0x6001';
  if (method === 'eth_call') return '0x1626ba7e' + '0'.repeat(56);
  throw Error('unexpected');
};
const verifier = createPeerAcceptanceVerifier({ registry, request });
const SELLER = '0x' + '88'.repeat(20), D1_TERMS = { ...scenario.sets.native.terms, seller: SELLER };
const SCOPE = { ad: `30078:${vector.binding.ownMessagingKey}:p2p-offramp:v1:${D1_TERMS.orderId}`, peer: vector.binding.ownMessagingKey,
  acceptBeforeSeconds: D1_TERMS.acceptBeforeSeconds };
let session, ledger, evidence;
function value(result) { if (!result.ok) throw Error(result.error.code); return result.value; }
function attach(opened) { session = value(opened); ledger = new CandidatePeerReplayLedger(vault, session); return session.profileId; }
async function mint() {
  if (evidence) return evidence;
  const binding = { ...vector.binding, account: SELLER, termsHash: evmTermsHash(scenario.domain, D1_TERMS) };
  const result = await verifier.verify({ terms: D1_TERMS, role: 'seller', signerMessagingKey: binding.ownMessagingKey,
    counterpartyMessagingKey: binding.counterpartyMessagingKey, nowSeconds: '1699990000', envelopeExpiresAtSeconds: null, binding,
    termsSignature: new Uint8Array([1, 2, 3]), bindingSignature: new Uint8Array([4, 5, 6]) });
  if (!result.ok) throw Error(result.code);
  evidence = result.value; return evidence;
}
window.peerFixture = {
  create: async () => attach(await vault.create(pass)),
  open: async profileId => attach(await vault.unlock(profileId, pass)),
  admit: () => {
    const bytes = hex => Uint8Array.from(hex.slice(2).match(/../g), pair => parseInt(pair, 16));
    return ledger.admitEoa(scenarioRegistry, scenario.domain, scenario.sets.native.terms, {
      role: 'seller', ownMessagingKey: vector.binding.ownMessagingKey,
      counterpartyMessagingKey: vector.binding.counterpartyMessagingKey,
      nowSeconds: '1699990000', envelopeExpiresAtSeconds: '1699993600',
    }, { binding: vector.binding, termsSignature: bytes(vector.termsSignature), bindingSignature: bytes(vector.bindingSignature) });
  },
  tombstone: () => ledger.tombstone(vector.binding.termsHash),
  // D1 composed path: verifier-minted evidence and scoped tombstones (cancel vs accept on real IndexedDB).
  admitScoped: async (nowSeconds = '1699990000') => ledger.admitVerified(await mint(), { ...SCOPE, nowSeconds }),
  tombstoneScoped: async (nowSeconds = '1699990000') => ledger.tombstoneScoped((await mint()).termsHash, { ...SCOPE, nowSeconds }),
  status: async (nowSeconds = '1699990000') => ledger.status((await mint()).termsHash, nowSeconds),
  ledgerState: async () => {
    const record = value(await vault.read(session.sessionId, PEER_REPLAY_RECORD_ID));
    if (record === null) return null;
    const json = JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 131072)));
    return { schemaVersion: record.schemaVersion, retiredThroughSeconds: json.retiredThroughSeconds, entries: json.entries.length,
      tombstoned: json.entries.filter(entry => entry.tombstoned).length };
  },
  stored: () => store.get(session.profileId),
  export: async () => Array.from(await backup.export(session.profileId)),
  restore: async bytes => {
    const receipt = await backup.restore(new Uint8Array(bytes), pass, pass);
    await window.peerFixture.open(receipt.newProfileId);
    return { receipt, sourceAbsent: await store.get(receipt.sourceProfileId) === undefined };
  },
  lock: () => vault.lockAll(),
};
