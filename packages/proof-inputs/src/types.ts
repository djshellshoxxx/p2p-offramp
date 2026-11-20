import type {CoreResult,TradeBinding} from '../../schemas/index.ts';
export interface UnverifiedInput<T> {
  readonly kind:'unverified-proof-input';readonly data:T;readonly compatibilityAvailable:false;
  readonly sourceAuthenticated:false;readonly semanticCoverage:false;
  readonly proofVerified:false;readonly receiptAuthority:false;readonly economicPreparationAllowed:false;
}
export interface ProofRequest {
  readonly v:1;readonly binding:TradeBinding;readonly termsHash:string;readonly sourcePolicyId:string;
  readonly statementVersion:1;readonly challenge:string;readonly disclosureHash:string;
}
export interface ReceiptWitness {
  readonly v:1;readonly sourcePolicyId:string;readonly parserVersion:string;
  readonly authenticatedResponse:Uint8Array<ArrayBuffer>;
  readonly fieldSpans:Readonly<Record<string,Readonly<{start:number;end:number}>>>;
  readonly rawAmount:string;readonly currency:string;readonly rawStatus:string;readonly rawTimestamp:string;
  readonly beneficiary:string;readonly reference:string;
  readonly beneficiarySalt:Uint8Array<ArrayBuffer>;readonly referenceSalt:Uint8Array<ArrayBuffer>;
}
export interface SourcePolicy {
  readonly id:string;readonly version:1;readonly httpsOrigin:string;readonly pathPatternId:string;
  readonly redirects:'reject';readonly notaryKeyId:string;readonly verifierProfileId:string;
  readonly maxResponseBytes:1048576;readonly maxAgeSeconds:300;
}
/** Untrusted input bearing the draft AuthenticatedSource record shape only. */
export interface SourceRecord {
  readonly policyId:string;readonly hostname:string;readonly responseCommitment:string;
  readonly observedAtSeconds:string;readonly attestationHash:string;
}
export interface ReceiptStatement {
  readonly v:1;readonly binding:TradeBinding;readonly termsHash:string;readonly sourcePolicyId:string;
  readonly parserVersion:string;readonly challenge:string;readonly currency:string;readonly minorUnits:string;
  readonly currencyScale:number;readonly beneficiaryCommitment:string;readonly referenceCommitment:string;
  readonly transactionTimeSeconds:string;readonly observedAtSeconds:string;
  readonly status:'initiated'|'pending'|'posted'|'reversed'|'unknown';
  readonly responseCommitment:string;readonly verifierProfileId:string;
}
export interface AdvisoryPolicy {
  readonly mode:'advisory';readonly termsHash:string;readonly sourcePolicyIds:readonly string[];
  readonly maxAgeSeconds:300;readonly autoRelease:false;
  readonly retention:'discard-after-session'|'encrypted-user-retained';
}
/** LOCAL bounds only; missing draft wire limits remain unselected. Options can only tighten. */
export interface LocalBounds {
  readonly maxIdBytes:number;readonly maxOpaqueBytes:number;readonly maxSaltBytes:number;
  readonly maxOwnedWitnessBytes:number;
}
export type JsonInputKind='request'|'source-policy'|'source-record'|'statement'|'advisory-policy';
export type JsonInput=ProofRequest|SourcePolicy|SourceRecord|ReceiptStatement|AdvisoryPolicy;
export interface ProofInputParsers {
  readonly localBounds:Readonly<LocalBounds>;
  readonly catalogs:Readonly<{sources:readonly never[];parsers:readonly never[];verifiers:readonly never[];rails:readonly never[]}>;
  parseRequest(input:unknown,expected?:unknown):CoreResult<UnverifiedInput<ProofRequest>>;
  parseWitness(input:unknown):CoreResult<UnverifiedInput<ReceiptWitness>>;
  parseSourcePolicy(input:unknown):CoreResult<UnverifiedInput<SourcePolicy>>;
  parseSourceRecord(input:unknown,expectedPolicy?:unknown):CoreResult<UnverifiedInput<SourceRecord>>;
  parseStatement(input:unknown,expectedRequest?:unknown,expectedStatement?:unknown):CoreResult<UnverifiedInput<ReceiptStatement>>;
  parseAdvisoryPolicy(input:unknown):CoreResult<UnverifiedInput<AdvisoryPolicy>>;
  parseJson(kind:JsonInputKind,bytes:unknown):CoreResult<UnverifiedInput<JsonInput>>;
}
