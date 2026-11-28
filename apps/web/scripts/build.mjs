/** Local development artifact, never a signed release or deployment attestation. */
import { build } from 'vite';
import { readdir, readFile, lstat, realpath, writeFile } from 'node:fs/promises';
import { resolve, relative, sep, isAbsolute, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';
import { loadTestnetTrust, TESTNET_TRUST_FORMAT_PREFIX } from './testnet-trust.mjs';
import { isMain } from '../../../scripts/lib/is-main.mjs';
import { buildLocalnetContentPolicy, buildSolanaLocalnetContentPolicy } from '../../../packages/security/src/content-policy.ts';
import { LOCALNET_BANNER, LOCALNET_CONFIG_FORMAT, localnetConfigDocument, parseLocalnetConfig } from '../src/localnet/config.ts';
import { completeQrWorkerLicense, inspectQrArtifact } from './qr-build-policy.mjs';
import { SOLANA_LOCALNET_BANNER, SOLANA_LOCALNET_FORMAT, solanaLocalnetConfigDocument, parseSolanaLocalnetConfig } from '../src/solana-localnet/config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
/** Vite's document license report excludes dependencies bundled only in a native Worker. */
async function completeWorkerLicenses(directory) {
  const graph = JSON.parse(await readFile(resolve(directory, 'core-graph-worker.json'), 'utf8'));
  const inventoryPath = resolve(directory, 'third-party-licenses.json');
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  if (!Array.isArray(graph.modules) || !Array.isArray(inventory)) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  const names = new Set();
  for (const module of graph.modules) {
    if (typeof module.path !== 'string' || !module.path.startsWith('node_modules/')) continue;
    const match = /^node_modules\/(@noble\/(?:curves|hashes|ciphers)|react|react-dom|scheduler)\//.exec(module.path);
    if (!match) throw new Error('UNREVIEWED_DEPENDENCY');
    names.add(match[1]);
  }
  for (const name of [...names].sort()) {
    const packageRoot = resolve(root, '../../node_modules', name);
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    const license = await readFile(resolve(packageRoot, 'LICENSE'), 'utf8');
    if (manifest.name !== name || typeof manifest.version !== 'string' || manifest.license !== 'MIT' || !license.includes('Permission is hereby granted')) throw new Error('LICENSE_ATTRIBUTION_MISSING');
    const existing = inventory.find(item => item.name === name && item.version === manifest.version);
    if (existing) {
      if (existing.identifier !== 'MIT' || !existing.text?.includes('Permission is hereby granted')) throw new Error('LICENSE_ATTRIBUTION_MISSING');
    } else inventory.push({ name, version: manifest.version, identifier: manifest.license, text: license });
  }
  await completeQrWorkerLicense(directory, inventory, resolve(root, '../../node_modules'));
  inventory.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));
  await writeFile(inventoryPath, JSON.stringify(inventory, null, 2) + '\n');
}
/** Strings that only the synthetic demo module contains (registry release ID and pinned registry digest). */
export const SYNTHETIC_MARKERS = Object.freeze(['test-local-only', '14e7ecfb5aff74253affe0d2e8560728763f01db405bcc7efdca964ef103ca6a']);
/** Strings only the localnet artifact carries (embedded config format and the visible test-funds banner). */
export const LOCALNET_MARKERS = Object.freeze([LOCALNET_CONFIG_FORMAT, LOCALNET_BANNER]);
/** Module paths only the localnet build may contain (mirrors static-build-plugin.mjs localnet admissions). */
const LOCALNET_GRAPH_MODULE = /^(?:apps\/web\/src\/localnet\/|packages\/(?:wallet|domain|chain-evm)\/localnet\.ts$|packages\/(?:chain-evm|relay|exchange)\/|packages\/wallet\/src\/evm-|node_modules\/@noble\/)/;
export const SOLANA_LOCALNET_MARKERS = Object.freeze([SOLANA_LOCALNET_FORMAT, SOLANA_LOCALNET_BANNER]);
const SOLANA_LOCALNET_GRAPH_MODULE = /^(?:apps\/web\/src\/solana-localnet\/|packages\/chain-solana\/)/;
const decodeAttribute = value => value.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
/**
 * Localnet-only evidence: the artifact must carry the markers, the exact relay-only CSP (document meta, content-policy.json
 * and _headers), ReleaseEnabled 0 wherever it is stated, and MIT credits for every bundled @noble package.
 */
