/** Package an authenticated original profile. This grants no current release or spending authority. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { createReleaseRegistry, verifyRelease } from '../../packages/security/src/release-manifest.ts';
import { parseRegistryBytes, parseStrictJsonBytes } from '../../packages/schemas/index.ts';
import { TESTNET_ACCEPTED_FILE, TESTNET_TRUST_FILES } from '../../apps/web/scripts/testnet-trust.mjs';
import { isSepoliaOnly, SEPOLIA_RELEASE_KEY_ID } from '../../apps/web/src/testnet/sepolia-network.ts';
import { isMain, ROOT } from '../sepolia/lib.mjs';
import { RECOVERY_FORMAT, loadArchivedRecoveryProfile, refuseRecovery, recoveryErrorCode } from './evm-recovery.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const CANONICAL_ABI_PATH = 'contracts/evm/abi/BasicEscrow.json';
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength').get;
function snapshot(input) {
  try {
    const size = Reflect.apply(byteLength,input,[]);
    if (Object.getPrototypeOf(input) !== Uint8Array.prototype || size < 1 || size > 1024*1024) return refuseRecovery('INVALID_INPUT');
    const copy = new Uint8Array(size); Reflect.apply(Uint8Array.prototype.set,copy,[input]); return copy;
  } catch { return refuseRecovery('INVALID_INPUT'); }
}

export async function buildEvmRecoveryPackage({verifiedRelease,registryPath,registryBytes,abiPath,abiBytes,networkId,deploymentId,outDir}) {
  let staging, created = false;
  try {
    const registryCopy = snapshot(registryBytes), abiCopy = snapshot(abiBytes);
    // Opaque proof validation must precede all property reads on the supplied proof.
    const checked = await createReleaseRegistry(verifiedRelease,registryPath,registryCopy);
    if (!checked.ok) return refuseRecovery(checked.error.code);
    const bound = checked.value, manifest = verifiedRelease.manifest;
    const asset = manifest.assets.find(item => item.path === abiPath);
    const committedAbi = await readFile(new URL('../../contracts/evm/abi/BasicEscrow.json',import.meta.url));
    if (!asset || asset.bytes !== abiCopy.length || asset.sha256 !== sha(abiCopy) || !Buffer.from(abiCopy).equals(committedAbi)) return refuseRecovery('ASSET_MISMATCH');
    if (!bound.network(networkId) || !bound.deployment(networkId,deploymentId)) return refuseRecovery('UNSUPPORTED_PROVIDER');
    const profile = {
      format:RECOVERY_FORMAT, release:{releaseId:manifest.releaseId,manifestSha256:verifiedRelease.manifestSha256,sequence:manifest.sequence,expiresAt:manifest.expiresAt,sourceCommit:manifest.sourceCommit},
      registry:{path:registryPath,sha256:sha(registryCopy),bytes:Buffer.from(registryCopy).toString('base64url')},
      abi:{path:abiPath,sha256:sha(abiCopy),bytes:abiCopy.length}, networkId,deploymentId,historicalOnly:true,releaseEnabled:false,
    };
    await loadArchivedRecoveryProfile(profile);
    const readme = await readFile(new URL('../../docs/recovery/CANONICAL-EVM.md',import.meta.url));
    const artifacts = { 'registry.json':registryCopy, 'BasicEscrow.json':abiCopy, 'profile.json':Buffer.from(JSON.stringify(profile,null,2)+'\n'), 'README.md':readme };
    const expected = Object.fromEntries(Object.entries(artifacts).map(([path,bytes]) => [path,{sha256:sha(bytes),bytes:bytes.length}]));
    staging = await mkdtemp(resolve(tmpdir(),'p2p-evm-recovery-build-'));
    await build({configFile:false,logLevel:'error',ssr:{noExternal:true},define:{__P2P_EVM_RECOVERY_CONFIG__:JSON.stringify({profile,expected})},
      build:{ssr:fileURLToPath(new URL('./evm-cli.mjs',import.meta.url)),outDir:staging,emptyOutDir:true,target:'node24',minify:false,sourcemap:false,
        rollupOptions:{output:{entryFileNames:'recover.mjs',codeSplitting:false}}}});
    for (const [path,bytes] of Object.entries(artifacts)) await writeFile(resolve(staging,path),bytes);
    const files = [];
    for (const path of (await readdir(staging)).sort()) {
      const bytes = await readFile(resolve(staging,path)); files.push({path,bytes:bytes.length,sha256:sha(bytes)});
    }
    await writeFile(resolve(staging,'checksums.json'),JSON.stringify({format:'p2p-offramp/recovery-checksums/v1',files},null,2)+'\n');
    if (!bound.network(networkId) || !bound.deployment(networkId,deploymentId)) return refuseRecovery('CANCELLED');
    const directory = resolve(outDir);
    await mkdir(directory); created = true;
    for (const path of await readdir(staging)) await cp(resolve(staging,path),resolve(directory,path),{errorOnExist:true,force:false});
    // Packaging does not outlive the live proof that supplied the historical pins.
    if (!bound.network(networkId) || !bound.deployment(networkId,deploymentId)) return refuseRecovery('CANCELLED');
    return {directory,executable:resolve(directory,'recover.mjs'),files,profile};
  } catch (error) {
    if (created) await rm(resolve(outDir),{recursive:true,force:true});
    return refuseRecovery(recoveryErrorCode(error));
  } finally { if (staging) await rm(staging,{recursive:true,force:true}); }
}

/** Only ENOENT means no retained rollback floor; present files require the exact accepted-release record. */
export async function readAcceptedEvmRecoveryRelease(root=ROOT) {
  const path = resolve(root,TESTNET_ACCEPTED_FILE);
  let initial;
  try { initial = await lstat(path,{bigint:true}); }
  catch (error) { if (error?.code === 'ENOENT') return null; return refuseRecovery('RELEASE_ROLLBACK'); }
  let handle, buffer;
  try {
    if (!initial.isFile() || initial.isSymbolicLink() || initial.size > 8192n) return refuseRecovery('RELEASE_ROLLBACK');
    handle = await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const sameFile = stat => stat.isFile() && stat.dev === initial.dev && stat.ino === initial.ino && stat.size === initial.size;
    if (!sameFile(await handle.stat({bigint:true}))) return refuseRecovery('RELEASE_ROLLBACK');
    buffer = Buffer.alloc(8193);
    let length=0;
    while (length < buffer.length) {
      const {bytesRead} = await handle.read(buffer,length,buffer.length-length,length);
      if (!bytesRead) break;
      length+=bytesRead;
    }
    if (length > 8192 || BigInt(length) !== initial.size || !sameFile(await handle.stat({bigint:true}))) return refuseRecovery('RELEASE_ROLLBACK');
    const accepted = parseStrictJsonBytes(new Uint8Array(buffer.buffer,buffer.byteOffset,length),8192);
    if (typeof accepted !== 'object' || accepted === null || Array.isArray(accepted) ||
        Object.keys(accepted).sort().join() !== 'manifestSha256,sequence' || !Number.isSafeInteger(accepted.sequence) || accepted.sequence < 1 ||
        typeof accepted.manifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(accepted.manifestSha256)) return refuseRecovery('RELEASE_ROLLBACK');
    return Object.freeze({sequence:accepted.sequence,manifestSha256:accepted.manifestSha256});
  } catch { return refuseRecovery('RELEASE_ROLLBACK'); }
  finally {
    buffer?.fill(0);
    if (handle) { try { await handle.close(); } catch { refuseRecovery('RELEASE_ROLLBACK'); } }
  }
}

