import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {G29_BUDGET} from '../index.ts';
const worker=new Worker(new URL('./fixtures/wasm-memory.worker.mjs',import.meta.url),{execArgv:[]});
let timer;
try{
  const result=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Native public WASM fixture timed out.')),5000);
    worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(Error('Native public WASM fixture failed.'));});
  });
  assert.equal(result.kind,'public-node-wasm-memory');assert.equal(result.initialBytes,65536);assert.equal(result.priorPages,1);
  assert.equal(result.maximumBytes,G29_BUDGET.maxWorkerLinearMemoryBytes);assert.equal(result.bytesAfterRefusal,result.maximumBytes);assert.equal(result.beyondRefused,true);assert.equal(result.imports,0);
  assert.equal(result.browserQualified,false);assert.equal(result.providerApproved,false);assert.equal(result.proofVerified,false);assert.match(result.moduleSha256,/^[0-9a-f]{64}$/);
  console.log(JSON.stringify({...result,nativeWorker:true,node:process.version,linearMemoryOnly:true,devicePeakMemoryQualified:false}));
}finally{clearTimeout(timer);await worker.terminate();}
