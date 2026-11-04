import {parseTradeBinding} from '../../schemas/index.ts';
import type {CoreResult} from '../../schemas/index.ts';
import {checked,copy,integer,json,list,record,reject,text,unverified,utf8,utf8Length,view,wipe} from './boundary.ts';
import type {AdvisoryPolicy,JsonInput,JsonInputKind,LocalBounds,ProofInputParsers,ProofRequest,ReceiptStatement,ReceiptWitness,SourcePolicy,SourceRecord} from './types.ts';
export const LOCAL_DEFAULT_BOUNDS:Readonly<LocalBounds>=Object.freeze({maxIdBytes:128,maxOpaqueBytes:512,maxSaltBytes:64,maxOwnedWitnessBytes:1_048_576+8192});
const requestKeys=['v','binding','termsHash','sourcePolicyId','statementVersion','challenge','disclosureHash'] as const;
const statementKeys=['v','binding','termsHash','sourcePolicyId','parserVersion','challenge','currency','minorUnits','currencyScale','beneficiaryCommitment','referenceCommitment','transactionTimeSeconds','observedAtSeconds','status','responseCommitment','verifierProfileId'] as const;
const witnessKeys=['v','sourcePolicyId','parserVersion','authenticatedResponse','fieldSpans','rawAmount','currency','rawStatus','rawTimestamp','beneficiary','reference','beneficiarySalt','referenceSalt'] as const;
const sourceKeys=['id','version','httpsOrigin','pathPatternId','redirects','notaryKeyId','verifierProfileId','maxResponseBytes','maxAgeSeconds'] as const;
function one(input:unknown):1{if(input!==1)return reject('UNSUPPORTED_VERSION');return 1;}
function uint(input:unknown,bits:64|128,positive=false):string{
  if(typeof input!=='string'||input.length>(bits===64?20:39)||!/^(0|[1-9][0-9]*)$/.test(input))return reject();
  const number=BigInt(input);if(number>=(1n<<BigInt(bits))||positive&&number===0n)return reject();return input;
}
function hostname(input:unknown):string{
  const host=text(input,253);const labels=host.split('.');
  if(labels.length<2||labels.some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)||label.startsWith('xn--'))||! /^[a-z]{2,63}$/.test(labels.at(-1)!))return reject();
  return host;
}
function origin(input:unknown):string{
  const value=text(input,512);let url:URL;try{url=new URL(value);}catch{return reject();}
  if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return reject();
  hostname(url.hostname);return value;
}
function bindingEqual(a:ProofRequest['binding'],b:ProofRequest['binding']):boolean{
  return a.chain===b.chain&&a.networkId===b.networkId&&a.deploymentId===b.deploymentId&&a.tradeId===b.tradeId;
}
export function createProofInputParsers(options:unknown=undefined):CoreResult<ProofInputParsers>{return checked(()=>{
  const keys=['maxIdBytes','maxOpaqueBytes','maxSaltBytes','maxOwnedWitnessBytes'] as const;
  const config=options===undefined?{}:record(options,[],keys);
  const take=(key:typeof keys[number]):number=>Object.hasOwn(config,key)?integer(config[key],LOCAL_DEFAULT_BOUNDS[key]):LOCAL_DEFAULT_BOUNDS[key];
  const bounds=Object.freeze({maxIdBytes:take('maxIdBytes'),maxOpaqueBytes:take('maxOpaqueBytes'),maxSaltBytes:take('maxSaltBytes'),maxOwnedWitnessBytes:take('maxOwnedWitnessBytes')});
  if(!bounds.maxIdBytes||!bounds.maxOpaqueBytes||bounds.maxSaltBytes<16||!bounds.maxOwnedWitnessBytes)return reject();
  const id=(input:unknown):string=>{const value=text(input,bounds.maxIdBytes);if(!/^[a-z0-9][a-z0-9._:-]*$/.test(value)||['__proto__','constructor','prototype'].includes(value))return reject();return value;};
  // These are opaque draft values, NOT selected hash/challenge/commitment encodings.
  const opaque=(input:unknown):string=>{const value=text(input,bounds.maxOpaqueBytes);if(!/^[\x21-\x7e]+$/.test(value))return reject();return value;};
  const request=(input:unknown):ProofRequest=>{const r=record(input,requestKeys);return Object.freeze({v:one(r.v),binding:parseTradeBinding(r.binding),termsHash:opaque(r.termsHash),sourcePolicyId:id(r.sourcePolicyId),statementVersion:one(r.statementVersion),challenge:opaque(r.challenge),disclosureHash:opaque(r.disclosureHash)});};
  const sameRequest=(a:ProofRequest,b:ProofRequest):void=>{
    if(!bindingEqual(a.binding,b.binding)||a.termsHash!==b.termsHash||a.sourcePolicyId!==b.sourcePolicyId||a.challenge!==b.challenge||a.disclosureHash!==b.disclosureHash)return reject('INTEGRITY_FAILURE');
  };
  const sourcePolicy=(input:unknown):SourcePolicy=>{const r=record(input,sourceKeys);
    if(r.redirects!=='reject'||r.maxResponseBytes!==1048576||r.maxAgeSeconds!==300)return reject();
    return Object.freeze({id:id(r.id),version:one(r.version),httpsOrigin:origin(r.httpsOrigin),pathPatternId:id(r.pathPatternId),redirects:'reject',notaryKeyId:id(r.notaryKeyId),verifierProfileId:id(r.verifierProfileId),maxResponseBytes:1048576,maxAgeSeconds:300});
  };
  const sourceRecord=(input:unknown):SourceRecord=>{const r=record(input,['policyId','hostname','responseCommitment','observedAtSeconds','attestationHash']);return Object.freeze({policyId:id(r.policyId),hostname:hostname(r.hostname),responseCommitment:opaque(r.responseCommitment),observedAtSeconds:uint(r.observedAtSeconds,64),attestationHash:opaque(r.attestationHash)});};
  const statement=(input:unknown):ReceiptStatement=>{const r=record(input,statementKeys);
    const currency=text(r.currency,3);if(!/^[A-Z]{3}$/.test(currency))return reject();
    if(r.status!=='initiated'&&r.status!=='pending'&&r.status!=='posted'&&r.status!=='reversed'&&r.status!=='unknown')return reject();
    return Object.freeze({v:one(r.v),binding:parseTradeBinding(r.binding),termsHash:opaque(r.termsHash),sourcePolicyId:id(r.sourcePolicyId),parserVersion:id(r.parserVersion),challenge:opaque(r.challenge),currency,minorUnits:uint(r.minorUnits,128,true),currencyScale:integer(r.currencyScale,6),beneficiaryCommitment:opaque(r.beneficiaryCommitment),referenceCommitment:opaque(r.referenceCommitment),transactionTimeSeconds:uint(r.transactionTimeSeconds,64),observedAtSeconds:uint(r.observedAtSeconds,64),status:r.status,responseCommitment:opaque(r.responseCommitment),verifierProfileId:id(r.verifierProfileId)});
  };
  const advisory=(input:unknown):AdvisoryPolicy=>{const r=record(input,['mode','termsHash','sourcePolicyIds','maxAgeSeconds','autoRelease','retention']);
    if(r.mode!=='advisory'||r.maxAgeSeconds!==300||r.autoRelease!==false||r.retention!=='discard-after-session'&&r.retention!=='encrypted-user-retained')return reject();
    const ids=list(r.sourcePolicyIds,16).map(id);if(new Set(ids).size!==ids.length)return reject();
    return Object.freeze({mode:'advisory',termsHash:opaque(r.termsHash),sourcePolicyIds:Object.freeze(ids),maxAgeSeconds:300,autoRelease:false,retention:r.retention});
  };
  const witness=(input:unknown):ReceiptWitness=>{
    const r=record(input,witnessKeys),v=one(r.v),sourcePolicyId=id(r.sourcePolicyId),parserVersion=id(r.parserVersion);
    const rawAmount=text(r.rawAmount,512),currency=text(r.currency,512),rawStatus=text(r.rawStatus,512),rawTimestamp=text(r.rawTimestamp,512),beneficiary=text(r.beneficiary,256),reference=text(r.reference,256);
    const spanInput=r.fieldSpans;if(typeof spanInput!=='object'||spanInput===null||![Object.prototype,null].includes(Object.getPrototypeOf(spanInput)))return reject();
    const spanKeys=Reflect.ownKeys(spanInput);if(spanKeys.length>16)return reject('LIMIT_EXCEEDED');
    const fieldSpans:Record<string,Readonly<{start:number;end:number}>>=Object.create(null);let idBytes=0;
    for(const key of spanKeys){const name=id(key),d=Object.getOwnPropertyDescriptor(spanInput,name);if(!d||!d.enumerable||!('value'in d))return reject();
      const s=record(d.value,['start','end']),start=integer(s.start,1048576),end=integer(s.end,1048576);if(start>=end)return reject();
      fieldSpans[name]=Object.freeze({start,end});idBytes+=utf8Length(name);
    }
    // All foreign reflection is complete before borrowing buffers or copying any owned bytes.
    const response=view(r.authenticatedResponse,1048576),beneficiaryBytes=view(r.beneficiarySalt,bounds.maxSaltBytes),referenceBytes=view(r.referenceSalt,bounds.maxSaltBytes);
    if(!response.byteLength||beneficiaryBytes.byteLength<16||referenceBytes.byteLength<16)return reject();
    const total=response.byteLength+beneficiaryBytes.byteLength+referenceBytes.byteLength+idBytes+
      [sourcePolicyId,parserVersion,rawAmount,currency,rawStatus,rawTimestamp,beneficiary,reference].reduce((sum,s)=>sum+utf8Length(s),0);
    if(total>bounds.maxOwnedWitnessBytes)return reject('LIMIT_EXCEEDED');
    utf8(response);let previousEnd=0;
    for(const span of Object.values(fieldSpans).sort((a,b)=>a.start-b.start)){
      if(span.end>response.byteLength||span.start<previousEnd||span.start>0&&(response[span.start]!&192)===128||span.end<response.byteLength&&(response[span.end]!&192)===128)return reject();previousEnd=span.end;
    }
    let ownedResponse:Uint8Array<ArrayBuffer>|undefined,ownedBeneficiary:Uint8Array<ArrayBuffer>|undefined,ownedReference:Uint8Array<ArrayBuffer>|undefined;
    try{ownedResponse=copy(response);ownedBeneficiary=copy(beneficiaryBytes);ownedReference=copy(referenceBytes);
      return Object.freeze({v,sourcePolicyId,parserVersion,authenticatedResponse:ownedResponse,fieldSpans:Object.freeze(fieldSpans),rawAmount,currency,rawStatus,rawTimestamp,beneficiary,reference,beneficiarySalt:ownedBeneficiary,referenceSalt:ownedReference});
    }catch(error){wipe(ownedResponse);wipe(ownedBeneficiary);wipe(ownedReference);throw error;}
  };
  const empty=Object.freeze([]) as readonly never[];
  const parsers:ProofInputParsers=Object.freeze({localBounds:bounds,catalogs:Object.freeze({sources:empty,parsers:empty,verifiers:empty,rails:empty}),
    parseRequest(input:unknown,expected?:unknown){return checked(()=>{const parsed=request(input);if(expected!==undefined)sameRequest(parsed,request(expected));return unverified(parsed);});},
    parseWitness(input:unknown){return checked(()=>unverified(witness(input)));},
    parseSourcePolicy(input:unknown){return checked(()=>unverified(sourcePolicy(input)));},
    parseSourceRecord(input:unknown,expectedPolicy?:unknown){return checked(()=>{const parsed=sourceRecord(input);if(expectedPolicy!==undefined){const policy=sourcePolicy(expectedPolicy);if(parsed.policyId!==policy.id||parsed.hostname!==new URL(policy.httpsOrigin).hostname)return reject('INTEGRITY_FAILURE');}return unverified(parsed);});},
    parseStatement(input:unknown,expectedRequest?:unknown,expectedStatement?:unknown){return checked(()=>{const parsed=statement(input);if(expectedRequest!==undefined){const expected=request(expectedRequest);if(!bindingEqual(parsed.binding,expected.binding)||parsed.termsHash!==expected.termsHash||parsed.sourcePolicyId!==expected.sourcePolicyId||parsed.challenge!==expected.challenge)return reject('INTEGRITY_FAILURE');}
      if(expectedStatement!==undefined){const expected=statement(expectedStatement);for(const key of statementKeys){if(key==='binding'?!bindingEqual(parsed.binding,expected.binding):parsed[key]!==expected[key])return reject('INTEGRITY_FAILURE');}}
      return unverified(parsed);});},
    parseAdvisoryPolicy(input:unknown){return checked(()=>unverified(advisory(input)));},
    parseJson(kind:JsonInputKind,bytes:unknown){return checked(()=>{const raw=json(bytes);let data:JsonInput;
      switch(kind){case'request':data=request(raw);break;case'source-policy':data=sourcePolicy(raw);break;case'source-record':data=sourceRecord(raw);break;case'statement':data=statement(raw);break;case'advisory-policy':data=advisory(raw);break;default:return reject();}
      return unverified(data);});},
  });return parsers;
});}
