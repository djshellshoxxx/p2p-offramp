import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectApplicationSource, inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';
import { staticBuildPlugin } from './static-build-plugin.mjs';
import { resolve } from 'node:path';
import { scanBuild } from './build.mjs';

async function syntheticBuild(t, payload, payloadPath = 'assets/payload.bin') {
  const directory = await mkdtemp(join(tmpdir(), 'p2p-artifact-bytes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  const files = {
    'index.html': '<!doctype html><script type="module" src="./assets/main.js"></script>',
    'assets/main.js': 'export const fixture = true;\n',
    'assets/vault.worker-fixture.js': 'export {};\n',
    'core-graph-document.json': '[]\n',
    'core-graph-worker.json': '[]\n',
    // Synthetic scanner prerequisites only; these are not distributed license notices.
    'third-party-licenses.json': JSON.stringify(['react', 'react-dom', 'scheduler'].map(name => ({ name, identifier: 'MIT', text: 'Permission is hereby granted (synthetic test fixture)' }))),
    [payloadPath]: payload,
  };
  for (const [path, bytes] of Object.entries(files)) await writeFile(join(directory, path), bytes);
  return { directory, files };
}

for (const [name, payload] of [
  ['binary', Buffer.from([0xff, 0x80, 0x00, 0x41])],
  ['malformed UTF-8', Buffer.from([0xf0, 0x28, 0x8c, 0xbc, 0xc3])],
  ['ordinary multibyte UTF-8', Buffer.from('Hello, café 日本語 🌍\n', 'utf8')],
]) test(`build inventory binds exact raw bytes for ${name}`, async t => {
  const { directory, files } = await syntheticBuild(t, payload);
  const evidence = await scanBuild(directory);
  assert.deepEqual(evidence.assets, Object.keys(files).sort().map(path => ({
    path,
    bytes: Buffer.byteLength(files[path]),
    sha256: createHash('sha256').update(files[path]).digest('hex'),
  })));
  assert.equal(evidence.inspection.bytes, Object.values(files).reduce((total, bytes) => total + Buffer.byteLength(bytes), 0));
  assert.equal(evidence.ReleaseEnabled, 0);
  assert.equal(evidence.signedRelease, false);
});

test('raw-byte inventory preserves private-key refusal in a binary asset', async t => {
  const { directory } = await syntheticBuild(t, Buffer.concat([Buffer.from([0xff]), Buffer.from('-----BEGIN PRIVATE KEY-----')]));
  await assert.rejects(scanBuild(directory), /ARTIFACT_POLICY: assets\/payload\.bin/);
});

test('build inventory includes prototype-looking root filenames', async t => {
  for (const path of ['__proto__', 'constructor', 'toString']) await t.test(path, async t => {
    const payload = Buffer.from(`Owned synthetic artifact: ${path}\n`);
    const { directory, files } = await syntheticBuild(t, payload, path);
    const evidence = await scanBuild(directory);
    assert.deepEqual(evidence.assets.find(asset => asset.path === path), {
      path, bytes: payload.length, sha256: createHash('sha256').update(payload).digest('hex'),
    });
    assert.equal(evidence.inspection.files, Object.keys(files).length);
    assert.equal(evidence.inspection.bytes, Object.values(files).reduce((total, bytes) => total + Buffer.byteLength(bytes), 0));
  });
});

test('prototype-looking root filename cannot hide a private-key marker', async t => {
  const { directory } = await syntheticBuild(t, '-----BEGIN PRIVATE KEY----- (synthetic refusal fixture)', '__proto__');
  await assert.rejects(scanBuild(directory), /ARTIFACT_POLICY: __proto__/);
});

test('prototype-looking root filename participates in case-collision refusal', async t => {
  const { directory } = await syntheticBuild(t, 'first owned fixture', '__proto__');
  await writeFile(join(directory, '__PROTO__'), 'second owned fixture');
  await assert.rejects(scanBuild(directory), /ARTIFACT_POLICY: paths/);
});

test('application token policy denies HTML execution while allowing text and React events', () => {
  assert.doesNotThrow(() => inspectApplicationSource('view.tsx', 'const C = () => <button onClick={() => command()}>{text}</button>; node.textContent = text;'));
  assert.doesNotThrow(() => inspectApplicationSource('view.tsx', 'const C = () => <a href={`#/${name}`}>{name}</a>;'));
  assert.doesNotThrow(() => inspectApplicationSource('routes.ts', 'const route = /^#\\/trade\\/[a-f]{32}$/; const inert = "<img onerror=alert(1)> innerHTML";'));
  for (const source of ['const x = `before${x}`; node.innerHTML = data', 'node.innerHTML = text', 'node["outerHTML"] = text', 'document.write(text)', 'eval(text)', 'new Function(text)', 'const C = () => <div dangerouslySetInnerHTML={{__html: text}} />', 'const C = () => <div style={{color:"red"}} />', 'node.setAttribute("onclick", text)', 'navigator.serviceWorker.register("./sw.js")', 'fetch("https://example.invalid")']) {
    assert.throws(() => inspectApplicationSource('view.tsx', source), /SOURCE_POLICY/);
  }
});
test('bounded artifact paths reject origin, traversal, query, encoded separators and collisions', () => {
  assert.equal(safeArtifactPath('assets/main-abc.js'), 'assets/main-abc.js');
  for (const path of ['/main.js', '../main.js', 'a/../main.js', 'https://a.test/a', 'a.js?q=1', 'a%2fb.js', 'a\\b.js', 'a//b.js']) assert.throws(() => safeArtifactPath(path), /ARTIFACT_PATH/);
});
test('emitted asset scan denies active remote resources, inlining, secrets and source maps', () => {
  const good = {'index.html': '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;"><script type="module" src="./assets/main.js"></script>', 'assets/main.js': 'const namespace="http://www.w3.org/1999/xhtml";'};
  assert.doesNotThrow(() => inspectArtifactFiles(good));
  for (const bad of [
    {'index.html': '<script src="https://a.test/x.js"></script>'},
    {'index.html': '<script>alert(1)</script>'},
    {'index.html': '<script src="./assets/missing.js"></script>'},
    {'index.html': '<img srcset="https://a.test/image.png 1x">'},
    {'index.html': '<meta http-equiv="refresh" content="0;url=https://a.test">'},
    {'index.html': '<button onclick="run()">x</button>'},
    {'index.html': '<div style="color:red">x</div>'},
    {'x.css': '@import "https://a.test/a.css"'},
    {'x.css': 'a{background:url(data:image/svg+xml,x)}'},
    {'x.js.map': '{}'}, {'x.js': '//# sourceMappingURL=x.js.map'},
    {'x.js': '-----BEGIN PRIVATE KEY-----'}, {'x.js': 'import "https://a.test/run.js"'},
  ]) assert.throws(() => inspectArtifactFiles({...good, ...bad}), /ARTIFACT_POLICY/);
});

test('default and demo module graphs reject test-only wallet execution and signing', async () => {
  for (const worker of [false, true]) for (const delivery of ['meta', 'header']) for (const name of ['execution', 'adapter', 'terms']) {
    const root = resolve(import.meta.dirname, '../../..');
    const plugin = staticBuildPlugin(root, delivery, worker);
    const path = resolve(root, `packages/wallet/src/evm-${name}.ts`);
    await assert.rejects(plugin.generateBundle.call({getModuleIds:()=>[path],getModuleInfo:()=>({isExternal:false}),emitFile(){throw Error('should not emit');}}, {}, {}), /NON_CORE_MODULE/);
  }
});
