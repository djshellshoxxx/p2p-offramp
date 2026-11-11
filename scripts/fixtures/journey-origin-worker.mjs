/** Isolated T49 LOCALPROOF root. The public key is compiled into this artifact, never read from adjacent JSON. */
import {verifyRelease,createReleaseRegistry,revalidateRelease} from '../../packages/security/index.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../packages/storage/index.ts';
import {IndexedDbVaultStore} from '../../packages/storage/src/idb-vault-store.ts';
import {createJourneyVaultComposition} from '../../apps/web/src/journey/vault-composition.ts';
import {encodeBase64url,parseStrictJsonBytes} from '../../packages/schemas/index.ts';
const key=__JOURNEY_ORIGIN_TRUST_ROOT__;
const assetPaths=['index.html','journey-origin-screen.js','journey-worker.js','registry.json'];
let bootstrap,lastId=0,epoch=0,active=0,controlPending=false,bridge,vault,proof;
async function bytes(path,maximum){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/'+path,{cache:'no-store',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('ASSET_MISMATCH');const chunks=[];let size=0;const reader=response.body?.getReader();if(!reader)throw Error('UNAVAILABLE');for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();throw Error('LIMIT_EXCEEDED');}chunks.push(value);}const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;}finally{clearTimeout(timer);}}
async function setup(){
 const manifest=await bytes('release.json',65536),envelope=parseStrictJsonBytes(await bytes('release-signature.json',8192),8192),assets=[];
 for(const path of assetPaths)assets.push({path,bytes:await bytes(path,4*1024*1024)});
 const verified=await verifyRelease(manifest,envelope,[key],0,{channel:'fixture-beta',assets});if(!verified.ok)throw Error(verified.error.code);proof=verified.value;
 const registryBytes=assets.find(asset=>asset.path==='registry.json').bytes,registry=await createReleaseRegistry(proof,'registry.json',registryBytes);if(!registry.ok)throw Error(registry.error.code);if(registry.value.network('local-evm')?.chainIdentity!=='31337'||registry.value.releaseEnabled!==false)throw Error('MANIFEST_UNSUPPORTED');
 const store=new IndexedDbVaultStore();vault=new EncryptedVaultService(store,crypto,{lifecycle:false});const backup=new EncryptedBackupService(store);bridge=createJourneyVaultComposition({vault,backup});const initialized=await bridge.request({operation:'init',config:{version:1,ReleaseEnabled:0,connectOrigins:[]}});if(!initialized.result.ok)throw Error(initialized.result.error.code);
 self.postMessage({kind:'origin-verified',releaseId:proof.manifest.releaseId,manifestSha256:proof.manifestSha256,assetsVerified:true,releaseEnabled:false,registryLiveValidated:false});
}
self.onmessage=async({data})=>{
 const id=data?.id;if(!Number.isSafeInteger(id)||id<=lastId||data.kind!=='runtime'){self.postMessage({id,error:'INVALID_INPUT'});return;}lastId=id;
 const control=data.input?.operation==='lock'||data.input?.operation==='dispose';if(control)epoch++;const mine=epoch;
 if(active>0&&(!control||controlPending)){self.postMessage({id,error:'BUSY'});return;}active++;if(control)controlPending=true;
 try{
  bootstrap??=setup();await bootstrap;if(!control&&mine!==epoch)throw Error('LOCKED');
  const live=revalidateRelease(proof);if(!live.ok&&!control)throw Error(live.error.code);
  const response=await bridge.request(data.input);
  if(data.input.operation==='create'&&response.result.ok){
   const selected=await bridge.requireCurrent();selected.assertCurrent();if(mine!==epoch)throw Error('LOCKED');
   // A real opaque consumer record is committed before export, so complete-profile verification covers more than an empty vault.
   const committed=await vault.commit(selected.session.sessionId,selected.session.revision,[{op:'put',record:{id:'f'.repeat(32),kind:'preference',schemaVersion:42,payload:encodeBase64url(new TextEncoder().encode('{"syntheticOriginMigration":"opaque-consumer-record"}'))}}]);selected.assertCurrent();if(mine!==epoch)throw Error('LOCKED');if(!committed.ok)throw Error(committed.error.code);
  }
  if(data.input.operation==='verifyBackup'&&response.operation==='verifyBackup'&&response.result.ok){
   await bridge.requireVerifiedBackup();if(mine!==epoch)throw Error('LOCKED');
   self.postMessage({kind:'origin-backup-verified',receipt:response.result.value,releaseEnabled:false});
  }
  self.postMessage({id,value:response});
 }catch(error){self.postMessage({id,error:/^[A-Z_]{1,64}$/.test(error?.message??'')?error.message:'UNAVAILABLE'});}
 finally{if(data?.input?.bytes instanceof Uint8Array)data.input.bytes.fill(0);active--;if(control)controlPending=false;}
};
