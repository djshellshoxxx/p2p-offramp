/** Fixed public upstream feasibility probe. No application provider, issuer, eligibility or release authority. */
import { constants } from 'node:fs';
import { lstat, open, opendir, readdir, readlink, realpath, mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseStrictJsonBytes } from '../../packages/schemas/index.ts';
import { runLabCommand } from '../lab/command.mjs';
import { isMain } from '../lib/is-main.mjs';

const HERE = fileURLToPath(new URL('./', import.meta.url)), ROOT = resolve(HERE, '../..');
const FORMAT = 'semaphore-v4-public-node-feasibility-pins-v1';
const PROFILE = 'semaphore-4.14.5-maintained-transitives-20261102';
const OVERRIDES = Object.freeze({ ethers: '6.17.0', snarkjs: '0.7.6', bfj: '9.1.4', ejs: '7.0.2', circom_tester: '0.0.24' });
const IMAGE = 'sha256:1729a8a1af2bf2312a8227ce7eb01469e44195701dad39cc1aca2a20c23e3283';
const LIMITS = Object.freeze({ compressedArtifactBytes: 201326592, archiveEntries: 128, archiveUnpackedBytes: 201326592,
  artifactEntryBytes: 16777216, installedEntries: 8192, installedBytes: 402653184, installedEntryBytes: 67108864,
  cpuQuota: 1, cpuSeconds: 90, memoryBytes: 1073741824, pids: 128, runtimeMs: 120000, outputBytes: 65536 });
const QUALIFICATION = Object.freeze({ nodePublicFixtureOnly: true, browserWasmQualified: false, browserMemoryBudgetQualified: false,
  applicationIssuerApproved: false, scoreProofImplemented: false, globalNullifierConsumptionImplemented: false,
  applicationScopeMappingSelected: false, providerActivated: false, professionalReview: false, releaseEnabled: false });
