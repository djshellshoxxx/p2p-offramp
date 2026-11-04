/** Local inert record/evidence checker. Importing this module never starts a CLI or executes evidence files. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { isMain } from '../lib/is-main.mjs';
import { createHash } from 'node:crypto';
import { validateAuthorityDecision, validateProposal, governancePath, GOVERNANCE_LIMITS } from '../../packages/governance/index.ts';
import { parseStrictJsonBytes } from '../../packages/schemas/index.ts';
const fail=code=>({ok:false,code});
class Limit extends Error {}
const sameFile=(left,right)=>left.dev===right.dev&&left.ino===right.ino;
const unchanged=(left,right)=>sameFile(left,right)&&left.size===right.size&&left.mtimeNs===right.mtimeNs&&left.ctimeNs===right.ctimeNs;
export async function checkGovernanceRecord(root, file){
 try{
  const base=await fs.realpath(root),path=governancePath(file);let aggregate=0;
  const inside=target=>{const rel=relative(base,target);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||!rel)throw Error();};
  async function readBounded(name,maximum,document=false){
    governancePath(name);
    const original=resolve(base,name),target=await fs.realpath(original);inside(target);
    // Nonblocking open cannot hang on a substituted FIFO; no-follow refuses a final symlink swap.
    const handle=await fs.open(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const before=await handle.stat({bigint:true});
      const verifyName=async()=>{
        if(await fs.realpath(base)!==base||await fs.realpath(original)!==target)throw Error();
        const named=await fs.lstat(target,{bigint:true});
        if(!named.isFile()||!sameFile(named,before))throw Error();
      };
      if(!before.isFile())throw Error();if(before.size>BigInt(maximum))throw new Limit();
      await verifyName();
      const digest=createHash('sha256'),chunks=[],buffer=Buffer.alloc(65536);let bytes=0;
      try{
        for(;;){
          const read=await handle.read(buffer,0,Math.min(buffer.length,maximum-bytes+1),null);
          if(!read.bytesRead)break;bytes+=read.bytesRead;
          if(!document)aggregate+=read.bytesRead;
          if(bytes>maximum||aggregate>64*1024*1024)throw new Limit();
          const chunk=buffer.subarray(0,read.bytesRead);digest.update(chunk);if(document)chunks.push(Buffer.from(chunk));
        }
        const after=await handle.stat({bigint:true});await verifyName();
        if(!unchanged(before,after)||BigInt(bytes)!==before.size)throw Error();
        return {digest:digest.digest('hex'),bytes:document?Buffer.concat(chunks):null};
      }finally{buffer.fill(0);for(const chunk of chunks)chunk.fill(0);}
    }finally{await handle.close();}
  }
  const document=await readBounded(path,GOVERNANCE_LIMITS.documentBytes,true);
  const input=parseStrictJsonBytes(new Uint8Array(document.bytes),GOVERNANCE_LIMITS.documentBytes);document.bytes.fill(0);
  const decision=Object.hasOwn(input,'decisionId'),checked=decision?validateAuthorityDecision(input):validateProposal(input);
  if(!checked.ok)return fail(checked.error.code);
  const record=checked.value,paths=decision?record.evidencePaths:[...record.affectedSpecs,record.threatImpactPath,...record.testEvidencePaths];
  const hashes=new Set();for(const name of new Set(paths))hashes.add((await readBounded(name,16*1024*1024)).digest);
  const required=decision?[record.previousArtifactHash,record.nextArtifactHash].filter(Boolean):record.recoveryArtifactHashes;
  if(required.some(hash=>!hashes.has(hash)))return fail('ARTIFACT_HASH_UNMATCHED');
  return{ok:true,kind:decision?'authority-decision':'protocol-proposal',status:record.status,evidenceFiles:new Set(paths).size,authority:'inert-record-only',economicPreparationAllowed:false};
 }catch(error){return fail(error instanceof Limit?'LIMIT_EXCEEDED':'EVIDENCE_OR_RECORD_INVALID');}
}
export async function main(args=process.argv.slice(2)){
 if(args.length!==2){process.stdout.write(JSON.stringify(fail('USAGE_ROOT_AND_REPO_RELATIVE_RECORD'))+'\n');return 2;}
 const result=await checkGovernanceRecord(args[0],args[1]);process.stdout.write(JSON.stringify(result)+'\n');return result.ok?0:1;
}
if(isMain(import.meta.url))process.exitCode=await main();
