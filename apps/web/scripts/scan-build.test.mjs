import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { scanBuild, SYNTHETIC_MARKERS } from './build.mjs';

const MIT = 'Permission is hereby granted, free of charge';
async function fixture({ js = 'export const app = 1;\n', graphModules = [] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'p2p-scan-build-'));
  await mkdir(join(dir, 'assets'));
  const files = {
    'index.html': '<!doctype html><html><head><script type="module" src="./assets/index-a.js"></script></head><body></body></html>',
    'assets/index-a.js': js,
    'assets/vault.worker-a.js': 'export {};\n',
    'third-party-licenses.json': JSON.stringify(['react', 'react-dom', 'scheduler'].map(name => ({ name, identifier: 'MIT', text: MIT }))),
    'core-graph-document.json': JSON.stringify({ version: 1, modules: graphModules }),
    'core-graph-worker.json': JSON.stringify({ version: 1, modules: [] }),
  };
  for (const [path, contents] of Object.entries(files)) await writeFile(join(dir, path), contents);
  return dir;
}

test('scanBuild: the default artifact refuses synthetic markers or demo modules; the demo artifact requires them', async t => {
  const clean = await fixture();
  const marked = await fixture({ js: `export const id = ${JSON.stringify(SYNTHETIC_MARKERS[0])};\n` });
  const digest = await fixture({ js: `export const d = ${JSON.stringify(SYNTHETIC_MARKERS[1])};\n` });
  const graphOnly = await fixture({ graphModules: [{ path: 'apps/web/src/demo/synthetic-local.ts', sha256: '0'.repeat(64) }] });
  t.after(() => Promise.all([clean, marked, digest, graphOnly].map(dir => rm(dir, { recursive: true, force: true }))));
  assert.equal((await scanBuild(clean)).syntheticDemo, false);
  for (const dir of [marked, digest, graphOnly]) await assert.rejects(scanBuild(dir), /SYNTHETIC_DATA_IN_DEFAULT_BUILD/);
  await assert.rejects(scanBuild(clean, { syntheticDemo: true }), /SYNTHETIC_DEMO_DATA_MISSING/);
  assert.equal((await scanBuild(marked, { syntheticDemo: true })).syntheticDemo, true);
});

test('scanBuild: only the testnet artifact may carry the testnet trust bundle or testnet modules, and it must', async t => {
  const { TESTNET_TRUST_FORMAT } = await import('./testnet-trust.mjs');
  const clean = await fixture();
  const bundled = await fixture({ js: `export const trust = ${JSON.stringify({ format: TESTNET_TRUST_FORMAT })};\n` });
  // A refused legacy registry-only bundle is still trust data: it may never reach a non-testnet artifact either.
  const legacy = await fixture({ js: `export const trust = ${JSON.stringify({ format: 'p2p-offramp/testnet-trust/v1' })};\n` });
  const graphOnly = await fixture({ graphModules: [{ path: 'apps/web/src/testnet/sepolia-source.ts', sha256: '0'.repeat(64) }] });
  t.after(() => Promise.all([clean, bundled, legacy, graphOnly].map(dir => rm(dir, { recursive: true, force: true }))));
  assert.equal(TESTNET_TRUST_FORMAT, 'p2p-offramp/testnet-trust/v2');
  assert.equal((await scanBuild(clean)).testnet, false);
  for (const dir of [bundled, legacy, graphOnly]) {
    await assert.rejects(scanBuild(dir), /TESTNET_DATA_IN_NON_TESTNET_BUILD/);
    await assert.rejects(scanBuild(dir, { syntheticDemo: false }), /TESTNET_DATA_IN_NON_TESTNET_BUILD/);
  }
  await assert.rejects(scanBuild(clean, { testnet: true }), /TESTNET_TRUST_DATA_MISSING/);
  assert.equal((await scanBuild(bundled, { testnet: true })).testnet, true);
});