const ABORTED = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const ADD = EventTarget.prototype.addEventListener, REMOVE = EventTarget.prototype.removeEventListener;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Error(code); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const bounded = (value, maximum, zero = false) => Number.isSafeInteger(value) && value >= (zero ? 0 : 1) && value <= maximum;
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('SEMAPHORE_PINS');
};
function freeze(value) { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; }
export function parseEvaluationPins(bytes) {
  const pins = parseStrictJsonBytes(bytes, 65536);
  exact(pins, ['format', 'sourceCommit', 'sdkVersion', 'artifactVersion', 'treeDepth', 'fieldModulus', 'artifact', 'packages', 'sources', 'licenses', 'lockSha256', 'packageSha256', 'installedTree', 'registryEvidence', 'tools', 'limits', 'qualification', 'dependencyProfile', 'dependencyOverrides', 'dependencyAudit', 'originalObservation']);
  if (pins.format !== FORMAT || pins.sourceCommit !== 'dbab5553c486a09d5e1042e5271e3316224cc176' || pins.sdkVersion !== '4.14.5' || pins.artifactVersion !== '4.13.0' || pins.treeDepth !== 2 ||
    pins.fieldModulus !== '21888242871839275222246405745257275088548364400416034343698204186575808495617' || pins.tools.proofImage !== IMAGE) fail('SEMAPHORE_PINS');
  for (const [key, value] of Object.entries(LIMITS)) if (pins.limits[key] !== value) fail('SEMAPHORE_LIMITS');
  exact(pins.limits, Object.keys(LIMITS)); exact(pins.qualification, Object.keys(QUALIFICATION));
  for (const [key, value] of Object.entries(QUALIFICATION)) if (pins.qualification[key] !== value) fail('SEMAPHORE_AUTHORITY');
  if (!hash(pins.lockSha256) || !hash(pins.packageSha256) || !hash(pins.installedTree.sha256) || pins.packages.length !== 10 || pins.sources.length !== 10 || pins.licenses.length !== 9 || pins.dependencyProfile !== PROFILE) fail('SEMAPHORE_PINS');
  exact(pins.dependencyOverrides, Object.keys(OVERRIDES));
  for (const [key, value] of Object.entries(OVERRIDES)) if (pins.dependencyOverrides[key] !== value) fail('SEMAPHORE_DEPENDENCY_PROFILE');
  exact(pins.dependencyAudit, ['reportSha256', 'exitCode', 'vulnerabilities', 'scope']);
  exact(pins.dependencyAudit.vulnerabilities, ['info', 'low', 'moderate', 'high', 'critical', 'total']);
  if (!hash(pins.dependencyAudit.reportSha256) || pins.dependencyAudit.exitCode !== 0 || Object.values(pins.dependencyAudit.vulnerabilities).some(value => value !== 0)) fail('SEMAPHORE_AUDIT');
  exact(pins.originalObservation, ['path', 'sha256', 'status', 'executableDependencyProject']);
  if (pins.originalObservation.path !== 'docs/reputation/SEMAPHORE-V4-ORIGINAL-OBSERVATION.json' || !hash(pins.originalObservation.sha256) || pins.originalObservation.status !== 'BLOCKED_DEPENDENCY_FINDINGS' || pins.originalObservation.executableDependencyProject !== false) fail('SEMAPHORE_HISTORY');
  exact(pins.tools, ['hostNode', 'hostNodeExecutableSha256', 'installNpm', 'proofImage']);
  if (!hash(pins.tools.hostNodeExecutableSha256) || pins.tools.hostNode !== 'v24.19.0' || pins.tools.installNpm !== '11.9.0') fail('SEMAPHORE_PINS');
  exact(pins.installedTree, ['entries', 'regularFiles', 'symlinks', 'bytes', 'sha256']);
  if (!bounded(pins.installedTree.entries, LIMITS.installedEntries) || !bounded(pins.installedTree.regularFiles, LIMITS.installedEntries) || !bounded(pins.installedTree.symlinks, LIMITS.installedEntries, true) || pins.installedTree.entries !== pins.installedTree.regularFiles + pins.installedTree.symlinks || !bounded(pins.installedTree.bytes, LIMITS.installedBytes)) fail('SEMAPHORE_PINS');
  exact(pins.artifact, ['package', 'version', 'url', 'integrity', 'tarballSha256', 'tarballBytes', 'archiveFileCount', 'archiveUnpackedBytes', 'selected']);
  if (pins.artifact.package !== '@zk-kit/semaphore-artifacts' || pins.artifact.version !== '4.13.0' ||
    pins.artifact.url !== 'https://registry.npmjs.org/@zk-kit/semaphore-artifacts/-/semaphore-artifacts-4.13.0.tgz' || !hash(pins.artifact.tarballSha256) ||
    !bounded(pins.artifact.tarballBytes, LIMITS.compressedArtifactBytes) || !bounded(pins.artifact.archiveFileCount, LIMITS.archiveEntries) || !bounded(pins.artifact.archiveUnpackedBytes, LIMITS.archiveUnpackedBytes)) fail('SEMAPHORE_PINS');
  exact(pins.artifact.selected, ['semaphore-2.wasm', 'semaphore-2.zkey']);
  for (const record of Object.values(pins.artifact.selected)) if (!hash(record.sha256) || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes > LIMITS.artifactEntryBytes) fail('SEMAPHORE_PINS');
  const packages = new Set();
  for (const record of pins.packages) {
    exact(record, ['name', 'version', 'integrity', 'tarball', 'gitHeadUnsignedMetadata']);
    if (typeof record.name !== 'string' || packages.has(record.name) || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(record.integrity) || !record.tarball.startsWith('https://registry.npmjs.org/')) fail('SEMAPHORE_PINS'); packages.add(record.name);
  }
  const sources = new Set();
  for (const source of pins.sources) {
    exact(source, ['url', 'bytes', 'sha256', 'installedSourcePath']);
    if (!hash(source.sha256) || !bounded(source.bytes, 65536) || sources.has(source.url) || !source.url.startsWith(`https://github.com/semaphore-protocol/semaphore/blob/${pins.sourceCommit}/packages/`)) fail('SEMAPHORE_PINS'); sources.add(source.url);
    if (source.installedSourcePath !== null && (typeof source.installedSourcePath !== 'string' || !/^@semaphore-protocol\/(proof|group|identity)\/src\/[A-Za-z0-9_./-]+$/.test(source.installedSourcePath) || source.installedSourcePath.split('/').includes('..'))) fail('SEMAPHORE_PINS');
  }
  return freeze(pins);
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
async function regular(path, maximum, bytes = false, allowEmpty = false) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size < (allowEmpty ? 0n : 1n) || before.size > BigInt(maximum)) fail('SEMAPHORE_INPUT_FILE');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK), buffer = Buffer.alloc(bytes ? Number(before.size) + 1 : 65536), digest = createHash('sha256');
  try {
    if (!same(before, await handle.stat({ bigint: true }))) fail('SEMAPHORE_INPUT_CHANGED');
    let length = 0;
    for (;;) {
      const position = bytes ? length : 0, count = bytes ? buffer.length - length : buffer.length;
      if (!count) fail('SEMAPHORE_INPUT_CHANGED');
      const { bytesRead } = await handle.read(buffer, position, count, length); if (!bytesRead) break;
      length += bytesRead; if (BigInt(length) > before.size) fail('SEMAPHORE_INPUT_CHANGED');
      digest.update(buffer.subarray(position, position + bytesRead));
    }
    if (BigInt(length) !== before.size || !same(before, await handle.stat({ bigint: true })) || !same(before, await lstat(path, { bigint: true }))) fail('SEMAPHORE_INPUT_CHANGED');
    return { bytes: length, sha256: digest.digest('hex'), ...(bytes ? { value: Buffer.from(buffer.subarray(0, length)) } : {}) };
  } finally { buffer.fill(0); await handle.close(); }
}
async function directory(path) {
  if (await realpath(path) !== path || !(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) fail('SEMAPHORE_INPUT_DIRECTORY');
}
export async function digestInstalledTree(root) {
  await directory(root); const records = []; let total = 0, nodes = 0;
  async function walk(path, prefix, depth) {
    if (depth > 24 || ++nodes > 16384) fail('SEMAPHORE_INPUT_LIMIT'); await directory(path);
    for await (const entry of await opendir(path)) {
      if (++nodes > 16384) fail('SEMAPHORE_INPUT_LIMIT');
      const name = prefix + entry.name, target = resolve(path, entry.name);
      if (entry.isDirectory()) { await walk(target, name + '/', depth + 1); continue; }
      if (records.length >= LIMITS.installedEntries) fail('SEMAPHORE_INPUT_LIMIT');
      if (entry.isSymbolicLink()) {
        const link = await readlink(target), resolved = await realpath(target), rel = relative(root, resolved);
        if (dirname(name).split('/').at(-1) !== '.bin' || isAbsolute(link) || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !(await lstat(resolved)).isFile()) fail('SEMAPHORE_INPUT_SYMLINK');
        records.push({ path: name, link });
      } else {
        const record = await regular(target, LIMITS.installedEntryBytes, false, true); total += record.bytes;
        if (total > LIMITS.installedBytes) fail('SEMAPHORE_INPUT_LIMIT'); records.push({ path: name, ...record });
      }
    }
  }
  await walk(root, '', 0); records.sort((a, b) => compare(a.path, b.path));
  return { entries: records.length, regularFiles: records.filter(row => Object.hasOwn(row, 'bytes')).length,
    symlinks: records.filter(row => Object.hasOwn(row, 'link')).length, bytes: total, sha256: sha(JSON.stringify(records)) };
}
export async function verifyEvaluationInputs(root, pins) {
  await directory(root);
  for (const [name, expected] of [['package.json', pins.packageSha256], ['package-lock.json', pins.lockSha256]]) if ((await regular(resolve(root, name), 262144)).sha256 !== expected) fail('SEMAPHORE_INPUT_DIGEST');
  await directory(resolve(root, 'artifacts'));
  if ((await readdir(resolve(root, 'artifacts'))).sort(compare).join(',') !== 'semaphore-2.wasm,semaphore-2.zkey') fail('SEMAPHORE_ARTIFACT_SET');
  for (const [name, expected] of Object.entries(pins.artifact.selected)) {
    const actual = await regular(resolve(root, 'artifacts', name), LIMITS.artifactEntryBytes);
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) fail('SEMAPHORE_ARTIFACT_DIGEST');
  }
  const installed = await digestInstalledTree(resolve(root, 'node_modules'));
  if (JSON.stringify(installed) !== JSON.stringify(pins.installedTree)) fail('SEMAPHORE_INSTALLED_DIGEST');
  for (const source of pins.sources) if (source.installedSourcePath !== null && (await regular(resolve(root, 'node_modules', source.installedSourcePath), 65536)).sha256 !== source.sha256) fail('SEMAPHORE_SOURCE_DIGEST');
  return installed;
}

