/** LOCAL compiled T66 composition: actual G05/G15/G03/T34, synthetic public trust/address/wallet source. */
import {createAssetUpdateController,type UpdateCheck,type UpdateBackupSelection,type UpdateWalletLease} from '../../packages/security/src/release-update.ts';
import {IndexedDbAcceptedReleaseStore,type AcceptedRelease} from '../../packages/security/src/release-update-store.ts';
import {UpdateHttpReader,type UpdateEndpoint} from '../../packages/security/src/release-update-http.ts';
import {verifyRelease,readUntrustedReleaseManifest} from '../../packages/security/src/release-manifest.ts';
import {SessionTransportPolicy,type TrustedTransportRegistryCapability} from '../../packages/transport/index.ts';
import {parseStrictJsonBytes} from '../../packages/schemas/index.ts';
import {startAppServices} from '../../apps/web/src/app-services.ts';
import {RegistryService} from '../../packages/domain/index.ts';
import {EvmWalletAdapter,type Eip1193Provider} from '../../packages/wallet/src/evm-adapter.ts';
declare const __UPDATE_LOCAL_KEY__:JsonWebKey;
declare const __UPDATE_LOCAL_KEY_ID__:string;
declare const __UPDATE_LOCAL_GATEWAY__:string;
declare const __UPDATE_LOCAL_SOURCE__:string;
const key=__UPDATE_LOCAL_KEY__,keyId=__UPDATE_LOCAL_KEY_ID__,gateway=__UPDATE_LOCAL_GATEWAY__,sourceOrigin=__UPDATE_LOCAL_SOURCE__;
const endpoints=new Map<string,string>(),metrics={fetches:0,defaultFetches:0,strictFetches:0,opens:0,acceptedWrites:0,walletPending:0,walletCalls:[] as string[],walletOutcome:'none'};
const register=(url:string):UpdateEndpoint=>{const known=[...endpoints].find(([,value])=>value===url);if(known)return{endpointId:known[0],url};const endpointId='update-'+endpoints.size;endpoints.set(endpointId,url);return{endpointId,url};};
let ownerCurrent=true,gesture=false,exclusive=false;const invalidations=new Set<()=>void>();
const registry:TrustedTransportRegistryCapability={inspect:()=>({channel:'update',coverage:'direct',adapterId:'local-direct',expiresAt:Math.ceil(performance.now()+60000)}),subscribeInvalidation:()=>()=>{},
  capture(request,owner){const url=endpoints.get(request.endpointId);if(!url||request.channel!=='update'||request.method!=='read')return null;return{owner,current:who=>who===owner&&ownerCurrent,snapshot:()=>({version:1,request,endpoint:{id:request.endpointId,channel:'update',url,adapterId:'local-direct',methods:['read']},evidence:registry.inspect('update'),directConsent:true}),subscribeInvalidation:()=>()=>{},dispose(){}};}};
