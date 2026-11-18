// Synthetic local fixture. Uses real browser crypto, encrypted IndexedDB and CAS.
import { IndexedDbVaultStore } from '../../packages/storage/src/idb-vault-store.ts';
import { EncryptedVaultService } from '../../packages/storage/src/vault-service.ts';
import { EncryptedBackupService } from '../../packages/storage/src/backup-service.ts';
import { CandidatePeerReplayLedger } from '../../packages/wallet/src/evm-peer-replay.ts';
import scenario from '../../packages/domain/test/fixtures/local-evm-scenario/scenario.json';
import vectors from '../../packages/wallet/test/fixtures/peer-acceptance-v1.json';

const pass = 'synthetic peer replay browser passphrase';
const store = new IndexedDbVaultStore();
const vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
const backup = new EncryptedBackupService(store);
const vector = vectors.vectors.find(row => row.role === 'seller' && row.assetKind === 'native');
let session, ledger;
function value(result) { if (!result.ok) throw Error(result.error.code); return result.value; }
function attach(opened) { session = value(opened); ledger = new CandidatePeerReplayLedger(vault, session); return session.profileId; }
window.peerFixture = {
  create: async () => attach(await vault.create(pass)),
  open: async profileId => attach(await vault.unlock(profileId, pass)),
  admit: () => {
    const bytes = hex => Uint8Array.from(hex.slice(2).match(/../g), pair => parseInt(pair, 16));
    return ledger.admitEoa(scenario.domain, scenario.sets.native.terms, {
      role: 'seller', ownMessagingKey: vector.binding.ownMessagingKey,
      counterpartyMessagingKey: vector.binding.counterpartyMessagingKey,
      nowSeconds: '1699990000', envelopeExpiresAtSeconds: '1699993600',
    }, { binding: vector.binding, termsSignature: bytes(vector.termsSignature), bindingSignature: bytes(vector.bindingSignature) });
  },
  tombstone: () => ledger.tombstone(vector.binding.termsHash),
  stored: () => store.get(session.profileId),
  export: async () => Array.from(await backup.export(session.profileId)),
  restore: async bytes => {
    const receipt = await backup.restore(new Uint8Array(bytes), pass, pass);
    await window.peerFixture.open(receipt.newProfileId);
    return { receipt, sourceAbsent: await store.get(receipt.sourceProfileId) === undefined };
  },
  lock: () => vault.lockAll(),
};
