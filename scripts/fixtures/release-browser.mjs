/** Private public-data G15 qualification entry, outside the emitted app. No signing or wallet. */
import { verifyRelease, createReleaseRegistry } from '../../packages/security/src/release-manifest.ts';
export async function runReleaseQualification(corpus) {
  let assertions = 0;
  const equal = (value, expected) => { assertions++; if (value !== expected) throw Error('G15_BROWSER_ORACLE'); };
  const fromHex = hex => Uint8Array.from(hex.match(/../g), value => parseInt(value, 16));
  const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const vector = corpus.publicVector;
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: base64(fromHex(vector.x)), y: base64(fromHex(vector.y)), key_ops: ['verify'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromHex(vector.signature), new TextEncoder().encode(vector.message)), true);
  equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromHex(vector.signature), new TextEncoder().encode(vector.message + '!')), false);
  const fresh = (source = corpus) => ({ bytes: new Uint8Array(source.manifestBytes), envelope: structuredClone(source.envelope), keys: structuredClone(source.keys),
    assets: source.assets.map(asset => ({ path: asset.path, bytes: new Uint8Array(asset.bytes) })) });
  const check = (f, overrides = {}, highest = 0) => verifyRelease(f.bytes, f.envelope, f.keys, highest,
    { channel: corpus.channel, assets: f.assets, nowSeconds: () => 1500, ...overrides });
  const refused = (result, code) => { equal(result.ok, false); equal(result.error.code, code); };
  const success = await check(fresh()); equal(success.ok, true); equal(success.value.manifestSha256, corpus.envelope.manifestSha256);
  equal(success.value.assetsVerified, true); equal(success.value.releaseEnabled, false); equal(success.value.deploymentsVerified, false);
  equal(Object.isFrozen(success.value.manifest.assets[0]), true); equal(success.value.manifest.assets[0].bytes, 4);
  const wrong = fresh(); wrong.keys = []; refused(await check(wrong), 'KEY_UNTRUSTED');
  const badSig = fresh(); badSig.envelope.signature += '='; refused(await check(badSig), 'SIGNATURE_INVALID');
  const badDomain = fresh(); badDomain.envelope = corpus.wrongDomainEnvelope; refused(await check(badDomain), 'SIGNATURE_INVALID');
  const modified = fresh(); modified.assets[0].bytes[0] ^= 1; refused(await check(modified), 'ASSET_MISMATCH');
  const omitted = fresh(); omitted.assets.shift(); refused(await check(omitted), 'ASSET_MISMATCH');
  const unlisted = fresh(); unlisted.assets.push({ path: 'extra.js', bytes: new Uint8Array() }); refused(await check(unlisted), 'ASSET_MISMATCH');
  const noncanonical = fresh(); noncanonical.bytes = new Uint8Array([...noncanonical.bytes, 10]); refused(await check(noncanonical), 'MANIFEST_UNSUPPORTED');
  refused(await check(fresh(), { nowSeconds: () => 2000 }), 'MANIFEST_EXPIRED');
  refused(await check(fresh(), {}, 2), 'RELEASE_ROLLBACK');
  equal((await check(fresh(), { installedManifestSha256: corpus.envelope.manifestSha256 }, 2)).ok, true);
  const abort = new AbortController(); abort.abort(); refused(await check(fresh(), { signal: abort.signal }), 'CANCELLED');
  refused(await check(fresh(), { isCurrent: () => false }), 'CANCELLED');
  const pendingInput = fresh(), before = Array.from(pendingInput.bytes), pending = check(pendingInput);
  pendingInput.bytes.fill(0); pendingInput.assets[0].bytes.fill(0); pendingInput.keys[0].x = '';
  equal((await pending).ok, true); equal(before[0], corpus.manifestBytes[0]);
  const controller = new AbortController(), cancelled = check(fresh(), { signal: controller.signal }); controller.abort();
  refused(await cancelled, 'CANCELLED');
  // A structured-cloned projection is correlation/display data, never the verification capability.
  const registryInput = fresh(corpus.registry); let current = true;
  const registryProof = await check(registryInput, { isCurrent: () => current }); equal(registryProof.ok, true);
  const rawRegistry = new Uint8Array(corpus.registry.registryBytes), registryPath = corpus.registry.registryPath;
  const registry = await createReleaseRegistry(registryProof.value, registryPath, rawRegistry); equal(registry.ok, true);
  equal(registry.value.network('local-evm').chainIdentity, '31337');
  equal(registry.value.deployment('local-evm', 'escrow-fixture').address, '0x' + '22'.repeat(20));
  equal(registry.value.liveValidated, false); equal(registry.value.releaseEnabled, false);
  refused(await createReleaseRegistry(structuredClone(registryProof.value), registryPath, rawRegistry), 'MANIFEST_UNSUPPORTED');
  const wrongRegistry = new Uint8Array(rawRegistry); wrongRegistry[0] ^= 1;
  refused(await createReleaseRegistry(registryProof.value, registryPath, wrongRegistry), 'ASSET_MISMATCH');
  current = false; equal(registry.value.network('local-evm'), null); equal(registry.value.deployment('local-evm', 'escrow-fixture'), null);
  current = true; equal(registry.value.network('local-evm'), null);
  refused(await createReleaseRegistry(registryProof.value, registryPath, rawRegistry), 'CANCELLED');
  for (const projection of ['network', 'post-load']) {
    let reader, armed = false, live = true, calls = 0;
    const target = projection === 'network' ? 3 : 1;
    const p = await check(fresh(corpus.registry), { isCurrent: () => {
      if (armed && ++calls === target) {
        armed = false; live = false; equal(reader.network('local-evm'), null); live = true;
      }
      return live;
    } });
    equal(p.ok, true);
    const first = await createReleaseRegistry(p.value, registryPath, rawRegistry); equal(first.ok, true); reader = first.value;
    if (projection === 'network') { armed = true; equal(reader.network('local-evm'), null); }
    else { const pendingLoad = createReleaseRegistry(p.value, registryPath, rawRegistry); armed = true; refused(await pendingLoad, 'CANCELLED'); }
    equal(armed, false);
    refused(await createReleaseRegistry(p.value, registryPath, rawRegistry), 'CANCELLED');
  }
  return { runtime: typeof document === 'undefined' ? 'dedicated-module-worker' : 'document', assertions,
    publishedPrimitiveVector: true, syntheticEnvelopeProviderIndependent: false, noSigningOrWallet: true, releaseEnabled: false };
}