test('scanBuild records portable paths and refuses unsupported filesystem entries', async t => {
  const dir = await fixture();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = 'sample.txt';
  await writeFile(join(dir, 'assets', filename), 'sample');
  assert.ok((await scanBuild(dir)).assets.some(asset => asset.path === 'assets/sample.txt'));
  if (sep === '/') {
    const nonportable = join(dir, 'notes\\example.txt');
    await writeFile(nonportable, 'sample');
    await assert.rejects(scanBuild(dir), /ARTIFACT_PATH/);
    await rm(nonportable);
  }
  const symlinkPath = join(dir, 'alias');
  await symlink(join(dir, 'assets'), symlinkPath, 'dir');
  await assert.rejects(scanBuild(dir), /ARTIFACT_SYMLINK/);
});

test('a copied Pages directory must match the independently retained build evidence', async t => {
  const source = await fixture();
  const temporary = await mkdtemp(join(tmpdir(), 'p2p-pages-copy-'));
  t.after(() => Promise.all([source, temporary].map(dir => rm(dir, { recursive: true, force: true }))));
  const evidenceName = 'local-build-evidence.json';
  const reference = join(source, evidenceName);
  const candidate = join(temporary, 'pages');
  const javascript = join(candidate, 'assets/index-a.js');
  const evidence = JSON.stringify(await scanBuild(source), null, 2) + '\n';
  await writeFile(reference, evidence);
  await cp(source, candidate, { recursive: true });
  const cli = fileURLToPath(new URL('../../../scripts/verify-web-artifact.mjs', import.meta.url));
  const verify = (expected = reference) => execFileSync(process.execPath, [cli, candidate, expected], { encoding: 'utf8', stdio: 'pipe' });

  assert.equal(JSON.parse(verify()).verifiedAssets, 6);
  assert.throws(() => verify(source), /INVALID_LOCAL_BUILD_EVIDENCE/);
  assert.throws(() => verify(join(candidate, evidenceName)), /INDEPENDENT_EVIDENCE_REQUIRED/);
  const sharedCopy = join(temporary, 'shared-inode.json');
  await link(join(candidate, evidenceName), sharedCopy);
  assert.throws(() => verify(sharedCopy), /INDEPENDENT_EVIDENCE_REQUIRED/);
  const original = await readFile(javascript);
  await writeFile(javascript, original.toString().replace('1', '2'));
  assert.throws(() => verify(), /ARTIFACT_INTEGRITY_MISMATCH/);
  await rm(javascript);
  assert.throws(() => verify());
  await writeFile(javascript, original);
  await writeFile(join(candidate, 'extra.txt'), 'unlisted');
  assert.throws(() => verify(), /ARTIFACT_INTEGRITY_MISMATCH/);
  await rm(join(candidate, 'extra.txt'));
  await writeFile(join(candidate, evidenceName), evidence + '\n');
  assert.throws(() => verify(), /ARTIFACT_INTEGRITY_MISMATCH/);
  await rm(join(candidate, evidenceName));
  assert.throws(() => verify(), /ARTIFACT_INTEGRITY_MISMATCH/);
});

// ---- A3 localnet build profile (library-only seam; never reachable from the CLI or environment) ----
const { createHash: localnetHash } = await import('node:crypto');
const LOCALNET_RUNTIME = 'e'.repeat(64);
function localnetRegistry(mutate = network => network) {
  const network = {
    id: 'localnet-evm', chain: 'evm', chainIdentity: '31337', genesisHash: `0x${'31'.repeat(32)}`,
    endpoints: [{ id: 'anvil', url: 'http://127.0.0.1:8545/' }], finality: { kind: 'evm-finalized-tag' },
    assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
    deployments: [{ id: 'escrow-localnet', address: `0x${'5e'.repeat(20)}`, protocolVersion: 1, artifactSha256: 'd'.repeat(64),
      runtime: { kind: 'evm-code', keccak256: LOCALNET_RUNTIME, upgradeable: false }, supportedAssetIds: ['native'] }],
    environment: 'local',
  };
  return Buffer.from(JSON.stringify({ version: 1, releaseId: 'localnet-synthetic', networks: [mutate(network)] }));
}
function localnetOption(overrides = {}) {
  const registryBytes = overrides.registryBytes ?? localnetRegistry();
  return { registryBytes, registrySha256: localnetHash('sha256').update(registryBytes).digest('hex'),
    escrowLayouts: { [LOCALNET_RUNTIME]: 'canonical-get-trade-v1' }, relayUrl: 'ws://127.0.0.1:7447/', ...overrides };
}
const configModule = () => import('../src/localnet/config.ts');