// Literal public fixtures only. No user data or serialized identity is returned.
const PROBE = `import assert from 'node:assert/strict';import{readFileSync,createReadStream}from'node:fs';import{createHash}from'node:crypto';
let phase='imports';const check=(name,passed)=>{phase=name;if(!passed)throw Error('PUBLIC_FIXTURE_REFUSED');checks.push(name);};const checks=[];let outboundAttempts=0,curve;
globalThis.fetch=()=>{outboundAttempts++;throw Error('RUNTIME_NETWORK_FORBIDDEN');};
try{
 const{Identity}=await import('/evaluation/node_modules/@semaphore-protocol/identity/dist/index.js');
 const{Group}=await import('/evaluation/node_modules/@semaphore-protocol/group/dist/index.js');
 const{generateProof,verifyProof}=await import('/evaluation/node_modules/@semaphore-protocol/proof/dist/index.node.js');
 const{getCurveFromName}=await import('/evaluation/node_modules/ffjavascript/main.js');
 const{zKey}=await import('/evaluation/node_modules/snarkjs/main.js');
 const{keccak256,toBeHex}=await import('/evaluation/node_modules/ethers/lib.esm/index.js');
 const publicSeeds=Array.from({length:5},(_,i)=>'PUBLIC synthetic Semaphore T63 fixture '+i);const identities=publicSeeds.map(seed=>new Identity(seed)),identity=identities[0];
 check('provider-native-identity-export-import',Identity.import(identity.export()).commitment===identity.commitment);
 const group=new Group(identities.slice(0,4).map(x=>x.commitment));check('four-public-members',group.size===4&&group.depth===2);
 const artifacts={wasm:'/evaluation/artifacts/semaphore-2.wasm',zkey:'/evaluation/artifacts/semaphore-2.zkey'};
 phase='export-supplied-verification-key';const key=await zKey.exportVerificationKey(artifacts.zkey);curve=await getCurveFromName('bn128');
 const embedded=JSON.parse(readFileSync('/evaluation/node_modules/@semaphore-protocol/proof/src/verification-keys.json'));
 for(const field of ['protocol','curve','nPublic','vk_alpha_1','vk_beta_2','vk_gamma_2']){phase='verify-key-'+field;assert.deepEqual(key[field],embedded[field]);}
 phase='verify-key-delta';assert.deepEqual(key.vk_delta_2,embedded.vk_delta_2[1]);phase='verify-key-IC';assert.deepEqual(key.IC,embedded.IC[1]);checks.push('supplied-zkey-matches-published-depth2-verifier');
 const actualDependencyVersions=Object.fromEntries(['ethers','snarkjs','bfj','ejs','circom_tester'].map(name=>[name,JSON.parse(readFileSync('/evaluation/node_modules/'+name+'/package.json')).version]));
 check('named-patched-dependencies',JSON.stringify(actualDependencyVersions)===JSON.stringify({ethers:'6.17.0',snarkjs:'0.7.6',bfj:'9.1.4',ejs:'7.0.2',circom_tester:'0.0.24'}));
 const{default:bfj}=await import('/evaluation/node_modules/bfj/src/index.js');await bfj.write('/tmp/public-json-api.json',{fixture:'public',root:String(group.root)},{space:1});assert.deepEqual(await bfj.read('/tmp/public-json-api.json'),{fixture:'public',root:String(group.root)});checks.push('patched-bfj-json-io-api');
 check('patched-ejs-render-api',await zKey.exportSolidityVerifier(artifacts.zkey,{groth16:'PUBLIC <%= protocol %>'})==='PUBLIC groth16');
 phase='generate-explicit-local-proof';const proof=await generateProof(identity,group,123n,456n,2,artifacts);check('actual-proof-verifies',await verifyProof(proof)===true);
 check('exact-public-root-and-inputs',proof.merkleTreeRoot===String(group.root)&&proof.message==='123'&&proof.scope==='456'&&proof.merkleTreeDepth===2);
 check('proof-envelope-under256KiB',Buffer.byteLength(JSON.stringify(proof))<=262144);
 check('same-proof-verifier-is-stateless',await verifyProof(proof)===true);
 for(const[name,changed]of [['root',{merkleTreeRoot:'1'}],['scope',{scope:'457'}],['message',{message:'124'}],['nullifier',{nullifier:String(BigInt(proof.nullifier)+1n)}],['depth-key',{merkleTreeDepth:3}]])check('reject-wrong-'+name,await verifyProof({...proof,...changed})===false);
 let invalidPoints=false;try{invalidPoints=await verifyProof({...proof,points:proof.points.map(()=> '0')})===false;}catch{invalidPoints=true;}check('reject-invalid-points',invalidPoints);
 let wrongDepth=false;try{await verifyProof({...proof,merkleTreeDepth:33});}catch{wrongDepth=true;}check('reject-unsupported-depth',wrongDepth);
 let absentMember=false;try{await generateProof(identities[4],group,123n,456n,2,artifacts);}catch{absentMember=true;}check('reject-nonmember',absentMember);
 const untrustedGroup=new Group([identity.commitment,identities[2].commitment,identities[3].commitment,identities[4].commitment]);
 const untrustedProof=await generateProof(identity,untrustedGroup,123n,456n,2,artifacts);check('unapproved-root-can-be-mathematically-valid',untrustedGroup.root!==group.root&&await verifyProof(untrustedProof)===true);
 check('same-scope-nullifier-across-groups',untrustedProof.nullifier===proof.nullifier);check('no-implicit-artifact-fetch',outboundAttempts===0);
 const read=name=>{try{return readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();}catch{return null;}};
 const resources={memoryMax:read('memory.max'),memoryPeak:read('memory.peak'),cpuMax:read('cpu.max'),pidsMax:read('pids.max'),maxRssKiB:process.resourceUsage().maxRSS};
 check('observed-container-memory-cap',resources.memoryMax==='1073741824');check('observed-container-pid-cap',resources.pidsMax==='128');
 check('observed-container-cpu-quota',resources.cpuMax?.split(/\\s+/).map(Number).reduce((quota,period)=>quota/period)===1);
 const executable=createHash('sha256');for await(const bytes of createReadStream(process.execPath))executable.update(bytes);
 const report={format:'semaphore-v4-public-node-feasibility-v1',checks,publicFixtureOnly:true,groupSize:4,treeDepth:2,proofVerified:true,secondUnapprovedRootVerified:true,actualDependencyVersions,
  root:String(group.root),nullifier:proof.nullifier,message:proof.message,scope:proof.scope,
  messagePreimageHex:toBeHex(123n,32),scopePreimageHex:toBeHex(456n,32),messageHashShift8:String(BigInt(keccak256(toBeHex(123n,32)))>>8n),scopeHashShift8:String(BigInt(keccak256(toBeHex(456n,32)))>>8n),
  proofBytes:Buffer.byteLength(JSON.stringify(proof)),outboundAttempts,resources,node:process.version,nodeExecutableSha256:executable.digest('hex'),
  browserWasmQualified:false,browserMemoryBudgetQualified:false,applicationIssuerApproved:false,scoreProofImplemented:false,globalNullifierConsumptionImplemented:false,applicationScopeMappingSelected:false,providerActivated:false,professionalReview:false,releaseEnabled:false};
 await curve.terminate();curve=undefined;process.stdout.write(JSON.stringify(report)+'\\n');
}catch{try{await curve?.terminate();}catch{}process.stderr.write(JSON.stringify({code:'PUBLIC_SEMAPHORE_FIXTURE_FAILED',phase,completedChecks:checks.length})+'\\n');process.exitCode=1;}`;

