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
    'core-graph-document.json': '{"version":1,"modules":[]}\n',
    'core-graph-worker.json': '{"version":1,"modules":[]}\n',
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
    {'index.html': '<meta http-equiv=refresh content="0;url=https://a.test">'},
    {'index.html': '<meta HTTP-EQUIV = \'Refresh\' content="0">'},
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

// ---- A3 localnet build profile: module and token exceptions exist ONLY for the localnet plugin ----
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const LOCALNET_ONLY_MODULES = [
  ...['adapter', 'terms', 'submit', 'escrow', 'payment-preflight', 'peer-acceptance', 'peer-envelope', 'peer-replay'].map(name => `packages/wallet/src/evm-${name}.ts`),
  'packages/chain-evm/src/reader.ts', 'packages/relay/src/pool.ts', 'packages/relay/src/nip01.ts', 'packages/relay/index.ts', 'packages/exchange/index.ts', 'packages/exchange/src/exchange.ts',
  'packages/wallet/localnet.ts', 'packages/domain/localnet.ts', 'packages/chain-evm/localnet.ts', 'apps/web/src/localnet/LocalnetRoot.tsx', 'apps/web/src/localnet/config.ts',
  'node_modules/@noble/curves/secp256k1.js', 'node_modules/@noble/hashes/sha3.js', 'node_modules/@noble/ciphers/chacha.js',
];
const localnetProfile = { relayOrigin: 'ws://127.0.0.1:7447' };
function graphContext(root, paths, emitted = []) {
  return { getModuleIds: () => paths.map(path => resolve(root, path)), getModuleInfo: () => ({ isExternal: false }), emitFile: file => { emitted.push(file); } };
}
test('every build profile refuses optional packages before reading their source or emitting artifacts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-optional-module-admission-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  // Pin the accepted D7 package set independently of the implementation inventory.
  const optionalPackages = ['proof-inputs', 'liquidity', 'courier', 'arbitration', 'privacy-policy', 'privacy-controls', 'stealth', 'proof-jobs', 'meetup'];
  const refusedPaths = [
    ...optionalPackages.flatMap(name => [`packages/${name}/index.ts`, `node_modules/fixture/packages/${name}/src/module.ts`]),
    'Packages/Privacy-Policy/index.ts', 'apps/web/src/nested/PACKAGES/MEETUP/index.ts',
  ];
  const profiles = [
    ['offline', null, null],
    ['evm-localnet', localnetProfile, null],
    ['solana-localnet', null, { rpcOrigin: 'http://127.0.0.1:8899' }],
  ];
  for (const [name, evm, solana] of profiles) for (const worker of [false, true]) for (const delivery of ['meta', 'header']) {
    await t.test(`${name} ${worker ? 'Worker' : 'document'} ${delivery}`, async () => {
      for (const path of refusedPaths) {
        const emitted = [];
        // These files deliberately do not exist: a source read would fail with ENOENT,
        // not the required admission refusal. No optional package code is executed.
        await assert.rejects(staticBuildPlugin(root, delivery, worker, evm, solana).generateBundle.call(graphContext(root, [path], emitted), {}, {}),
          { message: 'NON_CORE_MODULE' }, path);
        assert.deepEqual(emitted, [], `${path} must not emit a graph or policy`);
      }
    });
  }
});
test('optional-package refusal preserves core privacy helpers and each reviewed localnet profile', async t => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-optional-module-controls-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const core = ['packages/domain/src/privacy.ts', 'packages/domain/src/proof-inputs.ts',
    'packages/domain/src/packages/privacy-policy-notes.ts', 'apps/web/src/packages/meetup-helper.ts',
    'packages/storage/src/store.ts', 'apps/web/src/main.tsx'];
  const profiles = [
    [null, null, core],
    [localnetProfile, null, [...core, 'packages/wallet/src/evm-adapter.ts', 'packages/chain-evm/src/reader.ts', 'packages/domain/localnet.ts']],
    [null, { rpcOrigin: 'http://127.0.0.1:8899' }, [...core, 'packages/chain-solana/src/client.ts', 'packages/chain-solana/localnet.ts', 'apps/web/src/solana-localnet/controller.ts']],
  ];
  for (const path of new Set(profiles.flatMap(([, , paths]) => paths))) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), 'export const fixture = true;\n');
  }
  for (const [evm, solana, paths] of profiles) for (const worker of [false, true]) for (const delivery of ['meta', 'header']) {
    const emitted = [];
    await staticBuildPlugin(root, delivery, worker, evm, solana).generateBundle.call(graphContext(root, paths, emitted), {}, {});
    const graph = JSON.parse(emitted.find(file => file.fileName === (worker ? 'core-graph-worker.json' : 'core-graph-document.json')).source);
    assert.deepEqual(graph.modules.map(module => module.path).sort(), [...paths].sort());
  }
});
test('favorites and templates admit only the exact private Worker graph and never the document or broad barrel', async () => {
  const favorites = ['packages/personalization/favorites.ts', 'packages/personalization/src/favorites.ts', 'packages/personalization/src/trade-draft-store.ts', 'packages/personalization/templates.ts'];
  for (const delivery of ['meta', 'header']) {
    for (const path of favorites) await assert.rejects(staticBuildPlugin(repositoryRoot, delivery, false).generateBundle.call(graphContext(repositoryRoot, [path]), {}, {}), /NON_CORE_MODULE/);
    const emitted = [];
    await staticBuildPlugin(repositoryRoot, delivery, true).generateBundle.call(graphContext(repositoryRoot, favorites, emitted), {}, {});
    assert.deepEqual(JSON.parse(emitted.find(file => file.fileName === 'core-graph-worker.json').source).modules.map(module => module.path).sort(), favorites);
  }
  for (const path of ['packages/personalization/index.ts', 'packages/personalization/src/other.ts', 'packages/personalization/other.ts', 'node_modules/x/packages/personalization/src/favorites.ts']) {
    for (const worker of [false, true]) await assert.rejects(staticBuildPlugin(repositoryRoot, 'meta', worker).generateBundle.call(graphContext(repositoryRoot, [path]), {}, {}), /NON_CORE_MODULE/);
  }
});
test('default, header, demo and testnet plugins still reject every localnet-only module (document and worker)', async () => {
  for (const worker of [false, true]) for (const delivery of ['meta', 'header']) for (const path of LOCALNET_ONLY_MODULES) {
    const plugin = staticBuildPlugin(repositoryRoot, delivery, worker);
    await assert.rejects(plugin.generateBundle.call(graphContext(repositoryRoot, [path]), {}, {}), /NON_CORE_MODULE|UNREVIEWED_DEPENDENCY/, path);
  }
});
test('the localnet plugin admits exactly the reviewed localnet modules and records them in the graph', async () => {
  for (const worker of [false, true]) {
    const emitted = [];
    await staticBuildPlugin(repositoryRoot, 'meta', worker, localnetProfile).generateBundle.call(graphContext(repositoryRoot, LOCALNET_ONLY_MODULES, emitted), {}, {});
    const graph = JSON.parse(emitted.find(file => /core-graph-/.test(file.fileName)).source);
    assert.deepEqual(graph.modules.map(module => module.path).sort(), [...LOCALNET_ONLY_MODULES].sort());
  }
});
test('the localnet plugin still rejects execution, tests, fixtures, Solana, extensions and unreviewed dependencies', async () => {
  for (const path of ['packages/wallet/src/evm-execution.ts', 'packages/wallet/src/evm-other.ts', 'packages/wallet/test/evm-adapter.test.mjs', 'packages/domain/test/fixtures/local-evm-scenario/registry.json',
    'packages/chain-evm/test/reader.test.mjs', 'packages/chain-solana/src/reader.ts', 'packages/extensions/index.ts', 'packages/messaging/localnet.ts', 'packages/relay/src/fixtures/x.ts',
    'node_modules/@noble/post-quantum/index.js', 'node_modules/viem/index.js', 'node_modules/x/packages/relay/a.js', 'node_modules/x/packages/chain-evm/a.js', '../outside.ts']) {
    for (const worker of [false, true]) {
      const plugin = staticBuildPlugin(repositoryRoot, 'meta', worker, localnetProfile);
      await assert.rejects(plugin.generateBundle.call(graphContext(repositoryRoot, [path]), {}, {}), /NON_CORE_MODULE|UNREVIEWED_DEPENDENCY/, path);
    }
  }
  assert.throws(() => staticBuildPlugin(repositoryRoot, 'meta', false, { relayOrigin: 'wss://relay.example' }), /INVALID_INPUT|Content boundary/);
  assert.throws(() => staticBuildPlugin(repositoryRoot, 'meta', false, { relayOrigin: 'ws://127.0.0.1:7447', extra: 1 }), /LOCALNET_PROFILE_INVALID/);
});
test('the WebSocket( token is allowed only in packages/relay/src/pool.ts and only by the localnet plugin', async t => {
  assert.throws(() => inspectApplicationSource('packages/relay/src/pool.ts', 'export const c = url => new WebSocket(url);'), /SOURCE_POLICY/);
  assert.doesNotThrow(() => inspectApplicationSource('packages/relay/src/pool.ts', 'export const c = url => new WebSocket(url);', { allowWebSocketConstructor: true }));
  for (const source of ['fetch(url)', 'new EventSource(url)', 'new XMLHttpRequest()', 'eval(text)', 'node.innerHTML = text'])
    assert.throws(() => inspectApplicationSource('packages/relay/src/pool.ts', source, { allowWebSocketConstructor: true }), /SOURCE_POLICY/, source);
  const root = await mkdtemp(join(tmpdir(), 'p2p-localnet-token-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['packages/relay/src/pool.ts', 'packages/relay/src/other.ts', 'packages/exchange/src/exchange.ts', 'apps/web/src/localnet/LocalnetRoot.tsx']) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), 'export const connect = (url: string) => new WebSocket(url);\n');
  }
  await staticBuildPlugin(root, 'meta', false, localnetProfile).generateBundle.call(graphContext(root, ['packages/relay/src/pool.ts']), {}, {});
  for (const path of ['packages/relay/src/other.ts', 'packages/exchange/src/exchange.ts', 'apps/web/src/localnet/LocalnetRoot.tsx'])
    await assert.rejects(staticBuildPlugin(root, 'meta', false, localnetProfile).generateBundle.call(graphContext(root, [path]), {}, {}), /SOURCE_POLICY/, path);
  await assert.rejects(staticBuildPlugin(root, 'meta', false).generateBundle.call(graphContext(root, ['packages/relay/src/pool.ts']), {}, {}), /NON_CORE_MODULE/);
});
test('the localnet plugin emits the relay-only CSP; the default plugin keeps connect-src none', async () => {
  const shell = '<!doctype html><head><!-- OFFLINE_CONTENT_POLICY --><script type="module" src="./a.js"></script></head>';
  const localnetHtml = staticBuildPlugin(repositoryRoot, 'meta', false, localnetProfile).transformIndexHtml.handler(shell);
  assert.match(localnetHtml, /connect-src ws:\/\/127\.0\.0\.1:7447;/);
  assert.doesNotMatch(localnetHtml, /connect-src 'none'/);
  const defaultHtml = staticBuildPlugin(repositoryRoot, 'meta', false).transformIndexHtml.handler(shell);
  assert.match(defaultHtml, /connect-src &#39;none&#39;|connect-src 'none'/);
  assert.doesNotMatch(defaultHtml, /ws:/);
  const emitted = [];
  await staticBuildPlugin(repositoryRoot, 'meta', false, localnetProfile).generateBundle.call(graphContext(repositoryRoot, [], emitted), {}, {});
  const policy = JSON.parse(emitted.find(file => file.fileName === 'content-policy.json').source);
  assert.deepEqual(policy.manifest.connectOrigins, ['ws://127.0.0.1:7447']);
  assert.equal(policy.ReleaseEnabled, 0);
  assert.match(emitted.find(file => file.fileName === '_headers').source, /connect-src ws:\/\/127\.0\.0\.1:7447;/);
});