test('localnet config: a strict 31337/local registry, trusted escrow layout and loopback ws relay are accepted and frozen', async () => {
  const { parseLocalnetConfig, localnetConfigDocument, parseLocalnetRelayUrl, LOCALNET_CONFIG_FORMAT } = await configModule();
  const document = localnetConfigDocument(localnetOption());
  assert.equal(document.format, LOCALNET_CONFIG_FORMAT);
  assert.equal(document.ReleaseEnabled, 0);
  assert.deepEqual(Object.keys(document).sort(), ['ReleaseEnabled', 'escrowLayouts', 'format', 'registry', 'registrySha256', 'relayUrl']);
  const config = await parseLocalnetConfig(JSON.parse(JSON.stringify(document)));
  assert.equal(config.ReleaseEnabled, 0);
  assert.equal(config.relayUrl, 'ws://127.0.0.1:7447/');
  assert.equal(config.relayOrigin, 'ws://127.0.0.1:7447');
  assert.equal(config.network.chainIdentity, '31337');
  assert.equal(config.network.environment, 'local');
  assert.deepEqual({ ...config.escrowLayouts }, { [LOCALNET_RUNTIME]: 'canonical-get-trade-v1' });
  assert.equal(config.registry.deployment('localnet-evm', 'escrow-localnet').runtime.keccak256, LOCALNET_RUNTIME);
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.escrowLayouts) && Object.isFrozen(config.document));
  assert.equal(Buffer.from(config.registryBytes).toString(), localnetRegistry().toString());
  // JSON text is accepted as the exact registry bytes.
  const fromJson = localnetConfigDocument({ ...localnetOption(), registryBytes: undefined, registryJson: localnetRegistry().toString() });
  assert.equal(fromJson.registry, document.registry);
  assert.deepEqual(parseLocalnetRelayUrl('ws://[::1]:9/'), { url: 'ws://[::1]:9/', origin: 'ws://[::1]:9' });
});