const transport=new SessionTransportPolicy({trustedRegistry:registry}),nativeFetch:typeof fetch=(...args)=>{metrics.fetches++;return fetch(...args);};
const reader=new UpdateHttpReader(transport,nativeFetch),read=async(path:string,max:number)=>reader.read(register(new URL(path,location.origin).href),max,new AbortController().signal,()=>{if(!ownerCurrent)throw Error('CANCELLED');});
const nullController=createAssetUpdateController({trust:null,get source():never{throw Error('Default source inspected.');}});const beforeDefault=metrics.fetches;
if((await nullController.checkForUpdate()).kind!=='untrusted'||metrics.fetches!==beforeDefault)throw Error('DEFAULT_NETWORK');metrics.defaultFetches=metrics.fetches-beforeDefault;
const rawManifest=await read('/installed-release.json',1048576),manifestIndex=readUntrustedReleaseManifest(rawManifest);if(!manifestIndex.ok)throw Error(manifestIndex.error.code);
const initialAssets=[];for(const asset of manifestIndex.value.assets)initialAssets.push({path:asset.path,bytes:await read('/'+asset.path,asset.bytes)});
const initialEnvelope=parseStrictJsonBytes(await read('/installed-signature.json',4096),4096),installed=await verifyRelease(rawManifest,initialEnvelope,[key],0,{channel:'fixture-beta',assets:initialAssets});
if(!installed.ok||installed.value.keyId!==keyId)throw Error('INSTALLED_UNTRUSTED');
const walletRegistryBytes=initialAssets.find(a=>a.path==='wallet-registry.json')!.bytes,walletRegistry=new RegistryService();
const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',walletRegistryBytes)),b=>b.toString(16).padStart(2,'0')).join('');
if(!(await walletRegistry.load(walletRegistryBytes,digest)).ok)throw Error('WALLET_REGISTRY');
for(const asset of initialAssets)asset.bytes.fill(0);
const started=await startAppServices();if(!started.ok)throw Error(started.error.code);const services=started.value;
const seller='0x'+'11'.repeat(20),buyer='0x'+'33'.repeat(20),escrow='0x'+'22'.repeat(20);
let finishProvider:(()=>void)|undefined,walletAbort:AbortController|undefined,walletTask:Promise<void>|undefined;
const providerListeners=new Map<string,Set<(...args:unknown[])=>void>>();
const provider:Eip1193Provider={on(event,listener){const listeners=providerListeners.get(event)??new Set();listeners.add(listener);providerListeners.set(event,listeners);},removeListener(event,listener){providerListeners.get(event)?.delete(listener);},async request({method}){if(exclusive)throw Error('BUSY');metrics.walletPending++;metrics.walletCalls.push(method);try{
  if(method==='eth_requestAccounts'||method==='eth_accounts')return[seller];if(method==='eth_chainId')return'0x7a69';if(method==='eth_signTypedData_v4'){await new Promise<void>(done=>finishProvider=done);throw Object.assign(Error('Synthetic user refusal.'),{code:4001});}throw Error('UNSUPPORTED');
}finally{metrics.walletPending--;}}};
const adapter=new EvmWalletAdapter(provider,'local-held-provider',walletRegistry);
const source={locator:register(sourceOrigin+'/locator.json'),locatorEnvelope:register(sourceOrigin+'/locator-signature.json'),
  destination(cid:string){const base=new URL(gateway);return`https://${cid}.${base.hostname}${base.port?':'+base.port:''}/`;},
  resolve(cid:string,kind:'manifest'|'manifest-envelope'|'asset',path?:string){return register(new URL(kind==='manifest'?'release.json':kind==='manifest-envelope'?'release-signature.json':path!,this.destination(cid)).href);}};
const store=new IndexedDbAcceptedReleaseStore('fixture-beta',keyId);
const backup={capture():UpdateBackupSelection|null{
  const profileId=services.profileId,scope=services.selectionScope();if(!profileId||services.current.state!=='unlocked')return null;
  let phase:'selected'|'locked'|'disposed'='selected',lockedScope=-1;
  const current=()=>phase==='selected'?services.current.state==='unlocked'&&services.profileId===profileId&&services.selectionScope()===scope:phase==='locked'&&services.current.state==='locked'&&services.profileId===null&&services.selectionScope()===lockedScope;
  return{current,async requireVerifiedBackup(signal){if(phase!=='selected'||!current())throw Error('BACKUP_REQUIRED');const result=await services.checkBackupVerification(signal);if(!current()||!result.ok||!result.value.verification||result.value.verification.profileId!==profileId)throw Error('BACKUP_REQUIRED');},
    async lock(signal){if(signal.aborted||!current())throw Error('CANCELLED');const result=await services.lock();const after=services.selectionScope();if(!result.ok||signal.aborted||services.current.state!=='locked'||services.profileId!==null||after!==scope+1)throw Error('CANCELLED');lockedScope=after;phase='locked';},dispose(){phase='disposed';}};
}};
const walletQuiescence={acquire():UpdateWalletLease|null{if(metrics.walletPending||exclusive)return null;exclusive=true;let alive=true;return{current:()=>alive&&exclusive&&metrics.walletPending===0,async disconnect(signal){if(signal.aborted||metrics.walletPending)throw Error('BUSY');await adapter.disconnect();},release(){alive=false;exclusive=false;}};}};
const controller=createAssetUpdateController({trust:{keyId,key,channel:'fixture-beta',storageSchema:1,gateway,current:{sequence:installed.value.manifest.sequence,manifestSha256:installed.value.manifestSha256}},source,transport,fetch:nativeFetch,acceptedStore:store,
  owner:{current:()=>ownerCurrent,subscribeInvalidation(listener){invalidations.add(listener);return()=>invalidations.delete(listener);},isUserGesture(){const yes=gesture;gesture=false;return yes;}},backup,walletQuiescence,
  navigation:{openVerifiedDestination(url){metrics.opens++;location.assign(url);}}});