function checkLocalnetArtifact(files, graphPaths, relayOrigin) {
  if (!LOCALNET_MARKERS.every(marker => Object.entries(files).some(([path, text]) => path.endsWith('.js') && text.includes(marker))) ||
      !graphPaths.includes('apps/web/src/localnet/LocalnetRoot.tsx')) throw new Error('LOCALNET_DATA_MISSING');
  const policy = JSON.parse(files['content-policy.json'] ?? 'null');
  if (policy?.ReleaseEnabled !== 0 || policy.releaseAcceptance !== false) throw new Error('LOCALNET_RELEASE_ENABLED');
  const stated = Object.entries(files).filter(([path]) => path.endsWith('.js')).flatMap(([, text]) => [...text.matchAll(/["']?\bReleaseEnabled["']?\s*:\s*([^,}\s]+)/g)].map(match => match[1]));
  if (stated.length === 0 || stated.some(value => value !== '0')) throw new Error('LOCALNET_RELEASE_ENABLED');
  let meta, header;
  try {
    meta = buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta', relayOrigin });
    header = buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', relayOrigin });
  } catch { throw new Error('LOCALNET_POLICY_MISMATCH'); }
  const documentPolicies = [...(files['index.html'] ?? '').matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi)].map(match => decodeAttribute(match[1]));
  const headerPolicies = [...(files._headers ?? '').matchAll(/^\s*Content-Security-Policy: (.*)$/gm)].map(match => match[1]);
  if (policy.csp !== meta.csp || JSON.stringify(policy.manifest?.connectOrigins) !== JSON.stringify([relayOrigin]) || policy.manifest?.profile !== 'localnet' ||
      documentPolicies.length !== 1 || documentPolicies[0] !== meta.csp || headerPolicies.length !== 1 || headerPolicies[0] !== header.csp) throw new Error('LOCALNET_POLICY_MISMATCH');
  const licenses = JSON.parse(files['third-party-licenses.json'] ?? 'null');
  const noble = new Set(graphPaths.filter(path => path.startsWith('node_modules/@noble/')).map(path => path.split('/').slice(1, 3).join('/')));
  for (const name of noble) if (!licenses.some(item => item.name === name && item.identifier === 'MIT' && typeof item.text === 'string' && item.text.includes('Permission is hereby granted'))) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  return { relayOrigin, testFundsOnly: true, connectOrigins: [relayOrigin] };
}
function checkSolanaLocalnetArtifact(files, graphPaths, rpcOrigin) {
  if (!SOLANA_LOCALNET_MARKERS.every(marker => Object.entries(files).some(([path, value]) => path.endsWith('.js') && value.includes(marker))) ||
      !graphPaths.includes('apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx') || !graphPaths.includes('apps/web/src/solana-localnet/rpc.ts')) throw new Error('SOLANA_LOCALNET_DATA_MISSING');
  const policy = JSON.parse(files['content-policy.json'] ?? 'null');
  const make = delivery => buildSolanaLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery, rpcOrigin });
  const meta = make('meta'), header = make('header');
  const documentPolicies = [...(files['index.html'] ?? '').matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi)].map(match => decodeAttribute(match[1]));
  const headerPolicies = [...(files._headers ?? '').matchAll(/^\s*Content-Security-Policy: (.*)$/gm)].map(match => match[1]);
  if (policy?.ReleaseEnabled !== 0 || policy.releaseAcceptance !== false || policy.manifest?.profile !== 'solana-localnet' ||
      policy.csp !== meta.csp || JSON.stringify(policy.manifest?.connectOrigins) !== JSON.stringify([rpcOrigin]) ||
      documentPolicies.length !== 1 || documentPolicies[0] !== meta.csp || headerPolicies.length !== 1 || headerPolicies[0] !== header.csp) throw new Error('SOLANA_LOCALNET_POLICY_MISMATCH');
  const stated = Object.entries(files).filter(([path]) => path.endsWith('.js')).flatMap(([, value]) => [...value.matchAll(/["']?\bReleaseEnabled["']?\s*:\s*([^,}\s]+)/g)].map(match => match[1]));
  if (!stated.length || stated.some(value => value !== '0')) throw new Error('SOLANA_LOCALNET_RELEASE_ENABLED');
  const licenses = JSON.parse(files['third-party-licenses.json'] ?? 'null');
  for (const path of graphPaths.filter(path => path.startsWith('node_modules/@noble/'))) {
    const name = path.split('/').slice(1, 3).join('/');
    if (!licenses.some(item => item.name === name && item.identifier === 'MIT' && item.text?.includes('Permission is hereby granted'))) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  }
  return { rpcOrigin, testFundsOnly: true, connectOrigins: [rpcOrigin] };
}
/**
 * `localnet` ({ relayOrigin }) is passed only for the library-only localnet artifact. Every other scan refuses any localnet
 * marker, module, `ws://` string or localnet policy, so default/demo/testnet artifacts cannot carry localnet data.
 */
export async function scanBuild(directory, { syntheticDemo = false, testnet = false, localnet = null, solanaLocalnet = null } = {}) {
  const files = Object.create(null), identities = Object.create(null);
  async function walk(path) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const target = resolve(path, item.name), stat = await lstat(target);
      if (stat.isSymbolicLink()) throw new Error('ARTIFACT_SYMLINK');
      const artifactPath = safeArtifactPath(relative(directory, target).split(sep).join('/'));
      if (stat.isDirectory()) await walk(target);
      else if (stat.isFile()) {
        if (Object.hasOwn(identities, artifactPath)) throw new Error('ARTIFACT_POLICY: paths');
        const bytes = await readFile(target);
        // Identity binds the file on disk, independently of its text-policy decoding.
        identities[artifactPath] = { path: artifactPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
        files[artifactPath] = bytes.toString('utf8');
      }
      else throw new Error('ARTIFACT_TYPE');
    }
  }
  await walk(directory);
  const assets = Object.keys(files).sort().map(path => identities[path]);
  const inspection = { ...inspectArtifactFiles(files), bytes: assets.reduce((total, asset) => total + asset.bytes, 0) };
  const workers = assets.filter(item => /^assets\/(?:vault|localnet|solana-localnet)\.worker-[A-Za-z0-9_-]+\.js$/.test(item.path));
  if (workers.length !== 1) throw new Error('NATIVE_WORKER_ASSET_MISSING');
  const licenses = JSON.parse(files['third-party-licenses.json'] ?? 'null');
  if (!Array.isArray(licenses) || ['react', 'react-dom', 'scheduler'].some(name => !licenses.some(item => item.name === name && item.identifier === 'MIT' && typeof item.text === 'string' && item.text.includes('Permission is hereby granted')))) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  for (const graph of ['core-graph-document.json', 'core-graph-worker.json']) if (!files[graph]) throw new Error('CORE_GRAPH_MISSING');
  const qr = inspectQrArtifact(files, JSON.parse(files['core-graph-document.json']).modules, JSON.parse(files['core-graph-worker.json']).modules);
  if (localnet && (syntheticDemo || testnet || solanaLocalnet) || solanaLocalnet && (syntheticDemo || testnet)) throw new Error('LOCALNET_PROFILE_EXCLUSIVE');
  const graphPaths = ['core-graph-document.json', 'core-graph-worker.json'].flatMap(graph => {
    const modules = JSON.parse(files[graph]).modules;
    return Array.isArray(modules) ? modules.map(module => module?.path).filter(path => typeof path === 'string') : [];
  });
  const localnetPolicyDocument = (() => { try { return JSON.parse(files['content-policy.json'] ?? 'null')?.manifest?.profile === 'localnet'; } catch { return false; } })();
  const containsLocalnet = localnetPolicyDocument || graphPaths.some(path => LOCALNET_GRAPH_MODULE.test(path) && !(solanaLocalnet && path.startsWith('node_modules/@noble/'))) ||
    Object.values(files).some(text => text.includes('ws://') || LOCALNET_MARKERS.some(marker => text.includes(marker)));
  if (containsLocalnet !== Boolean(localnet)) throw new Error(localnet ? 'LOCALNET_DATA_MISSING' : 'LOCALNET_DATA_IN_NON_LOCALNET_BUILD');
  const containsSolana = graphPaths.some(path => SOLANA_LOCALNET_GRAPH_MODULE.test(path)) ||
    Object.values(files).some(value => SOLANA_LOCALNET_MARKERS.some(marker => value.includes(marker))) || JSON.parse(files['content-policy.json'] ?? 'null')?.manifest?.profile === 'solana-localnet';
  if (containsSolana !== Boolean(solanaLocalnet)) throw new Error(solanaLocalnet ? 'SOLANA_LOCALNET_DATA_MISSING' : 'SOLANA_DATA_IN_NON_SOLANA_BUILD');
  if (!workers[0].path.startsWith(solanaLocalnet ? 'assets/solana-localnet.worker-' : localnet ? 'assets/localnet.worker-' : 'assets/vault.worker-')) throw new Error('WORKER_PROFILE_MISMATCH');
  const localnetEvidence = localnet ? checkLocalnetArtifact(files, graphPaths, localnet.relayOrigin) : null;
  const solanaEvidence = solanaLocalnet ? checkSolanaLocalnetArtifact(files, graphPaths, solanaLocalnet.rpcOrigin) : null;
  const demoModules = ['core-graph-document.json', 'core-graph-worker.json']
    .some(graph => JSON.parse(files[graph]).modules?.some(module => typeof module.path === 'string' && module.path.startsWith('apps/web/src/demo/')));
  const containsSynthetic = demoModules || Object.values(files).some(text => SYNTHETIC_MARKERS.some(marker => text.includes(marker)));
  if (containsSynthetic !== syntheticDemo) throw new Error(syntheticDemo ? 'SYNTHETIC_DEMO_DATA_MISSING' : 'SYNTHETIC_DATA_IN_DEFAULT_BUILD');
  // The testnet registry source and its embedded trust bundle belong to the testnet build only, and must be there.
  const testnetModules = ['core-graph-document.json', 'core-graph-worker.json']
    .some(graph => JSON.parse(files[graph]).modules?.some(module => typeof module.path === 'string' && module.path.startsWith('apps/web/src/testnet/')));
  // Any bundle version (the current one or a refused legacy one) counts as testnet trust data.
  const containsTestnet = testnetModules || Object.values(files).some(text => text.includes(TESTNET_TRUST_FORMAT_PREFIX));
  if (containsTestnet !== testnet) throw new Error(testnet ? 'TESTNET_TRUST_DATA_MISSING' : 'TESTNET_DATA_IN_NON_TESTNET_BUILD');
  return { version: 1, ReleaseEnabled: 0, syntheticDemo, testnet, signedRelease: false, releaseAcceptance: false, framingAttestation: false, inspection, assets,
    ...(localnetEvidence ? { localnet: localnetEvidence } : {}), ...(solanaEvidence ? { solanaLocalnet: solanaEvidence } : {}), ...(qr ? { qr } : {}) };
}
/**
 * `demo` is a meta-delivery build that additionally includes the synthetic local registry and samples. `testnet` is a
 * meta-delivery build that embeds the owner-signed Sepolia registry, verified here first (fail closed) and again at
 * runtime. `trustRoot` (testnet only) is the directory holding the trust files; it defaults to the repository root.
 * `testOnlyLocalProof` is a library-only fixture seam requiring explicit paths and an independently supplied pin;
 * its artifacts are labelled unapproved local proofs and keep every trading/network permission disabled.
 */
export async function buildWeb({ delivery = 'meta', outDir, trustRoot, nowSeconds, testOnlyLocalProof, localnet, solanaLocalnet } = {}) {
  if (!['meta', 'header', 'demo', 'testnet', 'localnet', 'solana-localnet'].includes(delivery)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  if (localnet !== undefined && delivery !== 'localnet') throw new Error('LOCALNET_PROFILE_ONLY');
  if (delivery === 'localnet' && localnet === undefined) throw new Error('LOCALNET_CONFIG_REQUIRED');
  if (solanaLocalnet !== undefined && delivery !== 'solana-localnet') throw new Error('SOLANA_LOCALNET_PROFILE_ONLY');
  if (delivery === 'solana-localnet' && solanaLocalnet === undefined) throw new Error('SOLANA_LOCALNET_CONFIG_REQUIRED');
  const syntheticDemo = delivery === 'demo', testnet = delivery === 'testnet';
  // Test harnesses may supply an independent ephemeral pin. No CLI/environment input exposes this seam.
  // Requiring explicit paths keeps a fixture artifact separate from the ordinary output and repository trust files.
  if (testOnlyLocalProof !== undefined && (!testnet || !outDir || !trustRoot ||
      typeof testOnlyLocalProof?.pinnedKeyId !== 'string' || !/^[0-9a-f]{64}$/.test(testOnlyLocalProof.pinnedKeyId))) throw new Error('TESTNET_LOCAL_PROOF_INVALID');
  if (delivery === 'localnet') return buildLocalnet(outDir, localnet);
  if (delivery === 'solana-localnet') return buildSolanaLocalnet(outDir, solanaLocalnet);
  const trust = testnet ? await loadTestnetTrust(trustRoot ?? resolve(root, '../..'), {
    ...(nowSeconds ? { nowSeconds } : {}), ...(testOnlyLocalProof ? { pinnedKeyId: testOnlyLocalProof.pinnedKeyId } : {}) }) : null;
  outDir ??= resolve(root, syntheticDemo ? 'dist-demo' : testnet ? 'dist-testnet' : 'dist');
  await build({ configFile: resolve(root, 'vite.config.ts'), mode: delivery, build: { outDir },
    ...(trust ? { define: { __P2P_TESTNET_TRUST__: JSON.stringify(trust.bundle),
      __P2P_TESTNET_LOCAL_PROOF_KEY_ID__: JSON.stringify(testOnlyLocalProof?.pinnedKeyId ?? null) } } : {}) });
  await completeWorkerLicenses(outDir);
  const evidence = { ...await scanBuild(outDir, { syntheticDemo, testnet }), ...(trust ? { testnetTrust: { ...trust.summary, localProof: testOnlyLocalProof !== undefined, ownerApproved: testOnlyLocalProof === undefined } } : {}) };
  await writeFile(resolve(outDir, 'local-build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
/**
 * Library-only localnet profile (A3): `localnet` is { registryBytes | registryJson, registrySha256, escrowLayouts, relayUrl }
 * (see apps/web/src/localnet/config.ts). It is validated strictly before the build, embedded as frozen JSON, and the CSP
 * connect-src names only its loopback relay origin. Output goes only to an explicit outDir (there is no default, because
 * the repository ignores only the ordinary output directories) that is neither inside nor an ancestor of dist, dist-demo or
 * dist-testnet, after resolving symlinks. Nothing here reads the environment or the command line.
 */
async function buildLocalnet(outDir, localnet) {
  const document = localnetConfigDocument(localnet);
  const config = await parseLocalnetConfig(document);
  outDir = await localOutputDirectory(outDir);
  const { createViteConfig } = await import('../vite.config.ts');
  const viteConfig = createViteConfig('localnet', { document, relayOrigin: config.relayOrigin });
  await build({ ...viteConfig, configFile: false, mode: 'localnet', build: { ...viteConfig.build, outDir } });
  await completeWorkerLicenses(outDir);
  const scanned = await scanBuild(outDir, { localnet: { relayOrigin: config.relayOrigin } });
  const evidence = { ...scanned, localnet: { ...scanned.localnet, registrySha256: config.registrySha256, escrowLayouts: { ...config.escrowLayouts }, chainId: config.network.chainIdentity } };
  await writeFile(resolve(outDir, 'local-build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
async function buildSolanaLocalnet(outDir, option) {
  const document = solanaLocalnetConfigDocument(option), config = await parseSolanaLocalnetConfig(document);
  outDir = await localOutputDirectory(outDir);
  const { createViteConfig } = await import('../vite.config.ts');
  const viteConfig = createViteConfig('solana-localnet', null, { document, rpcOrigin: config.rpcOrigin });
  await build({ ...viteConfig, configFile: false, mode: 'solana-localnet', build: { ...viteConfig.build, outDir } });
  await completeWorkerLicenses(outDir);
  const scanned = await scanBuild(outDir, { solanaLocalnet: { rpcOrigin: config.rpcOrigin } });
  const evidence = { ...scanned, solanaLocalnet: { ...scanned.solanaLocalnet, registrySha256: config.registrySha256, genesisHash: config.network.genesisHash } };
  await writeFile(resolve(outDir, 'local-build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
async function localOutputDirectory(outDir) {
  if (outDir === undefined) throw new Error('LOCALNET_OUTPUT_DIR_REQUIRED');
  if (typeof outDir !== 'string' || outDir.length === 0) throw new Error('LOCALNET_OUTPUT_DIR');
  const realRoot = await realpath(root);
  const ordinary = ['dist', 'dist-demo', 'dist-testnet'].flatMap(name => [resolve(root, name), resolve(realRoot, name)]);
  outDir = resolve(outDir);
  const candidates = [outDir, await resolveExistingAncestor(outDir)];
  // Same containment test as scripts/check-import-boundaries.mjs within(): '..name' is a child, '..' or '../x' is not.
  const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)); };
  if (ordinary.some(directory => candidates.some(candidate => inside(directory, candidate) || inside(candidate, directory)))) throw new Error('LOCALNET_OUTPUT_DIR');
  return outDir;
}
/** `path` with symlinks resolved in its deepest existing ancestor; a dangling link on the way fails closed. */
async function resolveExistingAncestor(path) {
  const missing = [];
  for (let current = path; ;) {
    try { return resolve(await realpath(current), ...missing); } catch (error) { if (error?.code !== 'ENOENT') throw new Error('LOCALNET_OUTPUT_DIR'); }
    let present = true;
    try { await lstat(current); } catch (error) { if (error?.code !== 'ENOENT') throw new Error('LOCALNET_OUTPUT_DIR'); present = false; }
    if (present) throw new Error('LOCALNET_OUTPUT_DIR');
    const parent = dirname(current);
    if (parent === current) throw new Error('LOCALNET_OUTPUT_DIR');
    missing.unshift(basename(current)); current = parent;
  }
}
export const LOCALNET_CLI_REFUSAL = 'LOCALNET_CONFIG_REQUIRED: the localnet build profile is library-only. Call buildWeb({ delivery: \'localnet\', outDir, localnet: { registryBytes, registrySha256, escrowLayouts, relayUrl } }) from a test harness; no command-line argument or environment variable enables it.';
if (isMain(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('BUILD_ARGUMENTS');
  if (process.argv[2] === 'localnet') { console.error(LOCALNET_CLI_REFUSAL); process.exit(1); }
  if (process.argv[2] === 'solana-localnet') throw new Error('SOLANA_LOCALNET_CONFIG_REQUIRED: library-only explicit local validator fixture');
  const evidence = await buildWeb({ delivery: process.argv[2] ?? 'meta' });
  console.log(JSON.stringify({ localStaticBuild: true, syntheticDemo: evidence.syntheticDemo, ...evidence.inspection, signedRelease: false, releaseAcceptance: false }));
}
