import test from 'node:test';
import assert from 'node:assert/strict';
import {canDisplayTestedClaim,claimFor} from '../index.ts';

const claim={version:1,id:'vault-at-rest',capability:'vault',exactCopy:'Synthetic scoped claim.',preconditions:['Synthetic fixture only'],exclusions:['No release approval'],evidencePaths:['packages/storage/test/vault-crypto.test.mjs'],status:'tested-scoped',reviewedAt:'2026-11-27'};
const scope={sourceCommit:'a'.repeat(40),evidenceDigest:'b'.repeat(64),runtimeProfile:'local-v1',coverage:'matched'};
const trust={current:()=>true,verify:()=>true};

test('tested display requires both explicit freshness lists even when maintained trust matches',()=>{
  assert.equal(canDisplayTestedClaim(claim,scope,trust,[],[]),true);
  for(const args of [[],[[]],[undefined,[]],[[],undefined]]) {
    assert.equal(canDisplayTestedClaim(claim,scope,trust,...args),false);
    const shown=claimFor([claim],claim.capability,scope,trust,...args);
    assert.equal(shown.status,'proposed');
    assert.equal(shown.reviewedAt,null);
  }
});

test('claim IDs from copy-only drift refuse tested display without matching an evidence path',()=>{
  const stale=['apps/web/src/ui/locale/en.ts'];
  assert.equal(claim.evidencePaths.includes(stale[0]),false);
  assert.equal(canDisplayTestedClaim(claim,scope,trust,stale,[]),true);
  assert.equal(canDisplayTestedClaim(claim,scope,trust,stale,[claim.id]),false);
  const shown=claimFor([claim],claim.capability,scope,trust,stale,[claim.id]);
  assert.equal(shown.status,'proposed');
  assert.equal(shown.reviewedAt,null);
  assert.equal(shown.exactCopy,claim.exactCopy);
  assert.equal(claimFor([claim],claim.capability,scope,trust,stale,['other-claim']).status,'tested-scoped');
});

test('freshness arrays cannot hide stale entries behind accessors or overridden includes',()=>{
  let reads=0;
  const accessor=[];
  Object.defineProperty(accessor,'0',{get(){reads++;return claim.id;}});
  const overridden=[claim.id];
  overridden.includes=()=>{reads++;return false;};
  for(const staleClaims of [accessor,overridden]) {
    assert.equal(canDisplayTestedClaim(claim,scope,trust,[],staleClaims),false);
  }
  const paths=[claim.evidencePaths[0]];
  paths.includes=()=>{reads++;return false;};
  assert.equal(canDisplayTestedClaim(claim,scope,trust,paths,[]),false);
  assert.equal(reads,0);
});

test('malformed or oversized freshness data fails closed without reaching maintained trust',()=>{
  let trustCalls=0;
  const unusedTrust={current(){trustCalls++;return true;},verify(){trustCalls++;return true;}};
  const invalidLists=[undefined,null,false,'not-a-list',{},new Set(),Array(1),['same','same'],[7],[''],['../escape'],['a'.repeat(65)]];
  for(const value of invalidLists) {
    assert.equal(canDisplayTestedClaim(claim,scope,unusedTrust,[],value),false);
  }
  for(const value of invalidLists.slice(0,-1)) {
    assert.equal(canDisplayTestedClaim(claim,scope,unusedTrust,value,[]),false);
  }
  assert.equal(canDisplayTestedClaim(claim,scope,unusedTrust,['a'.repeat(241)],[]),false);
  assert.equal(canDisplayTestedClaim(claim,scope,unusedTrust,['a\\b'],[]),false);
  assert.equal(canDisplayTestedClaim(claim,scope,unusedTrust,[],Array.from({length:65},(_,i)=>`claim-${i}`)),false);
  assert.equal(canDisplayTestedClaim(claim,scope,unusedTrust,Array.from({length:130},(_,i)=>`path-${i}`),[]),false);
  assert.equal(trustCalls,0);
});

test('freshness limits accept complete reports and still inspect the final entry',()=>{
  const paths=Array.from({length:129},(_,i)=>`evidence/path-${i}.ts`);
  const ids=Array.from({length:64},(_,i)=>`claim-${i}`);
  assert.equal(canDisplayTestedClaim(claim,scope,trust,paths,ids),true);
  ids[63]=claim.id;
  assert.equal(canDisplayTestedClaim(claim,scope,trust,paths,ids),false);
  ids[63]='other-claim';paths[128]=claim.evidencePaths[0];
  assert.equal(canDisplayTestedClaim(claim,scope,trust,paths,ids),false);
});

test('bounded generated freshness combinations preserve unrelated claims and reject either matching signal',()=>{
  for(let seed=0;seed<256;seed++) {
    const paths=Array.from({length:seed%128},(_,i)=>`evidence/source-${i}.ts`);
    const ids=Array.from({length:seed%63},(_,i)=>`claim-${i}`);
    const stalePath=(seed&1)!==0,staleId=(seed&2)!==0;
    if(stalePath)paths.splice(seed%(paths.length+1),0,claim.evidencePaths[0]);
    if(staleId)ids.splice(seed%(ids.length+1),0,claim.id);
    const expected=!stalePath&&!staleId;
    assert.equal(canDisplayTestedClaim(claim,scope,trust,paths,ids),expected,`display seed ${seed}`);
    const shown=claimFor([claim],claim.capability,scope,trust,paths,ids);
    assert.equal(shown.status,expected?'tested-scoped':'proposed',`lookup seed ${seed}`);
    assert.equal(shown.reviewedAt,expected?claim.reviewedAt:null);
  }
});
