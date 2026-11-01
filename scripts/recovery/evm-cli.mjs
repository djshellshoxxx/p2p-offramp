/** Portable Node entry point. Its original profile and artifact hashes are baked in by the trusted builder. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseRecoveryReferenceExportBytes } from '../../packages/schemas/index.ts';
import { inspectEvmRecovery, prepareEvmRecovery, refuseRecovery, recoveryErrorCode } from './evm-recovery.mjs';
import { isMain } from '../sepolia/lib.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
async function readBounded(path,max) {
  const file = await open(path,constants.O_RDONLY|constants.O_NONBLOCK);
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.size > max) return refuseRecovery('LIMIT_EXCEEDED');
    const bytes = Buffer.alloc(max+1); let size=0;
    for (;;) { const {bytesRead} = await file.read(bytes,size,bytes.length-size,null); if (!bytesRead) break; size+=bytesRead; if (size > max) return refuseRecovery('LIMIT_EXCEEDED'); }
    return bytes.subarray(0,size);
  } finally { await file.close(); }
}
export async function runRecoveryCli(argv,config,directory=dirname(fileURLToPath(import.meta.url))) {
  if (!config) return refuseRecovery('TRUST_CONTEXT_REQUIRED');
  // Sidecars cannot replace the executable's original deployment or ABI pins.
  for (const [path,expected] of Object.entries(config.expected)) {
    const bytes = await readBounded(resolve(directory,path),2*1024*1024);
    if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) return refuseRecovery('ASSET_MISMATCH');
  }
  const {values,positionals} = parseArgs({args:argv,allowPositionals:true,strict:true,options:{endpoint:{type:'string'},'trade-id':{type:'string'},reference:{type:'string'},item:{type:'string'},from:{type:'string'}}});
  const [command] = positionals;
  if (positionals.length !== 1 || !['inspect','prepare-release','prepare-refund','prepare-withdraw'].includes(command) || !values.endpoint ||
      Boolean(values['trade-id']) === Boolean(values.reference) || values.item !== undefined && !values.reference || command === 'inspect' && values.from !== undefined) return refuseRecovery('INVALID_INPUT');
  let binding;
  if (values.reference) {
    if (!/^(?:0|[1-9][0-9]?)$/.test(values.item ?? '')) return refuseRecovery('INVALID_INPUT');
    const exported = parseRecoveryReferenceExportBytes(new Uint8Array(await readBounded(values.reference,128*1024)));
    const item = exported.items[Number(values.item)]; if (!item) return refuseRecovery('INVALID_INPUT'); binding=item.binding;
  } else binding={chain:'evm',networkId:config.profile.networkId,deploymentId:config.profile.deploymentId,tradeId:values['trade-id']};
  const options={profile:config.profile,binding,endpointId:values.endpoint};
  return command === 'inspect' ? inspectEvmRecovery(options) : prepareEvmRecovery({...options,action:command.slice(8),from:values.from});
}
if (isMain(import.meta.url)) {
  try {
    const config = typeof __P2P_EVM_RECOVERY_CONFIG__ === 'undefined' ? null : __P2P_EVM_RECOVERY_CONFIG__;
    console.log(JSON.stringify({ok:true,value:await runRecoveryCli(process.argv.slice(2),config)}));
  } catch (error) { console.log(JSON.stringify({ok:false,error:{code:recoveryErrorCode(error)}})); process.exitCode=1; }
}
