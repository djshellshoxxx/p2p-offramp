import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectApplicationSource, inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';
import { staticBuildPlugin } from './static-build-plugin.mjs';
import { resolve } from 'node:path';

test('default and demo module graphs reject test-only wallet execution and signing', async () => {
  for (const worker of [false, true]) for (const delivery of ['meta', 'header']) for (const name of ['execution', 'adapter', 'terms']) {
    const root = resolve(import.meta.dirname, '../../..');
    const plugin = staticBuildPlugin(root, delivery, worker);
    const path = resolve(root, `packages/wallet/src/evm-${name}.ts`);
    await assert.rejects(plugin.generateBundle.call({getModuleIds:()=>[path],getModuleInfo:()=>({isExternal:false}),emitFile(){throw Error('should not emit');}}, {}, {}), /NON_CORE_MODULE/);
  }
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
