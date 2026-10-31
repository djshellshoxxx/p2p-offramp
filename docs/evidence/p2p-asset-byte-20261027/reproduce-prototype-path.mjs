import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBuild } from '/workspace/p2p-offramp-pr5-validation/apps/web/scripts/build.mjs';
const directory = await mkdtemp(join(tmpdir(), 'p2p-prototype-path-'));
try {
  await mkdir(join(directory, 'assets'));
  const files = Object.fromEntries([
    ['index.html', '<!doctype html><script type="module" src="./assets/main.js"></script>'],
    ['assets/main.js', 'export const fixture = true;\n'],
    ['assets/vault.worker-fixture.js', 'export {};\n'],
    ['core-graph-document.json', '[]\n'],
    ['core-graph-worker.json', '[]\n'],
    ['third-party-licenses.json', JSON.stringify(['react','react-dom','scheduler'].map(name=>({name,identifier:'MIT',text:'Permission is hereby granted (synthetic test fixture)'})))],
    ['__proto__', 'owned synthetic artifact that must be inventoried\n'],
  ]);
  for (const [path, bytes] of Object.entries(files)) await writeFile(join(directory, path), bytes);
  const evidence = await scanBuild(directory);
  assert.equal(evidence.assets.some(item=>item.path==='__proto__'), false, 'Reproduction asserts the retained defect, not desired behavior');
  console.log(JSON.stringify({kind:'confirmed-existing-artifact-path-omission',source:'2327719605dfd8dd59b4a1d5a8e99761053509e4',actualFileCount:Object.keys(files).length,reportedFileCount:evidence.inspection.files,missingPath:'__proto__',sourceEdited:false,fixtureRemovedInFinally:true},null,2));
} finally { await rm(directory, {recursive:true,force:true}); }
