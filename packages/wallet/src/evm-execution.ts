/** Test-only explicit EVM execution. Not exported or bundled by the application.
 * The injected canonical validator and journal are trusted composition capabilities, never imported data.
 * A durable marker precedes exactly one send. Unknown outcomes are never retried automatically.
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { intentData, parseIntent, type CoreErrorCode, type CoreResult, type IntentV1 } from '../../schemas/index.ts';
import type { Eip1193Provider } from './evm-adapter.ts';

export interface PreparedEvmRequestV1 {
  readonly version: 1; readonly chainId: string; readonly from: string; readonly to: string;
  readonly value: string; readonly data: string; readonly nonce: string;
}
export interface ExecutionSession { readonly account: string; readonly chainId: string; readonly generation: number; }
export interface ExecutionJournalPort {
  reserve(intent: IntentV1, expectedRevision: number, signal?: AbortSignal): Promise<CoreResult<string>>;
  markSending(intentId: string, signal?: AbortSignal): Promise<CoreResult<void>>;
  recordBroadcast(intentId: string, hash: string, signal?: AbortSignal): Promise<CoreResult<void>>;
}
export interface EvmExecutionOptions {
  readonly provider: Eip1193Provider;
  readonly session: ExecutionSession;
  readonly isCurrent: (session: ExecutionSession) => boolean;
  readonly journal: ExecutionJournalPort;
  /** Must bind the exact call target, selector/arguments, principal, nonce and registry deployment to this intent. */
  readonly validateCanonical: (intent: IntentV1, request: PreparedEvmRequestV1) => CoreResult<void> | Promise<CoreResult<void>>;
}
const fail = (code: CoreErrorCode): CoreResult<never> => Object.freeze({ok:false,error:createCoreError(code,{operationId:createOperationId(),readOnly:false})});
const ADDRESS = /^0x[0-9a-f]{40}$/, HASH = /^0x[0-9a-f]{64}$/i;
const decimal = (value: unknown, bits: number, minimum=0n): value is string => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value)>=minimum && BigInt(value)<(1n<<BigInt(bits));
const quantity = (value: string) => `0x${BigInt(value).toString(16)}`;
export function parsePreparedEvmRequest(input: unknown): PreparedEvmRequestV1 {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > 65536) throw Error('INVALID_INPUT');
  const raw = intentData(JSON.parse(input),['version','chainId','from','to','value','data','nonce']);
  if (raw.version !== 1 || !decimal(raw.chainId,256,1n) || !decimal(raw.value,256) || !decimal(raw.nonce,64) ||
      typeof raw.from !== 'string' || !ADDRESS.test(raw.from) || /^0x0{40}$/.test(raw.from) ||
      typeof raw.to !== 'string' || !ADDRESS.test(raw.to) || /^0x0{40}$/.test(raw.to) ||
      typeof raw.data !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(raw.data)) throw Error('INVALID_INPUT');
  const request = Object.freeze({version:1 as const,chainId:raw.chainId,from:raw.from,to:raw.to,value:raw.value,data:raw.data,nonce:raw.nonce});
  if (JSON.stringify(request)!==input) throw Error('INVALID_INPUT');
  return request;
}
function errorCode(error: unknown): number | undefined {
  try { const descriptor = Object.getOwnPropertyDescriptor(error,'code'); return descriptor && 'value' in descriptor && typeof descriptor.value === 'number' ? descriptor.value : undefined; }
  catch { return undefined; }
}
/** The physical slot is held until the provider settles, even when it ignores cancellation. */
export function createEvmExecution(options: EvmExecutionOptions) {
  let active = false, disposed = false;
  const lifecycle = new AbortController();
  const originalSession = options.session;
  let session: ExecutionSession;
  try {
    const raw = intentData(originalSession,['account','chainId','generation']);
    if (typeof raw.account !== 'string' || !ADDRESS.test(raw.account) || !decimal(raw.chainId,256,1n) ||
        typeof raw.generation !== 'number' || !Number.isSafeInteger(raw.generation) || raw.generation < 0) throw Error();
    session = Object.freeze({account:raw.account,chainId:raw.chainId,generation:raw.generation});
  } catch { throw Error('INVALID_INPUT'); }
  const current = () => {
    try { return !disposed && options.isCurrent(originalSession); } catch { return false; }
  };
  return Object.freeze({
    async submit(input: IntentV1, expectedRevision: number, signal?: AbortSignal): Promise<CoreResult<{readonly hash:string}>> {
      if (!current()) return fail('LOCKED');
      if (signal?.aborted) return fail('CANCELLED');
      if (active) return fail('CONFLICT');
      active=true; let sent=false, marking=false;
      const guard = (): CoreResult<never> | undefined => !current() ? fail('LOCKED') : signal?.aborted ? fail('CANCELLED') : undefined;
      const work = async (): Promise<CoreResult<{readonly hash:string}>> => {
      try {
        let intent:IntentV1,request:PreparedEvmRequestV1;
        try {
          intent=parseIntent(input);request=parsePreparedEvmRequest(intent.preparedRequest);
          if (intent.binding.chain!=='evm' || intent.submission.chain!=='evm' || intent.state!=='prepared' || intent.submission.hash!==null ||
              intent.account!==session.account || request.from!==session.account || request.chainId!==session.chainId ||
              intent.walletGeneration!==session.generation || intent.submission.nonce!==request.nonce || intent.replacementOf!==null) return fail('INVALID_INPUT');
        } catch { return fail('INVALID_INPUT'); }
        const valid:unknown=await options.validateCanonical(intent,request);
        const stopped=guard();if(stopped)return stopped;
        const raw=intentData(valid,['ok',Object.getOwnPropertyDescriptor(valid,'ok')?.value===true?'value':'error']);
        if(raw.ok!==true || raw.value!==undefined)return fail('INTEGRITY_FAILURE');
        const accounts=await options.provider.request({method:'eth_accounts'});
        const chain=await options.provider.request({method:'eth_chainId'});
        const changed=guard();if(changed)return changed;
        if (!Array.isArray(accounts) || accounts.length===0 || typeof accounts[0]!=='string' || accounts[0].toLowerCase()!==session.account) return fail('UNAUTHORIZED');
        if(typeof chain!=='string' || !/^0x[0-9a-f]+$/.test(chain) || BigInt(chain).toString()!==session.chainId)return fail('WRONG_CHAIN');
        const reserved=await options.journal.reserve(intent,expectedRevision,signal);if(!reserved.ok)return reserved;
        const afterReserve=guard();if(afterReserve)return afterReserve;
        marking=true;
        const marked=await options.journal.markSending(intent.intentId,signal);if(!marked.ok)return marked;
        const afterMarker=guard();if(afterMarker)return fail('BROADCAST_UNKNOWN');
        // A wallet may omit change events while durable preparation waits on storage.
        const finalAccounts=await options.provider.request({method:'eth_accounts'});
        const finalChain=await options.provider.request({method:'eth_chainId'});
        if(guard() || !Array.isArray(finalAccounts) || typeof finalAccounts[0]!=='string' || finalAccounts[0].toLowerCase()!==session.account ||
           typeof finalChain!=='string' || !/^0x[0-9a-f]+$/.test(finalChain) || BigInt(finalChain).toString()!==session.chainId)return fail('BROADCAST_UNKNOWN');
        // A persisted marker consumes this explicit attempt even if the following wallet call rejects.
        sent=true;
        const result=await options.provider.request({method:'eth_sendTransaction',params:[{from:request.from,to:request.to,value:quantity(request.value),data:request.data,nonce:quantity(request.nonce),chainId:quantity(request.chainId)}]});
        if(typeof result!=='string' || !HASH.test(result))return fail('BROADCAST_UNKNOWN');
        const late=guard();if(late)return fail('BROADCAST_UNKNOWN');
        const canonicalHash=result.toLowerCase();
        const recorded=await options.journal.recordBroadcast(intent.intentId,canonicalHash,signal);
        if(!recorded.ok || guard())return fail('BROADCAST_UNKNOWN');
        return Object.freeze({ok:true,value:Object.freeze({hash:canonicalHash})});
      } catch(error) {
        if(sent || marking)return fail('BROADCAST_UNKNOWN');
        const stopped=guard();if(stopped)return stopped;
        return fail(errorCode(error)===4001?'USER_REJECTED':'UNAVAILABLE');
      } finally {active=false;}
      };
      let onAbort: (() => void) | undefined;
      const running=work();
      const disposedResult = new Promise<CoreResult<never>>(resolve => {
        const stop = () => resolve(fail(sent || marking ? 'BROADCAST_UNKNOWN' : 'LOCKED'));
        lifecycle.signal.addEventListener('abort', stop, {once:true});
        running.finally(() => lifecycle.signal.removeEventListener('abort', stop));
        if (lifecycle.signal.aborted) stop();
      });
      if (!signal) return Promise.race([running, disposedResult]);
      const cancelled=new Promise<CoreResult<never>>(resolve=>{onAbort=()=>resolve(fail(sent || marking?'BROADCAST_UNKNOWN':'CANCELLED'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
      try {return await Promise.race([running,cancelled,disposedResult]);}
      finally {if(onAbort)signal.removeEventListener('abort',onAbort);}
    },
    dispose(){disposed=true;lifecycle.abort();},
  });
}
