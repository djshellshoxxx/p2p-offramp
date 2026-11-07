/** Local unsigned directory inventory. This is not a G15 manifest, signature or deployment proof. */
import {createHash} from 'node:crypto';
import {safeArtifactPath} from '../../apps/web/scripts/artifact-policy.mjs';
import {parseStrictJsonBytes} from '../../packages/schemas/index.ts';

export const FORMAT='p2p-offramp/unsigned-distribution-stage/v1';
export const MAX_FILES=256, MAX_FILE_BYTES=8*1024*1024, MAX_TOTAL_BYTES=64*1024*1024;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const compare=(a,b)=>a<b?-1:a>b?1:0;
const refuse=()=>{throw Error('DISTRIBUTION_MANIFEST_INVALID');};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function exact(value,keys){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return refuse();
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))return refuse();
 const copy={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!('value'in d))return refuse();copy[key]=d.value;}return copy;
}
function list(value,max=MAX_FILES){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return refuse();
 const size=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!integer(size)||size>max||Reflect.ownKeys(value).length!==size+1)return refuse();
 return Array.from({length:size},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!d.enumerable||!('value'in d))return refuse();return d.value;});
}
export const WIKI_NAMES=Object.freeze(['Home','Getting-Started','Privacy-and-Recovery','Wallet-and-QR-Safety','Architecture-and-Development','Codespaces-Test-Lab','Security-and-Release']);
export const PUBLIC_COPIES=Object.freeze([
 ['contracts/evm/abi/BasicEscrow.json','public/BasicEscrow.json'],
 ['contracts/evm/src/BasicEscrow.sol','public/BasicEscrow.sol'],
 ['docs/recovery/CANONICAL-EVM.md','public/CANONICAL-EVM.md'],
 ['THIRD_PARTY_NOTICES.md','public/THIRD_PARTY_NOTICES.md'],
 ['package-lock.json','public/package-lock.json'],
 ...[...WIKI_NAMES.map(name=>`docs/wiki-source/${name}.md`),'docs/wiki-source/README.md','docs/wiki-source/claims-register.json','docs/wiki-source/docs-manifest.json',
 'docs/OPERATOR.md','docs/DEVELOPMENT_STATUS.md','docs/lab/README.md','scripts/docs/README.md'].map(path=>[path,`wiki/${path}`]),
].map(pair=>Object.freeze(pair)));
export const RECIPE_INPUTS=Object.freeze(['package.json','package-lock.json','THIRD_PARTY_NOTICES.md','tsconfig.json','apps/web/index.html','apps/web/vite.config.ts',
 'apps/web/tsconfig.ui.json','apps/web/tsconfig.runtime.json','apps/web/tsconfig.worker.json','apps/web/scripts/build.mjs','apps/web/scripts/artifact-policy.mjs',
 'apps/web/scripts/static-build-plugin.mjs','apps/web/scripts/source-locale.mjs','apps/web/scripts/testnet-trust.mjs','apps/web/src/testnet/sepolia-network.ts',
 'apps/portal/index.html','apps/portal/portal.css','scripts/portal/build.mjs','scripts/portal/policy.mjs','scripts/docs/validate.mjs','scripts/docs/generate.py',
 'scripts/lib/is-main.mjs','scripts/distribution/stage.mjs','scripts/distribution/manifest.mjs','docs/distribution/README.md','contracts/evm/foundry.toml',
 'packages/claims/index.ts','packages/claims/src/claims.ts','node_modules/vite/package.json','node_modules/typescript/package.json','node_modules/react/package.json','node_modules/react-dom/package.json']);
