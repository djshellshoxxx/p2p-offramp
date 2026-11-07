/** Public MVP WASM: (module (memory (export "memory") 1 4096)). No imports/code/witness. */
import {parentPort} from 'node:worker_threads';
import {createHash} from 'node:crypto';
const bytes=new Uint8Array([0,97,115,109,1,0,0,0,5,5,1,1,1,128,32,7,10,1,6,109,101,109,111,114,121,2,0]);
const module=await WebAssembly.compile(bytes),instance=await WebAssembly.instantiate(module);
const memory=instance.exports.memory,initialBytes=memory.buffer.byteLength;
if(WebAssembly.Module.imports(module).length!==0||!(memory instanceof WebAssembly.Memory))throw Error('Invalid public memory fixture.');
const priorPages=memory.grow(4095),maximumBytes=memory.buffer.byteLength;let beyondRefused=false;
try{memory.grow(1);}catch(error){beyondRefused=error instanceof RangeError;}
parentPort.postMessage({kind:'public-node-wasm-memory',moduleSha256:createHash('sha256').update(bytes).digest('hex'),initialBytes,priorPages,maximumBytes,beyondRefused,bytesAfterRefusal:memory.buffer.byteLength,imports:0,browserQualified:false,providerApproved:false,proofVerified:false});
parentPort.close();
