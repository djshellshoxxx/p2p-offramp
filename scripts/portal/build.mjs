/** Standalone unsigned source-reference portal. No release proof or recovery executable is minted here. */
import { constants } from 'node:fs';
import { lstat, open, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { SEPOLIA_RELEASE_KEY_ID } from '../../apps/web/src/testnet/sepolia-network.ts';
import { inspectArtifactFiles, safeArtifactPath } from '../../apps/web/scripts/artifact-policy.mjs';
import { isMain } from '../lib/is-main.mjs';
import { PORTAL_META_CSP, PORTAL_HEADERS, PORTAL_HEADER_RECIPE } from './policy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), run = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
export const PORTAL_DOWNLOADS = Object.freeze([
  Object.freeze({ source: 'contracts/evm/abi/BasicEscrow.json', path: 'downloads/BasicEscrow.json', label: 'Canonical BasicEscrow ABI (source reference)' }),
  Object.freeze({ source: 'contracts/evm/src/BasicEscrow.sol', path: 'downloads/BasicEscrow.sol', label: 'Canonical BasicEscrow Solidity source' }),
  Object.freeze({ source: 'docs/recovery/CANONICAL-EVM.md', path: 'downloads/CANONICAL-EVM.md', label: 'Canonical EVM recovery instructions' }),
]);
const INPUTS = [...PORTAL_DOWNLOADS.map(item => item.source), 'apps/portal/index.html', 'apps/portal/portal.css',
  'scripts/portal/build.mjs', 'scripts/portal/policy.mjs', 'apps/web/src/testnet/sepolia-network.ts'];
const fail = code => { throw new Error(code); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

/** Fixed checkout paths only. Reject every symlink component and changing/nonregular/oversized inputs. */
export async function readPortalSource(path) {
  if (!INPUTS.includes(path)) fail('PORTAL_SOURCE_PATH');
  let current = ROOT;
  for (const part of safeArtifactPath(path).split('/')) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink()) fail('PORTAL_SOURCE_SYMLINK');
  }
  return readRegularFile(current);
}
async function readRegularFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(MAX_BYTES)) fail('PORTAL_SOURCE_LIMIT');
    const buffer = Buffer.alloc(MAX_BYTES + 1); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer,length,buffer.length-length,length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await file.stat({ bigint: true });
    if (BigInt(length) !== before.size || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) fail('PORTAL_SOURCE_CHANGED');
    return buffer.subarray(0,length);
  } finally { await file.close(); }
}

