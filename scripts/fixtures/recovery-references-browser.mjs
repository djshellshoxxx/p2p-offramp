/** Explicit public synthetic test setup only. Never included in the default app artifact. */
import { EncryptedVaultService } from '../../packages/storage/index.ts';
import { encodeIntentPayload } from '../../packages/schemas/index.ts';
const passphrase = 'synthetic private recovery browser fixture passphrase';
export async function seedRecoveryReferences() {
  const vault = new EncryptedVaultService(undefined, crypto, { lifecycle: false });
  const profiles = [];
  try {
    for (const [role, count] of [['a', 70], ['b', 1]]) {
      const opened = await vault.create(passphrase); if (!opened.ok) throw Error('FIXTURE_CREATE_FAILED');
      const session = opened.value, account = '0x' + (role === 'a' ? '12' : '34').repeat(20), mutations = [];
      for (let n = 1; n <= count; n++) mutations.push({ op: 'put', record: { id: n.toString(16).padStart(32, '0'), kind: 'journal', schemaVersion: n === 3 ? 2 : 1,
        payload: encodeIntentPayload({ version: 1, intentId: btoa(String.fromCharCode(...new Uint8Array(32).fill(n))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''),
          binding: { chain: 'evm', networkId: 'evm:1', deploymentId: 'escrow-v1', tradeId: `private-${role}-trade-${n}` }, account, action: 'fund', state: n === 1 ? 'finalized' : 'broadcast-unknown',
          walletGeneration: 0, expectedEscrowState: 'absent', preparedRequest: 'PRIVATE_CALLDATA_BANK_SECRET', submission: { chain: 'evm', hash: null, nonce: String(n) }, replacementOf: null, createdAt: 0, updatedAt: 0 }) } });
      const committed = await vault.commit(session.sessionId, session.revision, mutations); if (!committed.ok) throw Error('FIXTURE_COMMIT_FAILED');
      profiles.push({ profileId: session.profileId, account }); vault.lockAll();
    }
    return { profiles, passphrase };
  } finally { vault.dispose(); }
}
export async function changeRecoveryFixture(profileId) {
  const vault = new EncryptedVaultService(undefined, crypto, { lifecycle: false });
  try {
    const opened = await vault.unlock(profileId, passphrase); if (!opened.ok) throw Error('FIXTURE_UNLOCK_FAILED');
    const committed = await vault.commit(opened.value.sessionId, opened.value.revision, [{ op: 'put', record: { id: 'f'.repeat(32), kind: 'preference', schemaVersion: 1, payload: 'AA' } }]);
    if (!committed.ok) throw Error('FIXTURE_CONCURRENT_WRITE_FAILED');
  } finally { vault.dispose(); }
}
