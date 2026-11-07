import test from 'node:test';
import assert from 'node:assert/strict';
import {createProofJobs,G29_BUDGET} from '../index.ts';
import {parseWorkerCommand,parseWorkerReply,copyJobBytes} from '../src/protocol.ts';
import {parseBudget} from '../src/budget.ts';
import {encodeBase64url} from '../../schemas/index.ts';

const jobId=encodeBase64url(new Uint8Array(32).fill(17));
const identity={v:1,jobId,generation:3};
const good=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const bad=(result,code)=>{assert.equal(result.ok,false);if(code)assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|stack/);};

test('default provider boundary is empty and refuses before inspecting sensitive input or invoking collection',async()=>{
  let touched=0;const hostile=new Proxy({}, {get(){touched++;throw Error('PRIVATE');},ownKeys(){touched++;throw Error('PRIVATE');}});
  const jobs=createProofJobs();assert.ok(Object.isFrozen(jobs)&&Object.isFrozen(jobs.providers));assert.deepEqual(jobs.providers,[]);
  bad(await jobs.request(hostile,hostile,()=>{touched++;throw Error('PRIVATE');},hostile),'UNSUPPORTED_PROVIDER');
  assert.equal(touched,0);assert.deepEqual(Object.keys(jobs).sort(),['providers','request']);
});

test('worker command/reply schema is exact, detached and never upgrades resource output to proof',()=>{
  assert.deepEqual(good(parseWorkerCommand({...identity,kind:'init',profileId:'local-public-resource-v1'})),{...identity,kind:'init',profileId:'local-public-resource-v1'});
  const input=new Uint8Array([1,2,3]),command=good(parseWorkerCommand({...identity,kind:'prove',input}));input.fill(9);assert.deepEqual([...command.input],[1,2,3]);
  assert.ok(Object.isFrozen(command));assert.deepEqual(good(parseWorkerReply({...identity,kind:'progress',progress:100})),{...identity,kind:'progress',progress:100});
  for(const patch of [{kind:'init',profileId:'other'},{kind:'ready',paid:true},{kind:'progress',progress:101},{kind:'progress',progress:1.5},{kind:'failed',code:'PRIVATE'},{kind:'result',result:new Uint8Array(),verified:true}])bad(parseWorkerReply({...identity,...patch}));
  for(const id of [jobId+'=',jobId.slice(1),'PRIVATE',jobId.slice(0,-1)+'B'])bad(parseWorkerCommand({...identity,jobId:id,kind:'cancel'}));
  for(const generation of [-1,NaN,Infinity,0.5])bad(parseWorkerReply({...identity,generation,kind:'ready'}));
});

test('native bytes honor logical view bounds and reject oversized, shared or detached buffers without getters',()=>{
  const backing=new Uint8Array(20),view=backing.subarray(3,6);view.set([4,5,6]);assert.deepEqual([...good(copyJobBytes(view,3))],[4,5,6]);
  bad(copyJobBytes(view,2),'LIMIT_EXCEEDED');bad(parseWorkerCommand({...identity,kind:'prove',input:new Uint8Array(G29_BUDGET.maxWitnessBytes+1)}),'LIMIT_EXCEEDED');
  bad(parseWorkerReply({...identity,kind:'result',result:new Uint8Array(G29_BUDGET.maxProofBytes+1)}),'LIMIT_EXCEEDED');
  bad(copyJobBytes(new Uint8Array(new SharedArrayBuffer(8)),8));
  const detached=new Uint8Array(8);structuredClone(detached,{transfer:[detached.buffer]});bad(copyJobBytes(detached,8));
  let touched=0;const raw={...identity,kind:'prove'};Object.defineProperty(raw,'input',{enumerable:true,get(){touched++;throw Error('PRIVATE');}});bad(parseWorkerCommand(raw));assert.equal(touched,0);
});

test('resource ceilings only tighten and malformed budget records fail closed',()=>{
  const defaults=good(parseBudget());assert.equal(defaults.maxWitnessBytes,1048576);assert.equal(defaults.maxProofBytes,2097152);assert.equal(defaults.maxMessages,256);
  assert.equal(G29_BUDGET.maxWorkerLinearMemoryBytes,268435456);assert.equal(G29_BUDGET.maxActiveJobsPerTab,1);assert.equal(G29_BUDGET.maxQueuedJobs,0);assert.equal(G29_BUDGET.maxNetworkBytes,8388608);
  const tight=good(parseBudget({wallTimeMs:100,heartbeatMs:20,maxMessages:4,maxWitnessBytes:8,maxProofBytes:12}));assert.equal(tight.maxProofBytes,12);assert.ok(Object.isFrozen(tight));
  for(const patch of [{maxWitnessBytes:1048577},{maxProofBytes:2097153},{wallTimeMs:120001},{heartbeatMs:15001},{maxMessages:257},{maxMessages:0},{maxQueuedJobs:1},{maxProofBytes:Infinity},{wallTimeMs:null},{maxProofBytes:undefined},{heartbeatMs:'20'}])bad(parseBudget(patch));
});
