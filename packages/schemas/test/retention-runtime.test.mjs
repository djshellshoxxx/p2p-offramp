import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRuntimeCommand,parseRuntimeMessage} from '../index.ts';
const profileId='ab'.repeat(16),previewId=Buffer.alloc(32,7).toString('base64url');
const header={version:1,requestId:1,generation:0};
const consent={previewId,expectedRevision:7,consentRevision:7,reviewed:true,logicalOnly:true,backupAndRemoteLimitsAcknowledged:true};
const preview={version:1,profileId,previewId,revision:7,archiveReviewCount:2,reviewedDeleteCount:3,protectedCount:1,nativeReviewAvailable:true,logicalOnly:true,backupAndRemoteCopiesUnaffected:true};
const message=value=>({...header,kind:'response',operation:'reviewRetention',result:{ok:true,value}});
test('retention protocol copies exact primitive-only previews and explicit consent',()=>{
 for(const operation of ['planRetention','reviewRetention'])assert.equal(parseRuntimeCommand({...header,operation,profileId}).operation,operation);
 assert.deepEqual(parseRuntimeCommand({...header,operation:'deleteReviewedRecords',profileId,...consent}),{...header,operation:'deleteReviewedRecords',profileId,...consent});
 assert.deepEqual(parseRuntimeMessage(message(preview)).result.value,preview);
 assert.ok(Object.isFrozen(parseRuntimeMessage(message(preview)).result.value));
});
test('retention protocol rejects forged shape, payloads, unsafe counts and missing consent without invoking getters',()=>{
 for(const extra of [{reviewed:false},{logicalOnly:false},{backupAndRemoteLimitsAcknowledged:false},{expectedRevision:8},{previewId:'x'},{recordIds:['ab'.repeat(16)]}])assert.throws(()=>parseRuntimeCommand({...header,operation:'deleteReviewedRecords',profileId,...consent,...extra}));
 for(const extra of [{recordIds:[]},{protectedCount:-1},{reviewedDeleteCount:10001},{nativeReviewAvailable:false},{revision:1048576},{backupAndRemoteCopiesUnaffected:false}])assert.throws(()=>parseRuntimeMessage(message({...preview,...extra})));
 let calls=0;const hostile={...preview};Object.defineProperty(hostile,'previewId',{get(){calls++;throw Error('PRIVATE');}});assert.throws(()=>parseRuntimeMessage(message(hostile)));assert.equal(calls,0);
});
