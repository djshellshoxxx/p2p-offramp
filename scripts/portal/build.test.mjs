import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPortal, PORTAL_DOWNLOADS, readPortalSource, sha256, validatePortalFiles, verifyPortalDirectory } from './build.mjs';
import { PORTAL_HEADERS } from './policy.mjs';

test('unsigned scriptless build binds genuine source bytes and reports missing trust without approval',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'portal-unit-')); t.after(()=>rm(temp,{recursive:true,force:true}));
  const directory=join(temp,'portal'), built=await buildPortal({outDir:directory});
  assert.equal(await verifyPortalDirectory(directory,built.report),true);
  assert.equal(built.report.releaseEnabled,false); assert.equal(built.report.keyConfigured,false);
  assert.equal(built.report.approvedDeployment,false); assert.equal(built.report.signedRelease,false); assert.equal(built.report.hostHeadersVerified,false);
  assert.match(built.report.sourceCommit,/^[a-f0-9]{40}$/); assert.equal(typeof built.report.sourceDirty,'boolean');
  const repeated=await buildPortal({outDir:join(temp,'same-source')});
  assert.deepEqual(repeated.report,built.report,'unchanged source/status produces the same identity report');
  for(const asset of built.report.assets)assert.deepEqual(await readFile(join(repeated.directory,asset.path)),await readFile(join(directory,asset.path)));
  const html=await readFile(join(directory,'index.html'),'utf8');
  assert.match(html,/Trading disabled/);assert.match(html,/No approved deployment/);assert.match(html,/No approved release key/);
  for(const item of PORTAL_DOWNLOADS){
    const copied=await readFile(join(directory,item.path)),source=await readPortalSource(item.source);
    assert.deepEqual(copied,source);assert.ok(html.includes(sha256(source)));
    const recorded=built.report.assets.find(asset=>asset.path===item.path);assert.equal(recorded.sha256,sha256(source));assert.equal(recorded.bytes,source.length);
  }
  const files=Object.fromEntries(await Promise.all(built.report.assets.map(async asset=>[asset.path,await readFile(join(directory,asset.path))])));
  for(const badHtml of [html.replace('</head>','<script src="./attack.js"></script></head>'),html.replace('href="./portal.css"','href="https://evil.invalid/"'),html.replace('href="./portal.css"','href=https://evil.invalid/'),html.replace('id="content"','id="changed"'),html.replace("script-src &#39;none&#39;","script-src &#39;self&#39;"),html.replace('<main ','<main onfocus="attack()" ')]){
    assert.throws(()=>validatePortalFiles({...files,'index.html':Buffer.from(badHtml)}));
  }
  assert.throws(()=>validatePortalFiles({...files,'../escape':Buffer.from('x')}));
  assert.throws(()=>validatePortalFiles({...files,'portal.css':Buffer.from('@import "https://evil.invalid/x";')}));
  await assert.rejects(verifyPortalDirectory(directory,{...built.report,releaseEnabled:true}),/PORTAL_REPORT_MISMATCH/);
  await assert.rejects(verifyPortalDirectory(directory,{...built.report,assets:built.report.assets.map(()=>built.report.assets[0])}),/PORTAL_REPORT_MISMATCH/);
  await assert.rejects(readPortalSource('../../.env'),/PORTAL_SOURCE_PATH/);
  await writeFile(join(directory,'downloads/BasicEscrow.json'),'[]');
  await assert.rejects(verifyPortalDirectory(directory,built.report),/PORTAL_ASSET_MISMATCH/);
  await rm(join(directory,'downloads/BasicEscrow.json'));
  await symlink(join(directory,'index.html'),join(directory,'downloads/BasicEscrow.json'));
  await assert.rejects(verifyPortalDirectory(directory,built.report),/PORTAL_ARTIFACT_SYMLINK/);
  await assert.rejects(buildPortal({outDir:directory}),/EEXIST/);
  assert.ok((await readFile(join(directory,'index.html'),'utf8')).includes('Trading disabled'),'existing output is preserved');
});
test('dedicated delivery headers forbid executable, connection and framing authority',()=>{
  const csp=PORTAL_HEADERS['Content-Security-Policy'];
  for(const directive of ['default-src','script-src','connect-src','object-src','base-uri','form-action','frame-src','frame-ancestors','worker-src'])assert.ok(csp.includes(`${directive} 'none'`));
  assert.equal(PORTAL_HEADERS['Referrer-Policy'],'no-referrer');
});
