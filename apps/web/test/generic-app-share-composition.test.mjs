import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { Settings } from '../src/ui/Pages.tsx';

const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const main = localPath('../src/main.tsx');
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';
const inert = names => names.map(name => `export function ${name}() { return null; }`).join('\n');
const replacements = new Map([
  [localPath('../src/ui/app.css'), ''],
  [localPath('../src/app-services.ts'), 'export const startAppServices = () => globalThis.ports.unexpected("startup");'],
  // Startup presence reads are outside this sharing-only fixture. The separate
  // startup composition tests execute the real probe, guard, notice and effects.
  [localPath('../src/compatibility/probe.ts'), 'export const probeStartupCapabilities = () => null;'],
  [localPath('../src/diagnostics.ts'), 'export const createLocalDiagnostics = () => null;'],
  [localPath('../src/trade/review-controller.ts'), 'export const noApprovedRegistry = () => null; export const createTradeReviewController = () => ({});'],
  [localPath('../src/trade/draft-controller.ts'), 'export const createTradeDraftController = () => globalThis.ports.unexpected("draft");'],
  [localPath('../src/ui/trade/TradePages.tsx'), inert(['OffersPage', 'TradePage']) + '\nexport const useTradeReview = () => ({ registry: { kind: "unavailable" } });'],
  [localPath('../src/ui/VaultForms.tsx'), inert(['CreateForm', 'ExportForm', 'RestoreForm', 'UnlockForm'])],
  ...['DiagnosticsPanel', 'RecoveryReferencesPanel', 'BackupVerificationForm', 'RetentionPreviewPanel', 'PrivacyStatusPanel', 'SignedUpdatePanel', 'QrPanel']
    .map(name => [localPath(`../src/ui/${name}.tsx`), inert([name])]),
  [localPath('../src/localnet/LocalnetRoot.tsx'), 'export const LocalnetRoot = props => ({ type: "localnet-fixture", props });'],
  [localPath('../src/solana-localnet/SolanaLocalnetRoot.tsx'), 'export const SolanaLocalnetRoot = props => ({ type: "solana-localnet-fixture", props });'],
]);

// Execute the maintained main, OfflineRoot, App, Settings, share leaf and URL
// helper. Only unrelated child screens, startup ports and React scheduling are
// controlled. Module URL reads are injected per module; the real emitted entry
// shape is qualified separately by an ordinary artifact build. Effects are not
// run here, so this fixture does not qualify startup, DOM events or a browser.
async function compile(localnet = false, solana = false) {
  const bundle = await build({ configFile: false, logLevel: 'silent', define: {
    __P2P_LOCALNET__: String(localnet), __P2P_SOLANA_LOCALNET__: String(solana),
    __P2P_SYNTHETIC_DEMO__: 'false', __P2P_TESTNET__: 'false',
  }, plugins: [{
    name: 'generic-app-share-composition-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (['react', 'react/jsx-runtime', 'react-dom/client'].includes(id)) return '\0generic-composition-' + id;
      const path = id.startsWith('.') && importer ? resolve(dirname(importer), id) : id;
      if (replacements.has(path)) return '\0generic-composition-replacement:' + path;
    },
    load(id) {
      if (id.startsWith('\0generic-composition-replacement:')) return replacements.get(id.slice('\0generic-composition-replacement:'.length));
      if (id === '\0generic-composition-react') return `
        export const lazy = load => ({ load });
        export const Suspense = 'suspense';
        export const useEffect = () => {};
        export const useLayoutEffect = () => {};
        export const useMemo = read => read();
        export const useRef = current => ({ current });
        export const useState = initial => [typeof initial === 'function' ? initial() : initial, () => {}];
        export const useSyncExternalStore = (_subscribe, read) => read();`;
      if (id === '\0generic-composition-react/jsx-runtime') return `
        export const Fragment = 'fragment';
        export const jsx = (type, props) => ({ type, props });
        export const jsxs = jsx;`;
      if (id === '\0generic-composition-react-dom/client') return 'export const createRoot = host => ({ render: tree => globalThis.ports.capture(host, tree) });';
    },
    transform(source, id) {
      if ([main, localPath('../src/OfflineRoot.tsx'), localPath('../src/sharing/generic-app-link.ts')].includes(id))
        return source.replaceAll('import.meta.url', `globalThis.ports.moduleUrl(${JSON.stringify(id)})`);
    },
  }], build: { write: false, minify: false, lib: { entry: main, formats: ['iife'], name: 'genericCompositionFixture' } } });
  const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
  assert.equal(output.length, 1);
  return output[0].code;
}
const compiled = await compile();

