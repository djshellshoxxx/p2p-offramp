/** Isolated synthetic qualification, not a production app endpoint. */
import { createEvmAgreementHost } from '../../packages/wallet/test/lib/evm-agreement-host.ts';
import { createEvmAgreementPortAdapter } from '../../packages/wallet/test/lib/evm-agreement-port-adapter.ts';
let initialized=false;
self.onmessage=event=>{
  if(initialized)return;initialized=true;
  const {fixturePort,wirePort,holdAt,failSend}=event.data,calls=[];
  let active=0,maximumActive=0,sendAttempts=0,host,adapter;
  const emit=frame=>fixturePort.postMessage(frame);
  const snapshot=()=>({state:host.physicalState(),active,hashes:calls.length,maximumActive,sendAttempts,
    wiped:calls.every(c=>c.bytes.every(b=>b===0)),capturedNonzero:calls.some(c=>c.capturedNonzero)});
  self.addEventListener('unhandledrejection',()=>emit({type:'fixtureUnhandled'}));
  host=createEvmAgreementHost({sha256:async bytes=>{
    let resolve,reject;const gate=new Promise((yes,no)=>{resolve=yes;reject=no;});const native=crypto.subtle.digest('SHA-256',bytes);
    const call={bytes,native,resolve,reject,capturedNonzero:bytes.some(b=>b!==0)};calls.push(call);active++;maximumActive=Math.max(maximumActive,active);
    try{if(calls.length===holdAt){emit({type:'held',at:calls.length,...snapshot()});await gate;}return await native;}finally{active--;}
  }});
  adapter=createEvmAgreementPortAdapter(host,frame=>{sendAttempts++;if(failSend)throw Error('Synthetic send failure.');wirePort.postMessage(frame);});
  wirePort.onmessage=e=>{const requestId=e.data?.requestId;void adapter.receive(e.data).then(()=>emit({type:'processed',requestId,...snapshot()})).catch(()=>emit({type:'fixtureError'}));};
  wirePort.onmessageerror=()=>adapter.close();wirePort.start();
  fixturePort.onmessage=async event=>{const {id,command,mode}=event.data;
    try{
      if(command==='state')emit({type:'state',id,...snapshot()});
      else if(command==='release'){const call=calls[holdAt-1];await call.native;if(mode==='reject')call.reject(Error('Synthetic backend failure.'));else call.resolve();emit({type:'released',id,...snapshot()});}
      else if(command==='drain'){const pending=adapter.drain();emit({type:'draining',id,...snapshot()});await pending;emit({type:'drained',id,...snapshot()});}
      else if(command==='messageerror'){wirePort.dispatchEvent(new MessageEvent('messageerror'));emit({type:'messageerror',id,...snapshot()});}
      else throw Error('Unknown synthetic command.');
    }catch{emit({type:'fixtureError',id});}
  };
  fixturePort.start();emit({type:'ready',...snapshot()});
};