let candidate:object|undefined,lastCheck:UpdateCheck|undefined,lastAccept:unknown;
const body=document.body,title=document.createElement('h1');title.textContent='LOCAL supported signed-asset update';const status=document.createElement('p');status.id='update-status';status.textContent='Ready; production trust and network are not configured.';
const warning=document.createElement('p');warning.textContent='Compiled ephemeral key, local HTTPS certificate and synthetic direct-consent/wallet provider only. No production trust, private route, deployment, physical device or live-wallet integration qualification.';
const accept=document.createElement('button');accept.id='update-accept';accept.textContent='Confirm reviewed origin transition';accept.onclick=event=>{gesture=event.isTrusted&&navigator.userActivation.isActive;void controller.acceptUpdate(candidate).then(result=>{lastAccept=result;status.textContent=result.ok?'Transition requested.':result.error.code;});};body.append(title,warning,accept,status);
const casStore=new IndexedDbAcceptedReleaseStore('fixture-cas',keyId);
Object.assign(window,{updateFixture:{
  snapshot:()=>({metrics:structuredClone(metrics),lastCheck:lastCheck?{...lastCheck,...(lastCheck.kind==='candidate'?{candidate:undefined}:{})}:null,lastAccept,profileId:services.profileId,state:services.current.state,selection:services.selectionScope(),installedSequence:installed.value.manifest.sequence}),
  async check(){lastCheck=await controller.checkForUpdate();candidate=lastCheck.kind==='candidate'?lastCheck.candidate:undefined;status.textContent=lastCheck.kind==='candidate'?'Candidate reviewed.':lastCheck.kind;return lastCheck.kind;},
  async strictCheck(){transport.setMode('strict');const before=metrics.fetches;const result=await controller.checkForUpdate();metrics.strictFetches=metrics.fetches-before;transport.setMode('ordinary');return result;},
  async create(pass:string){const result=await services.create(pass);if(!result.ok)throw Error(result.error.code);return result.value.profileId;},
  async unlock(profileId:string,pass:string){const result=await services.unlock(profileId,pass);return result.ok?'unlocked':result.error.code;},
  async export(){if(!services.profileId)throw Error('LOCKED');const result=await services.exportEncrypted(services.profileId);if(!result.ok)throw Error(result.error.code);return Array.from(result.value.bytes);},
  async verify(bytes:number[],pass:string){const result=await services.verifyBackup(new Uint8Array(bytes),pass);return result.ok?result.value:result.error.code;},
  async restore(bytes:number[],pass:string,next:string){const result=await services.restore(new Uint8Array(bytes),pass,next);return result.ok?result.value:result.error.code;},
  async profiles(){const result=await services.listProfiles();if(!result.ok)throw Error(result.error.code);return result.value;},
  async floor(){return store.read(new AbortController().signal);},
  async casRead(){return casStore.read(new AbortController().signal);},
  async cas(expected:AcceptedRelease|null,sequence:number){return casStore.advance(expected,{v:1,channel:'fixture-cas',keyId,sequence,manifestSha256:String(sequence).padStart(64,'0')},new AbortController().signal,()=>{});},
  async corruptCas(){return new Promise<void>((done,bad)=>{const req=indexedDB.open('p2p-offramp-accepted-releases',1);req.onerror=()=>bad(Error('STORAGE_UNAVAILABLE'));req.onsuccess=()=>{const db=req.result,tx=db.transaction('accepted','readwrite');tx.objectStore('accepted').put({v:99,publicFixture:'malformed'},'fixture-cas\n'+keyId);tx.oncomplete=()=>{db.close();done();};tx.onabort=()=>{db.close();bad(Error('STORAGE_UNAVAILABLE'));};};});},
  async startWallet(){const connected=await adapter.connect('local-evm');if(!connected.ok)throw Error(connected.error.code);walletAbort=new AbortController();walletTask=adapter.signTerms(connected.value,{chainId:'31337',verifyingContract:escrow},{orderId:'a'.repeat(64),revision:'1',networkId:'local-evm',deploymentId:'escrow-fixture',seller,buyer,assetKind:'native',asset:'0x'+'0'.repeat(40),amountBaseUnits:'1',privateAgreementHash:'b'.repeat(64),capabilitiesHash:'c'.repeat(64),sellerNonce:'d'.repeat(64),acceptBeforeSeconds:'1700000000',escrowExpirySeconds:'1700086400'},'seller',walletAbort.signal).then(result=>{metrics.walletOutcome=result.ok?'UNEXPECTED':result.error.code;});},
  cancelWallet(){walletAbort?.abort();},async finishWallet(){finishProvider?.();await walletTask;},
  cancel(){controller.cancel();},async close(){ownerCurrent=false;for(const listener of [...invalidations])listener();finishProvider?.();await walletTask;await controller.dispose();casStore.close();adapter.dispose();transport.dispose();await services.dispose();},
}});
