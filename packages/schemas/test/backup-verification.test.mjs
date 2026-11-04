import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBackupVerificationReceipt,parseRuntimeCommand,parseRuntimeMessage,MAX_BACKUP_BYTES} from '../index.ts';
const profileId='a'.repeat(32),receipt={profileId,revision:3,scope:'complete-profile-v1',envelopeSha256:'b'.repeat(64),backupSha256:'c'.repeat(64)};
const command=(operation,extra={})=>({version:1,requestId:1,generation:2,operation,...extra});
const response=(operation,value)=>({...command(operation),kind:'response',result:{ok:true,value}});
test('backup verification wire shape is exact, scalar, bounded and cannot import an authority flag',()=>{
 const bytes=new Uint8Array([1]);const parsed=parseRuntimeCommand(command('verifyBackup',{profileId,bytes,passphrase:'synthetic valid verification passphrase'}));bytes[0]=2;assert.equal(parsed.bytes[0],1);
 assert.deepEqual(parseRuntimeMessage(response('verifyBackup',receipt)).result.value,receipt);
 assert.deepEqual(parseRuntimeMessage(response('checkBackupVerification',{verification:null})).result.value,{verification:null});
 assert.deepEqual(parseRuntimeMessage(response('checkBackupVerification',{verification:receipt})).result.value,{verification:receipt});
 for(const invalid of [{...receipt,verified:true},{...receipt,scope:'all-wallets'},{...receipt,revision:-1},{...receipt,backupSha256:'x'},{...receipt,profileId:'BAD'}])assert.throws(()=>parseBackupVerificationReceipt(invalid));
 assert.throws(()=>parseRuntimeCommand(command('checkBackupVerification',{profileId,verification:receipt})));
 assert.throws(()=>parseRuntimeCommand(command('verifyBackup',{profileId,bytes:new Uint8Array(MAX_BACKUP_BYTES+1),passphrase:'synthetic valid verification passphrase'})));
 let touched=0;const hostile={...receipt};Object.defineProperty(hostile,'revision',{get(){touched++;return 3;}});assert.throws(()=>parseBackupVerificationReceipt(hostile));assert.equal(touched,0);
});
