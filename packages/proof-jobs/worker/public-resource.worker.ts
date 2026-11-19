/** Compiled PUBLIC conformance fixture. No TLS, provider, wallet, storage or network driver. */
import {parseWorkerCommand,PUBLIC_RESOURCE_PROFILE,type JobIdentity,type ProofWorkerReply} from '../src/protocol.ts';
import {G29_BUDGET} from '../src/budget.ts';
declare const self:DedicatedWorkerGlobalScope;
let identity:JobIdentity|undefined,phase:'idle'|'ready'|'running'|'closed'='idle';
const send=(reply:ProofWorkerReply):void=>self.postMessage(reply,reply.kind==='result'?[reply.result.buffer]:[]);
const failure=(code:'INVALID_INPUT'|'INTEGRITY_FAILURE'|'UNSUPPORTED_PROVIDER'):void=>{
  if(identity)send({...identity,kind:'failed',code});phase='closed';
};
function execute(input:Uint8Array<ArrayBuffer>):void{
  if(!identity)return;const id=identity,mode=input[0]??0;
  try{
    if(mode===1){
      // Deliberately ignores cooperative messages during a finite five-second CPU task.
      const started=performance.now();let sum=0;
      while(performance.now()-started<5_000)for(let i=0;i<10_000;i++)sum=(sum+i)>>>0;
      send({...id,kind:'result',result:new Uint8Array([sum&255])});
    }else if(mode===2){
      // Native event loop remains alive, but no heartbeat/result is emitted.
    }else if(mode===3){send({...id,kind:'result',result:new Uint8Array(G29_BUDGET.maxProofBytes+1)});
    }else if(mode===4){send({...id,generation:id.generation+1,kind:'progress',progress:1});
    }else if(mode===5){for(let i=0;i<300;i++)send({...id,kind:'progress',progress:1});
    }else if(mode===6){throw new Error('Public resource fixture crash.');
    }else if(mode===7){
      // This is a separate unsupported-path probe, never a JS fallback after WASM failure.
      void WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])).then(
        ()=>failure('INTEGRITY_FAILURE'),()=>failure('UNSUPPORTED_PROVIDER'));
    }else if(mode===8){
      self.postMessage({...id,kind:'result',result:new Uint8Array([1]),verified:true});
    }else if(mode===9){setInterval(()=>send({...id,kind:'progress',progress:1}),5);
    }else{
      let sum=0;for(const byte of input)sum=(sum+byte)>>>0;
      const output=new Uint8Array(4);new DataView(output.buffer).setUint32(0,sum);send({...id,kind:'result',result:output});
    }
  }finally{input.fill(0);}
}
self.addEventListener('message',event=>{
  const parsed=parseWorkerCommand(event.data);
  try{
    const raw=typeof event.data==='object'&&event.data!==null?Object.getOwnPropertyDescriptor(event.data,'input'):undefined;
    if(raw&&'value'in raw&&raw.value instanceof Uint8Array&&raw.value.byteLength<=G29_BUDGET.maxWitnessBytes)raw.value.fill(0);
  }catch{/* Foreign malformed messages do not acquire a job. */}
  if(!parsed.ok){failure('INVALID_INPUT');return;}
  const command=parsed.value;
  if(command.kind==='cancel'){phase='closed';self.close();return;}
  if(command.kind==='init'){
    if(phase!=='idle'){failure('INTEGRITY_FAILURE');return;}
    identity={v:1,jobId:command.jobId,generation:command.generation};
    if(command.profileId!==PUBLIC_RESOURCE_PROFILE){failure('UNSUPPORTED_PROVIDER');return;}
    phase='ready';send({...identity,kind:'ready'});return;
  }
  if(phase!=='ready'||!identity||command.jobId!==identity.jobId||command.generation!==identity.generation){command.input.fill(0);failure('INTEGRITY_FAILURE');return;}
  phase='running';execute(command.input);
});
self.addEventListener('messageerror',()=>{failure('INTEGRITY_FAILURE');self.close();});
