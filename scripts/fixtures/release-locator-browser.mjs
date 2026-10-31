/** Native document/Worker verification of a retained public OpenSSL vector only. */
import { verifyRelease } from '../../packages/security/src/release-manifest.ts';
import { verifyReleaseLocator } from '../../packages/security/src/release-locator.ts';

export async function runLocatorQualification(corpus) {
  let checks = 0;
  const equal = (actual, expected) => { checks++; if (actual !== expected) throw new Error('LOCATOR_BROWSER_ORACLE'); };
  const from = value => new Uint8Array(value), raw = from(corpus.locatorBytes), archive = from(corpus.archive);
  let now = 1500;
  const options = { channel: 'fixture-beta', nowSeconds: () => now, assets: corpus.assets.map(a => ({ path: a.path, bytes: from(a.bytes) })) };
  const makeProof = () => verifyRelease(from(corpus.manifestBytes), corpus.manifestEnvelope, [corpus.key], 0, options);
  const release = await makeProof(); equal(release.ok, true);
  const check = (bytes = raw, env = corpus.envelope, proof = release.value, extra = {}) => verifyReleaseLocator(bytes, env, proof, [corpus.key], extra);
  const result = await check(raw, corpus.envelope, release.value, { archiveBytes: archive });
  equal(result.ok, true); equal(result.value.archiveVerified, true); equal(result.value.releaseEnabled, false); equal(result.value.installationAllowed, false);
  equal(Object.isFrozen(result.value.locator), true);
  equal((await check()).value.archiveVerified, false);
  equal((await check(from(corpus.dagPbBytes), corpus.dagPbEnvelope)).ok, true);
  equal((await check(raw, corpus.wrongDomainEnvelope)).error.code, 'SIGNATURE_INVALID');
  equal((await check(raw, corpus.derEnvelope)).error.code, 'SIGNATURE_INVALID');
  equal((await check(raw, corpus.envelope, structuredClone(release.value))).error.code, 'MANIFEST_UNSUPPORTED');
  equal((await check(raw, corpus.envelope, { ...release.value })).error.code, 'MANIFEST_UNSUPPORTED');
  equal((await check(raw, corpus.envelope, release.value, { archiveBytes: new Uint8Array([1]) })).error.code, 'ASSET_MISMATCH');
  equal((await verifyReleaseLocator(raw, corpus.envelope, release.value, [])).error.code, 'KEY_UNTRUSTED');
  const text = new TextDecoder().decode(raw), encode = value => new TextEncoder().encode(value);
  equal((await check(encode(text + '\n'))).error.code, 'MANIFEST_UNSUPPORTED');
  equal((await check(encode(text.replace('"v":1', '"v":1,"v":1')))).error.code, 'MANIFEST_UNSUPPORTED');
  const cidV0 = JSON.parse(text); cidV0.cid = 'QmYwAPJzv5CZsnAzt8auVZRnGi2CZZpXtgSQCoU8trDWn9';
  equal((await check(encode(JSON.stringify(cidV0)))).error.code, 'MANIFEST_UNSUPPORTED');
  let getters = 0; const hostile = { ...corpus.envelope }; Object.defineProperty(hostile, 'signature', { get() { getters++; return ''; }, enumerable: true });
  equal((await check(raw, hostile)).error.code, 'MANIFEST_UNSUPPORTED'); equal(getters, 0);
  const controller = new AbortController(); controller.abort(); equal((await check(raw, corpus.envelope, release.value, { signal: controller.signal })).error.code, 'CANCELLED');
  equal((await check(raw, corpus.envelope, release.value, { isCurrent: () => false })).error.code, 'CANCELLED');
  now = 2000; equal((await check()).error.code, 'MANIFEST_EXPIRED');
  now = 1500; equal((await check()).error.code, 'MANIFEST_EXPIRED');
  const earlier = await makeProof(); equal(earlier.ok, true); now = 1499;
  equal((await check(raw, corpus.envelope, earlier.value)).error.code, 'UNAVAILABLE');
  return { runtime: typeof document === 'object' ? 'document' : 'dedicated-module-worker', checks, locatorVerified: true,
    archiveVerified: true, profile: 'cidv1-base32lower-raw-or-dagpb-sha2-256', releaseEnabled: false, installationAllowed: false };
}
