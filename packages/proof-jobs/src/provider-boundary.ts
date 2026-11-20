import type {CoreResult} from '../../schemas/index.ts';
import {failed} from './data.ts';
export interface ProofJobs {
  readonly providers:readonly never[];
  request(request:unknown,consent:unknown,collectWitness:unknown,signal?:AbortSignal):Promise<CoreResult<never>>;
}
/** There is no selected provider, registration path, witness intake or private Worker allocation. */
export function createProofJobs():ProofJobs{
  return Object.freeze({providers:Object.freeze([]) as readonly never[],async request(){return failed('UNSUPPORTED_PROVIDER');}});
}