test('localnet config refuses other chains, environments, digests, layouts, relay hosts and unknown keys (fail closed)', async () => {
  const { parseLocalnetConfig, localnetConfigDocument, parseLocalnetRelayUrl } = await configModule();
  const rejects = async (option, code) => {
    let document;
    try { document = localnetConfigDocument(option); } catch (error) { assert.match(error.message, code); return; }
    await assert.rejects(parseLocalnetConfig(document), code);
  };
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, chainIdentity: '1' })) }), /LOCALNET_NETWORK/);
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, chainIdentity: '11155111' })) }), /LOCALNET_NETWORK/);
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, environment: 'testnet', endpoints: [{ id: 'anvil', url: 'https://127.0.0.1:8545/' }] })) }), /LOCALNET_NETWORK/);
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, endpoints: [{ id: 'remote', url: 'https://rpc.example.invalid/' }] })) }), /LOCALNET_NETWORK/);
  // Exactly one network: a second (otherwise valid) network is refused, not silently exposed to the journey.
  const twoNetworks = Buffer.from(JSON.stringify({ ...JSON.parse(localnetRegistry().toString()),
    networks: [JSON.parse(localnetRegistry().toString()).networks[0], { ...JSON.parse(localnetRegistry().toString()).networks[0], id: 'other-evm', chainIdentity: '1337' }] }));
  await rejects(localnetOption({ registryBytes: twoNetworks }), /LOCALNET_NETWORK/);
  // Loopback host check in isolation: the registry schema admits http://localhost in the local environment; localnet does not.
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, endpoints: [{ id: 'anvil', url: 'http://localhost:8545/' }] })) }), /LOCALNET_NETWORK/);
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, endpoints: [{ id: 'anvil', url: 'http://127.0.0.1:8545/' }, { id: 'name', url: 'http://localhost:8546/' }] })) }), /LOCALNET_NETWORK/);
  // HTTPS on a loopback host is not the plain local Anvil endpoint either.
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, endpoints: [{ id: 'anvil', url: 'https://127.0.0.1:8545/' }] })) }), /LOCALNET_NETWORK/);
  // Non-loopback http and a non-local environment with loopback http are already refused by the registry schema itself.
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, endpoints: [{ id: 'anvil', url: 'http://127.0.0.2:8545/' }] })) }), /LOCALNET_REGISTRY/);
  await rejects(localnetOption({ registryBytes: localnetRegistry(network => ({ ...network, environment: 'testnet' })) }), /LOCALNET_REGISTRY/);
  await rejects({ ...localnetOption(), registrySha256: '0'.repeat(64) }, /LOCALNET_REGISTRY/);
  await rejects({ ...localnetOption(), escrowLayouts: {} }, /LOCALNET_ESCROW_LAYOUTS/);
  await rejects({ ...localnetOption(), escrowLayouts: { [LOCALNET_RUNTIME]: 'legacy-escrows-v1' } }, /LOCALNET_ESCROW_LAYOUTS/);
  await rejects({ ...localnetOption(), escrowLayouts: { ['f'.repeat(64)]: 'canonical-get-trade-v1' } }, /LOCALNET_ESCROW_LAYOUTS/);
  await rejects({ ...localnetOption(), escrowLayouts: { [LOCALNET_RUNTIME]: 'canonical-get-trade-v1', ['f'.repeat(64)]: 'canonical-get-trade-v1' } }, /LOCALNET_ESCROW_LAYOUTS/);
  await rejects({ ...localnetOption(), escrowLayouts: { [`0x${LOCALNET_RUNTIME}`]: 'canonical-get-trade-v1' } }, /LOCALNET_ESCROW_LAYOUTS/);
  await rejects({ ...localnetOption(), extra: true }, /LOCALNET_CONFIG_INVALID/);
  await rejects({ ...localnetOption(), registryJson: '{}' }, /LOCALNET_CONFIG_INVALID/);
  for (const relayUrl of ['wss://127.0.0.1:7447/', 'ws://localhost:7447/', 'ws://127.0.0.2:7447/', 'ws://0.0.0.0:7447/', 'ws://relay.example:7447/',
    'ws://127.0.0.1/', 'ws://127.0.0.1:80/', 'ws://127.0.0.1:7447', 'ws://127.0.0.1:7447/x', 'ws://u:p@127.0.0.1:7447/', 'ws://127.0.0.1:7447/?a=1',
    'ws://127.0.0.1:7447/#f', 'ws://127.0.0.1:7447/?', 'ws://127.0.0.1:7447/#', 'ws://127.1:7447/', 'ws://2130706433:7447/', ' ws://127.0.0.1:7447/', 'http://127.0.0.1:7447/', 7447, null]) {
    assert.throws(() => parseLocalnetRelayUrl(relayUrl), /LOCALNET_RELAY_URL/, String(relayUrl));
    await rejects({ ...localnetOption(), relayUrl }, /LOCALNET_RELAY_URL/);
  }
  const document = localnetConfigDocument(localnetOption());
  for (const broken of [{ ...document, ReleaseEnabled: 1 }, { ...document, format: 'p2p-offramp/localnet-config/v2' }, { ...document, extra: 1 },
    Object.assign(Object.create({ inherited: 1 }), document), null, 'text', []]) await assert.rejects(parseLocalnetConfig(broken), /LOCALNET_CONFIG_INVALID/);
});