/** Portal-specific HTML contract; app scanBuild intentionally requires workers and must not be used here. */
export function validatePortalFiles(files) {
  const expected = ['index.html','portal.css','_headers','content-policy.json',...PORTAL_DOWNLOADS.map(item => item.path)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (JSON.stringify(Object.keys(files).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) !== JSON.stringify(expected)) fail('PORTAL_ASSET_SET');
  for (const [path,bytes] of Object.entries(files)) {
    safeArtifactPath(path);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BYTES) fail('PORTAL_ASSET_LIMIT');
  }
  const html = Buffer.from(files['index.html']).toString('utf8'), css = Buffer.from(files['portal.css']).toString('utf8');
  if (/<(?:script|iframe|object|embed|base|form|input|button|textarea|svg|math|img|audio|video)\b/i.test(html) || /\s(?:on[a-z]+|style|src|srcset|action)\s*=/i.test(html) || /http-equiv\s*=\s*["']refresh/i.test(html) || /__PORTAL_/.test(html)) fail('PORTAL_EXECUTABLE_CONTENT');
  // This is a closed authored-template grammar, not a general HTML sanitizer.
  const tags = new Set(['html','head','meta','title','link','body','a','header','p','strong','h1','main','section','h2','code','ol','li','ul','footer']);
  const globals = ['id','class','aria-labelledby','tabindex','lang'];
  for (const tag of html.matchAll(/<([^>]*)>/g)) {
    if (tag[1] === '!doctype html') continue;
    const parsed = /^(\/?)([a-z][a-z0-9]*)([\s\S]*)$/.exec(tag[1]);
    if (!parsed || !tags.has(parsed[2]) || parsed[1] && parsed[3].trim()) fail('PORTAL_HTML_GRAMMAR');
    let attributes = parsed[3]; const seen = new Set();
    while (attributes.trim()) {
      const attribute = /^\s+([a-z][a-z0-9-]*)(?:=(?:"([^"]*)"|'([^']*)'))?/.exec(attributes);
      if (!attribute || seen.has(attribute[1])) fail('PORTAL_HTML_GRAMMAR');
      const name = attribute[1], value = attribute[2] ?? attribute[3]; seen.add(name);
      const specific = parsed[2] === 'meta' ? ['charset','http-equiv','content','name'] : parsed[2] === 'link' ? ['rel','href'] : parsed[2] === 'a' ? ['href','download'] : [];
      if (![...globals,...specific].includes(name) || (value === undefined && !(name === 'download' && parsed[2] === 'a'))) fail('PORTAL_HTML_GRAMMAR');
      attributes = attributes.slice(attribute[0].length);
    }
  }
  const policy = `<meta http-equiv="Content-Security-Policy" content="${escape(PORTAL_META_CSP)}">`;
  if (html.split(policy).length !== 2 || html.indexOf(policy) > html.search(/<link\b/i) || /<style\b/i.test(html) || /@import|url\s*\(/i.test(css)) fail('PORTAL_POLICY');
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)) {
    const href = match[1];
    if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(href)) {
      if (!html.includes(`id="${href.slice(1)}"`)) fail('PORTAL_LINK');
    } else if (href === './portal-build.json') { /* generated identity report, never a trust root */ }
    else if (!href.startsWith('./') || !Object.hasOwn(files, safeArtifactPath(href.slice(2)))) fail('PORTAL_LINK');
  }
  if (Buffer.from(files._headers).toString('utf8') !== PORTAL_HEADER_RECIPE) fail('PORTAL_POLICY');
  // Reuse the existing byte/path/static-artifact defenses for the remaining assets.
  inspectArtifactFiles(Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'index.html').map(([path,bytes]) => [path,Buffer.from(bytes).toString('utf8')])));
  return { scriptless: true, releaseEnabled: false, approvedDeployment: false };
}

/** Consistency against a caller-retained local report, never signature/bootstrap verification. */
export async function verifyPortalDirectory(directory, report) {
  if (report.format !== 'p2p-offramp/scriptless-portal/v1' || report.releaseEnabled !== false || report.approvedDeployment !== false ||
      report.signedRelease !== false || report.keyConfigured !== false || report.hostHeadersVerified !== false ||
      report.artifactPurpose !== 'unsigned-local-source-reference') fail('PORTAL_REPORT_MISMATCH');
  const files = Object.create(null);
  async function walk(path, prefix = '') {
    for (const name of await readdir(path)) {
      const relative = safeArtifactPath(prefix + name), target = resolve(path,name), stat = await lstat(target);
      if (stat.isSymbolicLink()) fail('PORTAL_ARTIFACT_SYMLINK');
      if (stat.isDirectory()) { if (relative !== 'downloads') fail('PORTAL_ASSET_SET'); await walk(target,relative+'/'); }
      else { if (Object.keys(files).length >= 16 || !stat.isFile()) fail('PORTAL_ASSET_SET'); files[relative] = await readRegularFile(target); }
    }
  }
  if ((await lstat(directory)).isSymbolicLink()) fail('PORTAL_ARTIFACT_SYMLINK');
  await walk(directory);
  const reportBytes = files['portal-build.json']; delete files['portal-build.json'];
  if (!reportBytes || !reportBytes.equals(Buffer.from(JSON.stringify(report,null,2)+'\n'))) fail('PORTAL_REPORT_MISMATCH');
  validatePortalFiles(files);
  if (!Array.isArray(report.assets) || report.assets.length !== Object.keys(files).length) fail('PORTAL_ASSET_SET');
  if (JSON.stringify(report.assets.map(asset=>asset.path).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) !== JSON.stringify(Object.keys(files).sort((left, right) => left < right ? -1 : left > right ? 1 : 0))) fail('PORTAL_ASSET_SET');
  for (const asset of report.assets) {
    safeArtifactPath(asset.path);
    if (!files[asset.path] || asset.bytes !== files[asset.path].length || asset.sha256 !== sha256(files[asset.path])) fail('PORTAL_ASSET_MISMATCH');
  }
  return true;
}

