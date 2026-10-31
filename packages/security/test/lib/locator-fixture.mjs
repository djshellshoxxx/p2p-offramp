/** Synthetic G15 locator signer. Node crypto.sign uses OpenSSL/P1363; the verifier
 * uses WebCrypto. This is API cross-check evidence, not independent approval.
 * CID vectors were encoded independently with Python stdlib base64.b32encode:
 * prefix [1,0x55|0x70,0x12,32] + SHA256(b'p2p-offramp synthetic locator').
 */
import { fixture, canonical, encode, sha } from './release-fixture.mjs';
export const RAW_CID = 'bafkreih2oiblcjflc43wnaeibpyn37nrllsw4xk2fs3bww2xnztbnayuui';
export const DAG_PB_CID = 'bafybeih2oiblcjflc43wnaeibpyn37nrllsw4xk2fs3bww2xnztbnayuui';
export function locatorFixture(edit = () => {}, manifestEdit = () => {}) {
  const release = fixture(manifestEdit), archive = encode('Synthetic archive bytes, not an extractable package.');
  const locator = { v: 1, channel: release.manifest.channel, sequence: release.manifest.sequence, manifestSha256: sha(release.bytes),
    cid: RAW_CID, archiveSha256: sha(archive), createdAt: release.manifest.createdAt, expiresAt: release.manifest.expiresAt };
  edit(locator);
  const bytes = encode(canonical(locator));
  const makeEnvelope = (payload = bytes, prefix = 'p2p-offramp/release-locator/v1\n', encoding = 'ieee-p1363') => {
    const { keyId, alg, signature } = release.makeEnvelope(payload, prefix, encoding); return { keyId, alg, signature };
  };
  return { release, locator, bytes, archive, envelope: makeEnvelope(), makeEnvelope };
}