async function localnetFixture({ relayOrigin = 'ws://127.0.0.1:7447', csp, documentCsps, headerCsps, releaseEnabled = 0, js, nobleLicense = true, graphModules } = {}) {
  const { buildLocalnetContentPolicy } = await import('../../../packages/security/src/content-policy.ts');
  const { LOCALNET_CONFIG_FORMAT, LOCALNET_BANNER } = await configModule();
  const policy = buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta', relayOrigin });
  const header = buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', relayOrigin });
  const dir = await fixture({
    js: js ?? `export const c = {format:${JSON.stringify(LOCALNET_CONFIG_FORMAT)},ReleaseEnabled:0}; export const b = ${JSON.stringify(LOCALNET_BANNER)};\n`,
    graphModules: graphModules ?? [{ path: 'apps/web/src/localnet/LocalnetRoot.tsx', sha256: '0'.repeat(64) }, { path: 'node_modules/@noble/hashes/sha3.js', sha256: '0'.repeat(64) }],
  });
  await (await import('node:fs/promises')).rename(join(dir, 'assets/vault.worker-a.js'), join(dir, 'assets/localnet.worker-a.js'));
  const effective = csp ?? policy.csp;
  const metas = (documentCsps ?? [effective]).map(value => `<meta http-equiv="Content-Security-Policy" content="${value.replaceAll("'", '&#39;')}">`).join('');
  await writeFile(join(dir, 'index.html'), `<!doctype html><html><head>${metas}<script type="module" src="./assets/index-a.js"></script></head><body></body></html>`);
  await writeFile(join(dir, 'content-policy.json'), JSON.stringify({ ...policy, csp: effective, releaseAcceptance: false, ReleaseEnabled: releaseEnabled }));
  await writeFile(join(dir, '_headers'), `/*\n${(headerCsps ?? [header.csp]).map(value => `  Content-Security-Policy: ${value}\n`).join('')}`);
  const licenses = ['react', 'react-dom', 'scheduler', ...(nobleLicense ? ['@noble/hashes'] : [])].map(name => ({ name, identifier: 'MIT', text: MIT }));
  await writeFile(join(dir, 'third-party-licenses.json'), JSON.stringify(licenses));
  return dir;
}

test('scanBuild: localnet markers, modules, relay origins and policy never pass in default, demo or testnet artifacts', async t => {
  const { LOCALNET_CONFIG_FORMAT, LOCALNET_BANNER } = await configModule();
  const { TESTNET_TRUST_FORMAT } = await import('./testnet-trust.mjs');
  const leaks = [
    { js: `export const f = ${JSON.stringify(LOCALNET_CONFIG_FORMAT)};\n` },
    { js: `export const b = ${JSON.stringify(LOCALNET_BANNER)};\n` },
    { js: 'export const r = "ws://127.0.0.1:7447/";\n' },
    { graphModules: [{ path: 'apps/web/src/localnet/LocalnetRoot.tsx', sha256: '0'.repeat(64) }] },
    { graphModules: [{ path: 'packages/wallet/localnet.ts', sha256: '0'.repeat(64) }] },
    { graphModules: [{ path: 'node_modules/@noble/curves/secp256k1.js', sha256: '0'.repeat(64) }] },
  ];
  for (const leak of leaks) {
    for (const [options, extra] of [[{}, ''], [{ syntheticDemo: true }, `export const s = ${JSON.stringify(SYNTHETIC_MARKERS[0])};\n`], [{ testnet: true }, `export const n = ${JSON.stringify(TESTNET_TRUST_FORMAT)};\n`]]) {
      const dir = await fixture({ js: (leak.js ?? 'export const app = 1;\n') + extra, graphModules: leak.graphModules ?? [] });
      t.after(() => rm(dir, { recursive: true, force: true }));
      await assert.rejects(scanBuild(dir, options), /LOCALNET_DATA_IN_NON_LOCALNET_BUILD/, JSON.stringify({ leak, options }));
    }
  }
  const policyLeak = await localnetFixture();
  t.after(() => rm(policyLeak, { recursive: true, force: true }));
  await assert.rejects(scanBuild(policyLeak), /LOCALNET_DATA_IN_NON_LOCALNET_BUILD/);
  // The localnet policy document alone (no marker, no localnet module, no ws:// anywhere) is refused by its profile.
  for (const [options, extra] of [[{}, ''], [{ syntheticDemo: true }, `export const s = ${JSON.stringify(SYNTHETIC_MARKERS[0])};\n`], [{ testnet: true }, `export const n = ${JSON.stringify(TESTNET_TRUST_FORMAT)};\n`]]) {
    const dir = await fixture({ js: 'export const app = 1;\n' + extra });
    t.after(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, 'content-policy.json'), JSON.stringify({ version: 1, ReleaseEnabled: 0, releaseAcceptance: false, csp: "default-src 'none'",
      manifest: { version: 1, releaseId: 'local-development', delivery: 'meta', profile: 'localnet', connectOrigins: [] } }));
    await assert.rejects(scanBuild(dir, options), /LOCALNET_DATA_IN_NON_LOCALNET_BUILD/, JSON.stringify(options));
  }
});

