import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { QR_DECODER_ENTRY, QR_DECODER_GRAPH, QR_DECODER_MODULES, JSQR_DIST_SHA256,
  assertQrDecoderModule, assertNotQrDecoderModule, inspectQrArtifact } from './qr-build-policy.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const asset = 'assets/decode.worker-123abc.js', source = 'self.onmessage=()=>{};';
  const modules = QR_DECODER_MODULES.map(path => ({ path, sha256: path.startsWith('node_modules/') ? JSQR_DIST_SHA256 : 'a'.repeat(64) }));
  const graph = { version: 1, scope: 'public-qr-decoder', entry: QR_DECODER_ENTRY, asset: { path: asset, sha256: hash(source) }, modules,
    authority: 'none', privateRuntime: false, network: false };
  const license = { name: 'jsqr', version: '1.4.0', identifier: 'Apache-2.0', text: 'Apache License Version 2.0' };
  return { files: { [asset]: source, [QR_DECODER_GRAPH]: JSON.stringify(graph), 'third-party-licenses.json': JSON.stringify([license]) },
    document: [{ path: 'apps/web/src/ui/QrPanel.tsx' }], native: [{ path: 'apps/web/src/workers/vault.worker.ts' }], graph, asset };
}

test('decoder module scope is exact and unavailable to the document or private native Worker', () => {
  assert.throws(() => inspectQrArtifact({}, undefined, []), /CORE_GRAPH_INVALID/);
  assert.throws(() => inspectQrArtifact({}, [], {}), /CORE_GRAPH_INVALID/);
  for (const path of QR_DECODER_MODULES) assert.doesNotThrow(() => assertQrDecoderModule(path));
  for (const path of ['packages/storage/index.ts', 'packages/wallet/index.ts', 'apps/web/src/qr/review-controller.ts',
    'node_modules/jsqr/future.js', 'node_modules/@noble/hashes/sha2.js', '../outside/decoder.ts']) {
    assert.throws(() => assertQrDecoderModule(path), /QR_DECODER_MODULE/);
  }
  for (const path of [QR_DECODER_ENTRY, 'apps/web/src/qr/decoder.ts', 'node_modules/jsqr/dist/jsQR.js']) {
    assert.throws(() => assertNotQrDecoderModule(path), /QR_DECODER_SCOPE/);
  }
  assert.doesNotThrow(() => assertNotQrDecoderModule('apps/web/src/qr/protocol.ts'));
});

test('emitted decoder asset is bound to exactly its dedicated graph and pinned dependency bytes', () => {
  const f = fixture(); assert.equal(inspectQrArtifact(f.files, f.document, f.native).decoderVersion, '1.4.0');
  const corrupt = (change, code) => { const c = fixture(); change(c); assert.throws(() => inspectQrArtifact(c.files, c.document, c.native), new RegExp(code)); };
  corrupt(c => { delete c.files[QR_DECODER_GRAPH]; }, 'QR_DECODER_GRAPH');
  corrupt(c => { c.files[c.asset] += 'fetch("https://wrong.invalid")'; }, 'QR_DECODER_ASSET');
  corrupt(c => { c.graph.modules[0].path = 'packages/storage/index.ts'; c.files[QR_DECODER_GRAPH] = JSON.stringify(c.graph); }, 'QR_DECODER_MODULE');
  corrupt(c => { c.graph.modules.find(m => m.path.startsWith('node_modules/')).sha256 = 'b'.repeat(64); c.files[QR_DECODER_GRAPH] = JSON.stringify(c.graph); }, 'QR_DECODER_PIN');
  corrupt(c => { c.native.push({ path: QR_DECODER_ENTRY }); }, 'QR_DECODER_SCOPE');
  corrupt(c => { c.document = []; }, 'QR_DECODER_UNREACHABLE');
  corrupt(c => { c.files['assets/decode.worker-second.js'] = 'extra'; }, 'QR_DECODER_ASSET');
  corrupt(c => { c.files['third-party-licenses.json'] = '[]'; }, 'LICENSE_ATTRIBUTION_MISSING');
  assert.equal(inspectQrArtifact({}, [], []), null);
});

test('a decoder graph cannot claim private runtime or network authority', () => {
  for (const [key, value] of [['authority', 'transaction'], ['privateRuntime', true], ['network', true]]) {
    const f = fixture(); f.graph[key] = value; f.files[QR_DECODER_GRAPH] = JSON.stringify(f.graph);
    assert.throws(() => inspectQrArtifact(f.files, f.document, f.native), /QR_DECODER_GRAPH/, key);
  }
});
