import {checked,counter,record,stop} from './data.ts';
import type {CoreResult} from '../../schemas/index.ts';

export const G29_BUDGET=Object.freeze({maxWitnessBytes:1_048_576,maxProofBytes:2_097_152,maxWorkerLinearMemoryBytes:268_435_456,
  wallTimeMs:120_000,heartbeatMs:15_000,maxActiveJobsPerTab:1,maxQueuedJobs:0,maxNetworkBytes:8_388_608,maxMessages:256} as const);
export interface ResourceBudget {
  readonly maxWitnessBytes:number;readonly maxProofBytes:number;readonly wallTimeMs:number;
  readonly heartbeatMs:number;readonly maxMessages:number;
}
export function parseBudget(input:unknown=undefined):CoreResult<Readonly<ResourceBudget>>{
  return checked(()=>{
    const keys=['maxWitnessBytes','maxProofBytes','wallTimeMs','heartbeatMs','maxMessages'] as const;
    const raw=input===undefined?{}:record(input,[],keys);
    const take=(key:typeof keys[number],fallback:number,maximum:number):number=>Object.hasOwn(raw,key)?counter(raw[key],maximum):fallback;
    const wallTimeMs=take('wallTimeMs',G29_BUDGET.wallTimeMs,G29_BUDGET.wallTimeMs);
    const heartbeatMs=take('heartbeatMs',Math.min(wallTimeMs,G29_BUDGET.heartbeatMs),G29_BUDGET.heartbeatMs);
    const maxMessages=take('maxMessages',G29_BUDGET.maxMessages,G29_BUDGET.maxMessages);
    if(!wallTimeMs||!heartbeatMs||heartbeatMs>wallTimeMs||!maxMessages)return stop();
    return Object.freeze({maxWitnessBytes:take('maxWitnessBytes',G29_BUDGET.maxWitnessBytes,G29_BUDGET.maxWitnessBytes),
      maxProofBytes:take('maxProofBytes',G29_BUDGET.maxProofBytes,G29_BUDGET.maxProofBytes),wallTimeMs,heartbeatMs,maxMessages});
  });
}