let active = false, retired = false;
const ownedExecutions = new WeakMap();
export async function runSemaphoreV4Evaluation(inputDirectory, signal) {
  if (active) fail('SEMAPHORE_BUSY'); if (retired) fail('SEMAPHORE_RETIRED'); active = true;
  let work, containerName, abort, inputSignal, controller;
  let env;
  const docker = ['--host=unix:///var/run/docker.sock'];
  try {
    env = { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', ...(typeof process.env.DOCKER_CONFIG === 'string' ? { DOCKER_CONFIG: process.env.DOCKER_CONFIG } : {}) };
    controller = new AbortController();
    if (signal !== undefined) {
      let cancelled; try { cancelled = Reflect.apply(ABORTED, signal, []); } catch { fail('SEMAPHORE_SIGNAL'); }
      inputSignal = signal; abort = () => controller.abort(); Reflect.apply(ADD, signal, ['abort', abort, { once: true }]); if (cancelled) controller.abort();
    }
    if (controller.signal.aborted) fail('SEMAPHORE_CANCELLED');
    if (typeof inputDirectory !== 'string' || inputDirectory.length > 4096 || !/^\/[A-Za-z0-9_./-]+$/.test(inputDirectory) || inputDirectory.split('/').includes('..')) fail('SEMAPHORE_DIRECTORY');
    const inputRoot = resolve(inputDirectory), rel = relative(ROOT, inputRoot);
    if (rel === '' || !rel.startsWith('..' + sep) && rel !== '..') fail('SEMAPHORE_SOURCE_DIRECTORY');
    const pinBytes = await regular(resolve(HERE, 'semaphore-v4.pins.json'), 65536, true), pins = parseEvaluationPins(new Uint8Array(pinBytes.value));
    await verifyEvaluationInputs(inputRoot, pins); if (controller.signal.aborted) fail('SEMAPHORE_CANCELLED');
    const image = await runLabCommand('docker', [...docker, 'image', 'inspect', IMAGE, '--format', '{{.Id}}'], { root: ROOT, env, signal: controller.signal, maxBytes: 4096, timeoutMs: 10000 });
    if (image.exitCode !== 0 || image.log.toString().trim() !== IMAGE) fail('SEMAPHORE_IMAGE_UNAVAILABLE');
    if (!/^\/[A-Za-z0-9_./-]+$/.test(tmpdir())) fail('SEMAPHORE_DIRECTORY');
    work = await mkdtemp(resolve(tmpdir(), 'p2p-semaphore-public-')); await writeFile(resolve(work, 'probe.mjs'), PROBE, { mode: 0o600, flag: 'wx' });
    await chmod(resolve(work, 'probe.mjs'), 0o444); // Static public fixture, irrespective of the caller's restrictive umask.
    containerName = 'p2p-semaphore-public-' + randomBytes(8).toString('hex');
    const args = [...docker, 'run', '--rm', '--pull=never', '--name', containerName, '--network=none', '--read-only', '--cpus=1', '--memory=1073741824', '--memory-swap=1073741824', '--pids-limit=128', '--ulimit=cpu=90:90',
      '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534', '--tmpfs=/tmp:rw,noexec,nosuid,size=67108864',
      '--mount', `type=bind,src=${resolve(inputRoot, 'node_modules')},dst=/evaluation/node_modules,readonly`, '--mount', `type=bind,src=${resolve(inputRoot, 'artifacts')},dst=/evaluation/artifacts,readonly`,
      '--mount', `type=bind,src=${resolve(work, 'probe.mjs')},dst=/probe.mjs,readonly`,
      ...['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'].flatMap(name => ['--env', name + '=']),
      '--entrypoint=/usr/bin/env', IMAGE, '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', 'NODE_ENV=production', 'TZ=UTC', 'LANG=C.UTF-8', 'node', '--max-old-space-size=512', '--unhandled-rejections=strict', '/probe.mjs'];
    const execution = await runLabCommand('docker', args, { root: ROOT, env, signal: controller.signal, maxBytes: LIMITS.outputBytes, timeoutMs: LIMITS.runtimeMs });
    if (execution.exitCode !== 0 || !execution.bounded || execution.timedOut || execution.cancelled) {
      const error = Error(controller.signal.aborted ? 'SEMAPHORE_CANCELLED' : 'SEMAPHORE_RESOURCE_OR_RUNTIME_REFUSAL');
      let fixedFailure;
      try { const parsed = parseStrictJsonBytes(new Uint8Array(execution.log), LIMITS.outputBytes);
        if (parsed.code === 'PUBLIC_SEMAPHORE_FIXTURE_FAILED' && typeof parsed.phase === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(parsed.phase) && Number.isSafeInteger(parsed.completedChecks)) fixedFailure = Object.freeze({ code: parsed.code, phase: parsed.phase, completedChecks: parsed.completedChecks });
      } catch {}
      const summary = Object.freeze({ exitCode: execution.exitCode, exitSignal: execution.exitSignal, timedOut: execution.timedOut, cancelled: execution.cancelled, bounded: execution.bounded, logSha256: execution.logSha256, ...(fixedFailure ? { fixedFailure } : {}) });
      error.execution = summary; ownedExecutions.set(error, summary); throw error;
    }
    const report = parseStrictJsonBytes(new Uint8Array(execution.log), LIMITS.outputBytes);
    if (report.format !== 'semaphore-v4-public-node-feasibility-v1' || report.publicFixtureOnly !== true || report.proofVerified !== true || report.secondUnapprovedRootVerified !== true || report.outboundAttempts !== 0 || report.node !== 'v24.19.0' || report.checks.length !== 24 || JSON.stringify(report.actualDependencyVersions) !== JSON.stringify(OVERRIDES)) fail('SEMAPHORE_RESULT');
    for (const [key, value] of Object.entries(QUALIFICATION)) if (key !== 'nodePublicFixtureOnly' && report[key] !== value) fail('SEMAPHORE_AUTHORITY');
    await verifyEvaluationInputs(inputRoot, pins); if (controller.signal.aborted) fail('SEMAPHORE_CANCELLED');
    return freeze({ ...report, dependencyProfile: PROFILE, upstreamDeclaredDependencyGraph: false, dependencyOverrides: OVERRIDES,
      pinsSha256: pinBytes.sha256, packageLockSha256: pins.lockSha256, installedTreeSha256: pins.installedTree.sha256, image: IMAGE, probeSha256: sha(PROBE),
      sdkVersion: pins.sdkVersion, artifactVersion: pins.artifactVersion, artifactHashes: pins.artifact.selected, logSha256: execution.logSha256 });
  } catch (error) {
    let message = 'SEMAPHORE_REFUSED';
    try { const descriptor = Object.getOwnPropertyDescriptor(error, 'message'); if (descriptor && 'value' in descriptor && /^SEMAPHORE_[A-Z_]+$/.test(descriptor.value)) message = descriptor.value; } catch {}
    const fixed = Error(message), execution = typeof error === 'object' && error !== null ? ownedExecutions.get(error) : undefined;
    if (execution) fixed.execution = execution; throw fixed;
  } finally {
    let cleanupConfirmed = true;
    try {
      if (containerName) {
        try {
          await runLabCommand('docker', [...docker, 'rm', '--force', containerName], { root: ROOT, env, maxBytes: 4096, timeoutMs: 10000 });
          const absence = await runLabCommand('docker', [...docker, 'ps', '--all', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}'], { root: ROOT, env, maxBytes: 4096, timeoutMs: 10000 });
          cleanupConfirmed = absence.exitCode === 0 && absence.bounded && !absence.timedOut && absence.log.toString().trim() === '';
        } catch { cleanupConfirmed = false; }
      }
      if (work) { try { await rm(work, { recursive: true, force: true }); } catch { cleanupConfirmed = false; } }
    } finally { if (inputSignal && abort) { try { Reflect.apply(REMOVE, inputSignal, ['abort', abort]); } catch {} } active = false; }
    if (!cleanupConfirmed) { retired = true; fail('SEMAPHORE_CLEANUP_UNCERTAIN'); }
  }
}
if (isMain(import.meta.url)) {
  const controller = new AbortController(), stop = () => controller.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { const { values } = parseArgs({ options: { directory: { type: 'string' } }, strict: true, allowPositionals: false });
    console.log(JSON.stringify(await runSemaphoreV4Evaluation(values.directory, controller.signal)));
  } catch (error) { console.error(JSON.stringify({ code: /^SEMAPHORE_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'SEMAPHORE_REFUSED', ...(error?.execution ? { execution: error.execution } : {}) })); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