async function composition(entryUrl, source = compiled) {
  const rootHost = {}, urlReads = [], unexpected = [], traces = [];
  let captured, hash = '#/settings', localeReads = 0;
  const location = { get hash() { return hash; } };
  for (const name of ['href', 'search', 'pathname', 'origin']) Object.defineProperty(location, name, {
    get() { unexpected.push('location.' + name); throw Error('PRIVATE_ROUTE_QUERY_PROFILE_INVITE_PAYMENT'); },
  });
  const refuse = name => { unexpected.push(name); throw Error('PRIVATE_BROWSER_DETAIL'); };
  const environment = { URL, TextEncoder, TextDecoder,
    document: { getElementById(id) { assert.equal(id, 'root'); return rootHost; } },
    window: { location, localStorage: {
      getItem(key) { assert.equal(key, 'p2p-offramp.locale.v1'); localeReads++; return null; },
      setItem() { return refuse('locale-write'); },
    } }, navigator: { onLine: true, get clipboard() { return refuse('clipboard'); }, get share() { return refuse('share'); } },
    ports: {
      unexpected: refuse,
      capture(host, tree) { assert.equal(host, rootHost); captured = tree; },
      moduleUrl(id) { urlReads.push(id); return id === main ? entryUrl : 'https://decoy.example/assets/OfflineRoot-imported.js'; },
    },
  };
  for (const name of ['fetch', 'WebSocket', 'ethereum', 'solana', 'localStorage'])
    Object.defineProperty(environment, name, { get() { return refuse(name); } });
  runInNewContext(source, environment);
  const lazyNode = nodes(captured, node => typeof node.type?.load === 'function')[0];
  assert.ok(lazyNode, 'maintained main renders its selected lazy root');
  const definition = await lazyNode.type.load();
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      traces.push({ name: node.type.name, props: node.props });
      return expand(node.type(node.props));
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  return { urlReads, unexpected, traces, get localeReads() { return localeReads; },
    render(route = '#/settings') { hash = route; traces.length = 0; return expand({ type: definition.default, props: lazyNode.props }); },
  };
}

test('Settings composes one manual sharing address without reading the clipboard during rendering', () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); let reads = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { reads++; throw Error('PRIVATE_BROWSER_DETAIL'); } });
  try {
    const html = renderToStaticMarkup(createElement(Settings, { appLink: 'https://app.example/nested/project/' }));
    assert.match(html, /value="https:\/\/app\.example\/nested\/project\/"/);
    assert.equal((html.match(/id="generic-app-share-title"/g) ?? []).length, 1);
    assert.match(html, /Copy app address/); assert.equal(reads, 0);
  } finally { if (prior) Object.defineProperty(globalThis, 'navigator', prior); else delete globalThis.navigator; }
});

test('Settings without a composed address shows the existing fixed unavailable fallback', () => {
  const html = renderToStaticMarkup(createElement(Settings));
  assert.match(html, /A generic app address is unavailable\./);
  assert.doesNotMatch(html, /id="generic-app-url"|Copy app address/);
});

for (const [entry, expected] of [
  ['https://app.example/nested/project/assets/index-Abc_123-.js', 'https://app.example/nested/project/'],
  ['https://gateway.example/ipfs/bafy-local-fixture/assets/index-Abc12345.js', 'https://gateway.example/ipfs/bafy-local-fixture/'],
  ['http://127.0.0.1:3000/project/src/main.tsx', 'http://127.0.0.1:3000/project/'],
]) test('maintained main supplies its one captured entry URL through the offline shell: ' + entry, async () => {
  const ui = await composition(entry);
  assert.deepEqual(ui.urlReads, [main]);
  const before = ui.render('#/trade/PrivateTrade123456789');
  assert.equal(nodes(before, node => node.props?.id === 'generic-app-url').length, 0);
  const tree = ui.render(), inputs = nodes(tree, node => node.props?.id === 'generic-app-url');
  assert.equal(inputs.length, 1); assert.equal(inputs[0].props.value, expected);
  assert.equal(ui.traces.find(item => item.name === 'OfflineRoot')?.props.entryModuleUrl, entry);
  assert.equal(ui.traces.find(item => item.name === 'App')?.props.appLink, expected);
  assert.equal(ui.traces.find(item => item.name === 'Settings')?.props.appLink, expected);
  assert.doesNotMatch(words(tree), /PRIVATE_|PrivateTrade|decoy\.example/);
  ui.render(); assert.deepEqual(ui.urlReads, [main]); assert.deepEqual(ui.unexpected, []);
  assert.equal(ui.localeReads, 1, 'only the existing initial locale preference read occurs');
});

for (const entry of ['https://app.example/assets/OfflineRoot-imported.js', 'https://app.example/assets/index-Abc12345.js?invite=PRIVATE'])
  test('unsupported actual entry stays unavailable through the maintained composition: ' + entry, async () => {
    const ui = await composition(entry), tree = ui.render();
    assert.match(words(tree), /A generic app address is unavailable\./);
    assert.equal(nodes(tree, node => node.props?.id === 'generic-app-url').length, 0);
    assert.doesNotMatch(words(tree), /PRIVATE|Copy app address/); assert.deepEqual(ui.unexpected, []);
  });

for (const [localnet, solana, expected] of [[true, false, 'localnet-fixture'], [false, true, 'solana-localnet-fixture']])
  test('maintained native dispatch still supplies no sharing props: ' + expected, async () => {
    const ui = await composition('https://app.example/assets/index-Abc12345.js', await compile(localnet, solana));
    const tree = ui.render(); assert.equal(tree.type, expected); assert.deepEqual(Object.keys(tree.props).filter(key => key !== 'children'), []);
    assert.deepEqual(ui.unexpected, []);
  });