export function allowedSourceInputPath(path){
 safeArtifactPath(path);if(path.split('/').some(part=>part.startsWith('.')))return false;
 return RECIPE_INPUTS.includes(path)||PUBLIC_COPIES.some(([source])=>source===path)||
  /^apps\/web\/(?:src|scripts)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|css)$/.test(path)||
  /^packages\/(?:security\/release-context|wallet\/contract-acceptance)\.ts$/.test(path)||
  /^packages\/[a-z0-9-]+\/(?:index\.ts|src\/[A-Za-z0-9_./-]+\.ts|test\/[A-Za-z0-9_./-]+\.test\.mjs)$/.test(path)||
  /^node_modules\/(?:react|react-dom|scheduler)\/[A-Za-z0-9_./-]+\.js$/.test(path);
}
const clientRequired=['index.html','_headers','content-policy.json','third-party-licenses.json','core-graph-document.json','core-graph-worker.json','local-build-evidence.json'].map(path=>'client/'+path);
const portalRequired=['index.html','portal.css','_headers','content-policy.json','portal-build.json','downloads/BasicEscrow.json','downloads/BasicEscrow.sol','downloads/CANONICAL-EVM.md'].map(path=>'portal/'+path);
const required=Object.freeze([...clientRequired,...portalRequired,...PUBLIC_COPIES.map(([,path])=>path),'wiki/docs-consistency.json','review-packet.json'].sort(compare));
export function allowedAssetPath(path){
 safeArtifactPath(path);
 return required.includes(path)||/^client\/assets\/(?:index-[A-Za-z0-9_-]+\.(?:js|css)|vault\.worker-[A-Za-z0-9_-]+\.js)$/.test(path);
}
function records(input,assets){
 const seen=new Set();let previous='',total=0;
 const rows=list(input).map(value=>{
  const row=exact(value,['path','bytes','sha256']);safeArtifactPath(row.path);
  if(typeof row.path!=='string'||row.path<=previous||seen.has(row.path.toLowerCase())||!integer(row.bytes)||row.bytes<1||row.bytes>MAX_FILE_BYTES||!hash(row.sha256)||
     (assets?!allowedAssetPath(row.path):!allowedSourceInputPath(row.path)))return refuse();
  previous=row.path;seen.add(row.path.toLowerCase());total+=row.bytes;return Object.freeze(row);
 });
 if(!rows.length||total>MAX_TOTAL_BYTES)return refuse();
 if(assets){
  if(required.some(path=>!rows.some(row=>row.path===path)))return refuse();
  for(const pattern of [/^client\/assets\/index-[\w-]+\.js$/, /^client\/assets\/index-[\w-]+\.css$/, /^client\/assets\/vault\.worker-[\w-]+\.js$/])
   if(rows.filter(row=>pattern.test(row.path)).length!==1)return refuse();
 }
 return Object.freeze(rows);
}
export function validateManifest(input){
 try{
  const m=exact(input,['format','source','build','approval','assets','assetSetSha256','selfHashIncluded']);
  if(m.format!==FORMAT||m.selfHashIncluded!==false)return refuse();
  const source=exact(m.source,['commit','dirty','statusSha256','inputs']);
  if(typeof source.commit!=='string'||!/^[a-f0-9]{40}$/.test(source.commit)||typeof source.dirty!=='boolean'||!hash(source.statusSha256))return refuse();
  source.inputs=records(source.inputs,false);
  const inputs=new Map(source.inputs.map(record=>[record.path,record]));
  if([...RECIPE_INPUTS,...PUBLIC_COPIES.map(([path])=>path)].some(path=>!inputs.has(path)))return refuse();
  const build=exact(m.build,['profile','node','npm','vite','typescript','react','reactDom','platform','arch','nodeExecutableSha256','passes','localBytesEqual','independentWitnesses']);
  if(build.profile!=='default-meta-client+scriptless-source-portal+unpublished-wiki'||build.passes!==2||build.localBytesEqual!==true||build.independentWitnesses!==0||!hash(build.nodeExecutableSha256))return refuse();
  for(const key of ['node','npm','vite','typescript','react','reactDom'])if(typeof build[key]!=='string'||!/^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(build[key]))return refuse();
  if(!['linux','darwin','win32'].includes(build.platform)||!['x64','arm64'].includes(build.arch))return refuse();
  const approval=exact(m.approval,['signedRelease','releaseEnabled','approvedDeployment','hostHeadersVerified','independentReproducibility','published']);
  if(Object.values(approval).some(value=>value!==false))return refuse();
  const assets=records(m.assets,true);if(!hash(m.assetSetSha256)||m.assetSetSha256!==sha256(JSON.stringify(assets)))return refuse();
  for(const[sourcePath,assetPath]of PUBLIC_COPIES){
   const source=inputs.get(sourcePath),asset=assets.find(record=>record.path===assetPath);
   if(source.bytes!==asset.bytes||source.sha256!==asset.sha256)return refuse();
  }
  return Object.freeze({format:FORMAT,source:Object.freeze(source),build:Object.freeze(build),approval:Object.freeze(approval),assets,assetSetSha256:m.assetSetSha256,selfHashIncluded:false});
 }catch{return refuse();}
}
export function manifestBytes(input){return Buffer.from(JSON.stringify(validateManifest(input),null,2)+'\n');}
export function parseManifest(bytes){return validateManifest(parseStrictJsonBytes(bytes,1024*1024));}
export const APPROVAL=Object.freeze({signedRelease:false,releaseEnabled:false,approvedDeployment:false,hostHeadersVerified:false,independentReproducibility:false,published:false});

/** No imported review status can promote this unsigned inventory. Missing inputs remain explicit. */
export function reviewPacket(docs){
 const values={};
 if(!docs||typeof docs!=='object')return refuse();
 for(const key of ['engineeringConsistency','semanticApproval','published','approvedRelease','sourceCommit','linkReportDigest']){
  const d=Object.getOwnPropertyDescriptor(docs,key);if(!d||!d.enumerable||!('value'in d))return refuse();values[key]=d.value;
 }
 if(values.engineeringConsistency!==true||values.semanticApproval!==false||values.published!==false||values.approvedRelease!==null||
    typeof values.sourceCommit!=='string'||!/^[a-f0-9]{40}$/.test(values.sourceCommit)||!hash(values.linkReportDigest))return refuse();
 return Object.freeze({format:'p2p-offramp/unsigned-distribution-review/v1',purpose:'local-unapproved-asset-inventory',approval:APPROVAL,
  maintainedTrustKey:null,approvedRelease:null,approvedDeployment:null,signingEnvelope:null,publicationOrigin:null,ipfsRoot:null,
  recovery:Object.freeze({executableIncluded:false,reason:'KEY_UNPINNED',authority:'existing-canonical-G25-builder-only',
   preservedSourceReferences:Object.freeze(['public/BasicEscrow.json','public/BasicEscrow.sol','public/CANONICAL-EVM.md'])}),
  documentation:Object.freeze({engineeringConsistency:true,semanticApproval:false,published:false,sourceCommit:values.sourceCommit,linkReportDigest:values.linkReportDigest}),
  requiredExternalEvidence:Object.freeze(['authenticated-maintainer-trust-policy','qualified-original-deployment-profile','independent-builder-witness',
   'fresh-locked-dependency-install-and-clean-source-witness','professional-security-and-cryptographic-review','physical-device-and-accessibility-qualification','actual-host-header-and-distribution-witness']),
  excludedProtocols:Object.freeze(['archive-extraction','trust-rotation','nonempty-G15-deployment-wire','funding-authorization']),
  signingHandoff:'Do not sign this inventory as G15. Use the maintained G15/G25 tools only after the actual policy/profile is approved; existing funded exits remain bound to their original authenticated ABI and deployment.'});
}
