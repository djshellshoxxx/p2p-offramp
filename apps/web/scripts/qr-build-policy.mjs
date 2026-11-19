/** The public image decoder is a separate, exact module/asset role; it is never a private runtime Worker. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const QR_DECODER_ENTRY = 'apps/web/src/qr/decode.worker.ts';
export const QR_DECODER_GRAPH = 'qr-graph-worker.json';
export const JSQR_DIST_SHA256 = 'bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859';
export const QR_DECODER_MODULES = Object.freeze([QR_DECODER_ENTRY, 'apps/web/src/qr/decoder.ts', 'apps/web/src/qr/protocol.ts', 'node_modules/jsqr/dist/jsQR.js']);
const allowed = new Set(QR_DECODER_MODULES);
const assetPattern = /^assets\/decode\.worker-[A-Za-z0-9_-]+\.js$/;
const digest = value => createHash('sha256').update(value).digest('hex');
export function assertQrDecoderModule(path) { if (!allowed.has(path)) throw new Error(`QR_DECODER_MODULE: ${path}`); }
export function assertNotQrDecoderModule(path) {
  if (path === QR_DECODER_ENTRY || path === 'apps/web/src/qr/decoder.ts' || /(?:^|\/)node_modules\/jsqr(?:\/|$)/.test(path)) throw new Error(`QR_DECODER_SCOPE: ${path}`);
}
function checkedModules(modules) {
  if (!Array.isArray(modules) || modules.length !== allowed.size || new Set(modules.map(item => item?.path)).size !== allowed.size) throw new Error('QR_DECODER_MODULE');
  for (const item of modules) {
    assertQrDecoderModule(item?.path);
    if (!/^[0-9a-f]{64}$/.test(item.sha256)) throw new Error('QR_DECODER_MODULE');
    if (item.path === 'node_modules/jsqr/dist/jsQR.js' && item.sha256 !== JSQR_DIST_SHA256) throw new Error('QR_DECODER_PIN');
  }
}
export function qrDecoderGraph(modules, bundle, repositoryPath) {
  checkedModules(modules);
  const entries = Object.values(bundle).filter(file => file.type === 'chunk' && file.isEntry);
  if (entries.length !== 1 || !assetPattern.test(entries[0].fileName) || repositoryPath(entries[0].facadeModuleId) !== QR_DECODER_ENTRY) throw new Error('QR_DECODER_ASSET');
  return { version: 1, scope: 'public-qr-decoder', entry: QR_DECODER_ENTRY,
    asset: { path: entries[0].fileName, sha256: digest(entries[0].code) }, modules,
    authority: 'none', privateRuntime: false, network: false };
}
function parseGraph(text) {
  let graph;
  try { graph = JSON.parse(text); } catch { throw new Error('QR_DECODER_GRAPH'); }
  if (graph?.version !== 1 || graph.scope !== 'public-qr-decoder' || graph.entry !== QR_DECODER_ENTRY ||
    graph.authority !== 'none' || graph.privateRuntime !== false || graph.network !== false) throw new Error('QR_DECODER_GRAPH');
  checkedModules(graph.modules); return graph;
}
export function inspectQrArtifact(files, documentModules, nativeModules) {
  if (!Array.isArray(documentModules) || !Array.isArray(nativeModules)) throw new Error('CORE_GRAPH_INVALID');
  for (const module of [...documentModules, ...nativeModules]) assertNotQrDecoderModule(module.path);
  const expected = documentModules.some(item => item.path === 'apps/web/src/ui/QrPanel.tsx');
  const assets = Object.keys(files).filter(path => assetPattern.test(path));
  const graphPresent = Object.hasOwn(files, QR_DECODER_GRAPH);
  if (!expected) {
    if (assets.length || graphPresent) throw new Error('QR_DECODER_UNREACHABLE');
    return null;
  }
  if (!graphPresent) throw new Error('QR_DECODER_GRAPH');
  if (assets.length !== 1) throw new Error('QR_DECODER_ASSET');
  const graph = parseGraph(files[QR_DECODER_GRAPH]);
  if (graph.asset?.path !== assets[0] || graph.asset?.sha256 !== digest(files[assets[0]])) throw new Error('QR_DECODER_ASSET');
  let licenses;
  try { licenses = JSON.parse(files['third-party-licenses.json']); } catch { throw new Error('LICENSE_ATTRIBUTION_MISSING'); }
  if (!Array.isArray(licenses) || !licenses.some(item => item.name === 'jsqr' && item.version === '1.4.0' && item.identifier === 'Apache-2.0' &&
    typeof item.text === 'string' && item.text.includes('Apache License') && item.text.includes('Version 2.0'))) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  return { decoderVersion: '1.4.0', dependencySha256: JSQR_DIST_SHA256, graph: QR_DECODER_GRAPH, worker: graph.asset.path, authority: 'none', physicalDeviceQualification: false };
}
export async function completeQrWorkerLicense(directory, inventory, dependencyRoot) {
  let text;
  try { text = await readFile(resolve(directory, QR_DECODER_GRAPH), 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  parseGraph(text);
  const root = resolve(dependencyRoot, 'jsqr');
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const license = await readFile(resolve(root, 'LICENSE'), 'utf8');
  if (manifest.name !== 'jsqr' || manifest.version !== '1.4.0' || manifest.license !== 'Apache-2.0' ||
    !license.includes('Apache License') || !license.includes('Version 2.0') || digest(await readFile(resolve(root, 'dist/jsQR.js'))) !== JSQR_DIST_SHA256) throw new Error('QR_DECODER_PIN');
  const existing = inventory.find(item => item.name === 'jsqr');
  if (existing) {
    if (existing.version !== '1.4.0' || existing.identifier !== 'Apache-2.0' || existing.text !== license) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  } else inventory.push({ name: manifest.name, version: manifest.version, identifier: manifest.license, text: license });
}