/** Maintained Sepolia build policy only; no public-key, genesis or policy override. */
export async function buildConfiguredEvmRecovery({outDir,root=ROOT}) {
  if (SEPOLIA_RELEASE_KEY_ID === null) return refuseRecovery('KEY_UNPINNED');
  try {
    const names = TESTNET_TRUST_FILES;
    const [keyBytes,registry,manifest,envelope,abi] = await Promise.all([names.key,names.registry,names.manifest,names.envelope,CANONICAL_ABI_PATH].map(path => readFile(resolve(root,path))));
    const key = parseStrictJsonBytes(new Uint8Array(keyBytes),8192), detached = parseStrictJsonBytes(new Uint8Array(envelope),8192);
    if (key.keyId !== SEPOLIA_RELEASE_KEY_ID) return refuseRecovery('KEY_UNTRUSTED');
    const accepted = await readAcceptedEvmRecoveryRelease(root);
    const proof = await verifyRelease(new Uint8Array(manifest),detached,[key.publicKey],accepted === null ? 0 : accepted.sequence,
      {channel:'sepolia-testnet',assets:[{path:names.registry,bytes:new Uint8Array(registry)},{path:CANONICAL_ABI_PATH,bytes:new Uint8Array(abi)}],
        ...(accepted === null ? {} : {installedManifestSha256:accepted.manifestSha256})});
    if (!proof.ok) return refuseRecovery(proof.error.code);
    if (proof.value.keyId !== SEPOLIA_RELEASE_KEY_ID || !isSepoliaOnly(parseRegistryBytes(new Uint8Array(registry)))) return refuseRecovery('WRONG_CHAIN');
    return buildEvmRecoveryPackage({verifiedRelease:proof.value,registryPath:names.registry,registryBytes:new Uint8Array(registry),abiPath:CANONICAL_ABI_PATH,
      abiBytes:new Uint8Array(abi),networkId:'sepolia',deploymentId:'escrow-sepolia-v1',outDir});
  } catch (error) { return refuseRecovery(recoveryErrorCode(error)); }
}
if (isMain(import.meta.url)) {
  try {
    const {values} = parseArgs({options:{out:{type:'string'}},strict:true});
    if (!values.out) refuseRecovery('INVALID_INPUT');
    const result = await buildConfiguredEvmRecovery({outDir:values.out});
    console.log(JSON.stringify({ok:true,value:{directory:result.directory,files:result.files}}));
  } catch (error) { console.log(JSON.stringify({ok:false,error:{code:recoveryErrorCode(error)}})); process.exitCode=1; }
}
