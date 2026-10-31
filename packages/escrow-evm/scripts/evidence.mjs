/** Local reproducibility evidence; hashes below describe compiler templates, not live deployment approval. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileEscrow, compilerSettings } from './compile.mjs';
const artifact = compileEscrow();
const anvilPath=fileURLToPath(new URL('../node_modules/@foundry-rs/anvil-linux-amd64/bin/anvil',import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
console.log(JSON.stringify({ localOnly:true, releaseEnabled:false, compiler:artifact.compiler, settings:compilerSettings,
  anvilVersion:execFileSync(anvilPath,['--version'],{encoding:'utf8',timeout:5000,maxBuffer:4096}).trim(), anvilBinarySha256:digest(readFileSync(anvilPath)),
  dependencyLockSha256:digest(readFileSync(new URL('../package-lock.json',import.meta.url))), solcTmpOverride:'0.2.7',
  sourceSha256:artifact.sourceSha256, abiSha256:digest(JSON.stringify(artifact.abi)), creationBytecodeSha256:digest(Buffer.from(artifact.bytecode.slice(2),'hex')),
  runtimeTemplateSha256:digest(Buffer.from(artifact.deployedBytecode.slice(2),'hex')), runtimeTemplateIsDeployedIdentity:false,
  dependencies:Object.fromEntries(['solc','ethers','@foundry-rs/anvil-linux-amd64','@openzeppelin/contracts'].map(name=>[name,{version:lock.packages['node_modules/'+name].version,integrity:lock.packages['node_modules/'+name].integrity}])) },null,2));