export async function buildPortal({ outDir = resolve(ROOT,'apps/portal/dist') } = {}) {
  // There is no approved profile today. A future configured key needs explicit existing-proof integration.
  if (SEPOLIA_RELEASE_KEY_ID !== null) fail('PORTAL_APPROVED_PROFILE_UNIMPLEMENTED');
  const git = async args => (await run('git',args,{cwd:ROOT,maxBuffer:1024*1024})).stdout.trim();
  const commit = await git(['rev-parse','HEAD']), status = await git(['status','--porcelain=v1','--untracked-files=all']);
  if (!/^[0-9a-f]{40}$/.test(commit)) fail('PORTAL_SOURCE_IDENTITY');
  const sources = Object.fromEntries(await Promise.all(INPUTS.map(async path => [path,await readPortalSource(path)])));
  const files = Object.fromEntries(PORTAL_DOWNLOADS.map(item => [item.path,sources[item.source]]));
  const downloadList = '<ul class="downloads">' + PORTAL_DOWNLOADS.map(item => `<li><a href="./${item.path}" download>${escape(item.label)}</a><p>${files[item.path].length} bytes · SHA-256<code>${sha256(files[item.path])}</code></p></li>`).join('') + '</ul>';
  let html = sources['apps/portal/index.html'].toString('utf8');
  for (const [name,value] of Object.entries({ POLICY:escape(PORTAL_META_CSP), COMMIT:commit, WORKTREE:status ? 'Modified or untracked sources (not a clean commit)' : 'Clean at recorded commit', DOWNLOADS:downloadList })) {
    const token = `__PORTAL_${name}__`;
    if (html.split(token).length !== 2) fail('PORTAL_TEMPLATE');
    html = html.replace(token,()=>value);
  }
  files['index.html'] = Buffer.from(html); files['portal.css'] = sources['apps/portal/portal.css'];
  files._headers = Buffer.from(PORTAL_HEADER_RECIPE);
  files['content-policy.json'] = Buffer.from(JSON.stringify({ version:1, meta:PORTAL_META_CSP, headers:PORTAL_HEADERS,
    hostHeadersVerified:false, metaFrameAncestorsSupported:false, releaseAcceptance:false },null,2)+'\n');
  validatePortalFiles(files);
  const identities = values => Object.entries(values).sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha256(bytes)}));
  const report = { format:'p2p-offramp/scriptless-portal/v1', sourceCommit:commit, sourceDirty:status !== '', sourceStatusSha256:sha256(status),
    sourceAssets:identities(sources), assets:identities(files), keyConfigured:false, approvedDeployment:false, signedRelease:false, releaseEnabled:false,
    hostHeadersVerified:false, reportSelfHashIncluded:false, artifactPurpose:'unsigned-local-source-reference' };
  // Bind the bytes actually read; do not label a concurrently changing checkout as one source snapshot.
  for (const path of INPUTS) if (!sources[path].equals(await readPortalSource(path))) fail('PORTAL_SOURCE_CHANGED');
  if (commit !== await git(['rev-parse','HEAD']) || status !== await git(['status','--porcelain=v1','--untracked-files=all'])) fail('PORTAL_SOURCE_CHANGED');
  files['portal-build.json'] = Buffer.from(JSON.stringify(report,null,2)+'\n');
  const directory = resolve(outDir); let created = false;
  try {
    // Never replace an existing output, follow an output symlink, or delete a caller's existing directory.
    await mkdir(directory); created = true;
    for (const [path,bytes] of Object.entries(files)) { await mkdir(dirname(resolve(directory,path)),{recursive:true}); await writeFile(resolve(directory,path),bytes,{flag:'wx'}); }
    await verifyPortalDirectory(directory,report);
    return { directory, report };
  } catch (error) { if (created) await rm(directory,{recursive:true,force:true}); throw error; }
}
if (isMain(import.meta.url)) {
  try {
    const {values,positionals} = parseArgs({options:{out:{type:'string'}},strict:true,allowPositionals:true});
    if (positionals.length) fail('PORTAL_ARGUMENTS');
    const result = await buildPortal(values.out === undefined ? {} : {outDir:values.out});
    console.log(JSON.stringify({ok:true,sourceCommit:result.report.sourceCommit,sourceDirty:result.report.sourceDirty,releaseEnabled:false,approvedDeployment:false}));
  } catch { console.log(JSON.stringify({ok:false,error:{code:'PORTAL_BUILD_REFUSED'}})); process.exitCode=1; }
}