test('scanBuild: the localnet artifact requires its markers, exact relay-only CSP, ReleaseEnabled 0 and @noble license credits', async t => {
  const dirs = [];
  const make = async options => { const dir = await localnetFixture(options); dirs.push(dir); return dir; };
  t.after(() => Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true }))));
  const expected = { relayOrigin: 'ws://127.0.0.1:7447' };
  const evidence = await scanBuild(await make(), { localnet: expected });
  assert.equal(evidence.ReleaseEnabled, 0);
  assert.deepEqual(evidence.localnet, { relayOrigin: 'ws://127.0.0.1:7447', testFundsOnly: true, connectOrigins: ['ws://127.0.0.1:7447'] });
  const clean = await fixture(); dirs.push(clean);
  await assert.rejects(scanBuild(clean, { localnet: expected }), /LOCALNET_DATA_MISSING/);
  await assert.rejects(scanBuild(await make({ js: 'export const c = {ReleaseEnabled:0};\n' }), { localnet: expected }), /LOCALNET_DATA_MISSING/);
  await assert.rejects(scanBuild(await make(), { localnet: { relayOrigin: 'ws://127.0.0.1:7448' } }), /LOCALNET_POLICY_MISMATCH/);
  const base = (await import('../../../packages/security/src/content-policy.ts')).buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta', relayOrigin: 'ws://127.0.0.1:7447' }).csp;
  await assert.rejects(scanBuild(await make({ csp: base.replace('connect-src ws://127.0.0.1:7447', "connect-src 'self' ws://127.0.0.1:7447") }), { localnet: expected }), /LOCALNET_POLICY_MISMATCH/);
  await assert.rejects(scanBuild(await make({ csp: base.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'") }), { localnet: expected }), /LOCALNET_POLICY_MISMATCH/);
  // index.html alone (content-policy.json and _headers stay exact): a wider, duplicated, missing or default document CSP is refused.
  const security = await import('../../../packages/security/src/content-policy.ts');
  const defaultMeta = security.buildOfflineContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta' }).csp;
  const defaultHeader = security.buildOfflineContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header' }).csp;
  const header = security.buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', relayOrigin: 'ws://127.0.0.1:7447' }).csp;
  for (const documentCsps of [[base.replace('connect-src ws://127.0.0.1:7447', "connect-src 'self' ws://127.0.0.1:7447")], [base, base], [], [defaultMeta],
    [base.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")]])
    await assert.rejects(scanBuild(await make({ documentCsps }), { localnet: expected }), /LOCALNET_POLICY_MISMATCH/, JSON.stringify(documentCsps));
  // _headers alone: a wider, duplicated, missing or default header CSP is refused.
  for (const headerCsps of [[header.replace('connect-src ws://127.0.0.1:7447', "connect-src 'self' ws://127.0.0.1:7447")], [header, header], [], [defaultHeader]])
    await assert.rejects(scanBuild(await make({ headerCsps }), { localnet: expected }), /LOCALNET_POLICY_MISMATCH/, JSON.stringify(headerCsps));
  await assert.rejects(scanBuild(await make({ releaseEnabled: 1 }), { localnet: expected }), /LOCALNET_RELEASE_ENABLED/);
  await assert.rejects(scanBuild(await make({ js: 'export const c = {format:"p2p-offramp/localnet-config/v1",ReleaseEnabled:1}; export const b = "Local test network — test funds only";\n' }), { localnet: expected }), /LOCALNET_RELEASE_ENABLED/);
  await assert.rejects(scanBuild(await make({ nobleLicense: false }), { localnet: expected }), /LICENSE_ATTRIBUTION_MISSING/);
  await assert.rejects(scanBuild(await make(), { localnet: expected, testnet: true }), /LOCALNET_PROFILE_EXCLUSIVE/);
  await assert.rejects(scanBuild(await make(), { localnet: expected, syntheticDemo: true }), /LOCALNET_PROFILE_EXCLUSIVE/);
});

test('buildWeb: localnet is a library-only profile with an explicit config, a distinct output directory and no CLI path', async () => {
  const { buildWeb } = await import('./build.mjs');
  await assert.rejects(buildWeb({ delivery: 'localnet' }), /LOCALNET_CONFIG_REQUIRED/);
  for (const delivery of ['meta', 'header', 'demo', 'testnet']) await assert.rejects(buildWeb({ delivery, localnet: localnetOption() }), /LOCALNET_PROFILE_ONLY/);
  const appRoot = fileURLToPath(new URL('../', import.meta.url));
  for (const name of ['dist', 'dist-demo', 'dist-testnet']) await assert.rejects(buildWeb({ delivery: 'localnet', outDir: join(appRoot, name), localnet: localnetOption() }), /LOCALNET_OUTPUT_DIR/);
  // No default output directory: an explicit outDir is required (the repository ignores only dist, dist-demo and dist-testnet).
  await assert.rejects(buildWeb({ delivery: 'localnet', localnet: localnetOption() }), { message: 'LOCALNET_OUTPUT_DIR_REQUIRED' });
  // Children whose names merely start with '..', nested children and ancestors of an ordinary output directory are all refused.
  for (const path of ['dist/..localnet', 'dist-demo/..x', 'dist-testnet/..x/y', 'dist/x', 'dist-demo/a/..b', '.'])
    await assert.rejects(buildWeb({ delivery: 'localnet', outDir: join(appRoot, path), localnet: localnetOption() }), { message: 'LOCALNET_OUTPUT_DIR' }, path);
  // A symlinked parent that resolves into an ordinary output directory is refused too.
  const linkRoot = await mkdtemp(join(tmpdir(), 'p2p-localnet-outdir-'));
  try {
    await symlink(appRoot, join(linkRoot, 'app'), 'dir');
    await symlink(join(linkRoot, 'missing'), join(linkRoot, 'dangling'), 'dir');
    for (const path of ['app/dist/x', 'app/dist-testnet/..y', 'app', 'dangling/x'])
      await assert.rejects(buildWeb({ delivery: 'localnet', outDir: join(linkRoot, path), localnet: localnetOption() }), { message: 'LOCALNET_OUTPUT_DIR' }, path);
  } finally { await rm(linkRoot, { recursive: true, force: true }); }
  await assert.rejects(buildWeb({ delivery: 'localnet', localnet: { ...localnetOption(), relayUrl: 'wss://relay.example/' } }), /LOCALNET_RELAY_URL/);
  await assert.rejects(buildWeb({ delivery: 'localnet', localnet: localnetOption(), testOnlyLocalProof: { pinnedKeyId: 'a'.repeat(64) } }), /TESTNET_LOCAL_PROOF_INVALID/);
  const cli = fileURLToPath(new URL('./build.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [cli, 'localnet'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, P2P_LOCALNET_CONFIG: '{}', LOCALNET: '1' } }),
    error => /LOCALNET_CONFIG_REQUIRED/.test(String(error.stderr)) && /library-only/.test(String(error.stderr)));
  const { createViteConfig } = await import('../vite.config.ts');
  assert.throws(() => createViteConfig('localnet'), /LOCALNET_CONFIG_REQUIRED/);
  const ordinary = createViteConfig('meta');
  assert.equal(ordinary.define.__P2P_LOCALNET__, 'false');
  assert.equal(ordinary.define.__P2P_LOCALNET_CONFIG__, 'null');
});

test('buildWeb(localnet) emits a relay-only CSP, the test-funds marker, ReleaseEnabled 0 and only allowed modules', { timeout: 300_000 }, async t => {
  const { buildWeb } = await import('./build.mjs');
  const outDir = await mkdtemp(join(tmpdir(), 'p2p-localnet-build-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const evidence = await buildWeb({ delivery: 'localnet', outDir, localnet: localnetOption() });
  assert.equal(evidence.ReleaseEnabled, 0);
  assert.equal(evidence.syntheticDemo, false); assert.equal(evidence.testnet, false);
  assert.deepEqual(evidence.localnet, { relayOrigin: 'ws://127.0.0.1:7447', testFundsOnly: true, connectOrigins: ['ws://127.0.0.1:7447'],
    registrySha256: localnetOption().registrySha256, escrowLayouts: { [LOCALNET_RUNTIME]: 'canonical-get-trade-v1' }, chainId: '31337' });
  const policy = JSON.parse(await readFile(join(outDir, 'content-policy.json'), 'utf8'));
  assert.equal(policy.ReleaseEnabled, 0);
  assert.match(policy.csp, /(?:^|; )connect-src ws:\/\/127\.0\.0\.1:7447(?:;|$)/);
  assert.equal(policy.csp.split('; ').filter(part => part.startsWith('connect-src')).length, 1);
  assert.deepEqual(policy.manifest.connectOrigins, ['ws://127.0.0.1:7447']);
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  assert.ok(html.includes('connect-src ws://127.0.0.1:7447;'));
  const security = await import('../../../packages/security/src/content-policy.ts');
  const metaCsp = security.buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta', relayOrigin: 'ws://127.0.0.1:7447' }).csp;
  const headerCsp = security.buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', relayOrigin: 'ws://127.0.0.1:7447' }).csp;
  assert.equal(policy.csp, metaCsp);
  assert.deepEqual([...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi)].map(match => match[1].replaceAll('&#39;', "'")), [metaCsp]);
  assert.deepEqual([...(await readFile(join(outDir, '_headers'), 'utf8')).matchAll(/^\s*Content-Security-Policy: (.*)$/gm)].map(match => match[1]), [headerCsp]);
  const document = JSON.parse(await readFile(join(outDir, 'core-graph-document.json'), 'utf8')).modules.map(module => module.path);
  const worker = JSON.parse(await readFile(join(outDir, 'core-graph-worker.json'), 'utf8')).modules.map(module => module.path);
  assert.ok(document.includes('apps/web/src/localnet/LocalnetRoot.tsx'));
  assert.ok(document.includes('apps/web/src/localnet/config.ts'));
  assert.ok(worker.includes('apps/web/src/localnet/localnet.worker.ts'));
  assert.ok(worker.includes('apps/web/src/localnet/controller.ts'));
  assert.equal(worker.includes('apps/web/src/workers/vault.worker.ts'), false);
  assert.equal(document.includes('apps/web/src/OfflineRoot.tsx'), false);
  for (const path of [...document, ...worker]) assert.doesNotMatch(path, /evm-execution|chain-solana|extensions|(?:^|\/)(?:test|tests|fixtures)\//);
  const javascript = (await Promise.all((await (await import('node:fs/promises')).readdir(join(outDir, 'assets'))).filter(name => name.endsWith('.js')).map(name => readFile(join(outDir, 'assets', name), 'utf8')))).join('\n');
  assert.ok(javascript.includes('test funds only'));
  const licenses = JSON.parse(await readFile(join(outDir, 'third-party-licenses.json'), 'utf8'));
  const workerProviders = new Set(worker.filter(path => path.startsWith('node_modules/@noble/')).map(path => path.split('/').slice(1, 3).join('/')));
  assert.ok(workerProviders.size >= 3, 'actual localnet worker bundles each reviewed crypto provider');
  for (const name of new Set([...document, ...worker].filter(path => path.startsWith('node_modules/@noble/')).map(path => path.split('/').slice(1, 3).join('/'))))
    assert.ok(licenses.some(item => item.name === name && item.identifier === 'MIT'), name);
});
