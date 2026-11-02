import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {queryIdentity,solverAnswer,assertionSpan,classifyProperty,validateProbe,nativeWitness,LIMITS} from '../formal/evm.mjs';
const spec=JSON.parse(await readFile(new URL('../../contracts/evm/formal/properties.json',import.meta.url)));
test('query binding uses Keccak and rejects oversized work; unknown or contaminated solver output stays unknown',()=>{
 assert.equal(queryIdentity(''),'0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
 assert.throws(()=>queryIdentity('x'.repeat(LIMITS.queryBytes+1)));
 assert.equal(solverAnswer('sat\n'),'sat');assert.equal(solverAnswer('unsat\n'),'unsat');
 for(const value of['unknown','timeout','unsat\n(error "failed")','sat\nunsat',''])assert.equal(solverAnswer(value),'unknown');
});
test('source-bound compiler assertions reject missing, duplicate, foreign, unsupported and incomplete proof claims',()=>{
 const source='// unicode é\nassert(x == x);',span=assertionSpan(source,'assert(x == x);');assert.equal(span.start,Buffer.byteLength('// unicode é\n'));assert.equal(span.end,Buffer.byteLength(source)-1);
 assert.throws(()=>assertionSpan('assert(x); assert(x);','assert(x);'));assert.throws(()=>assertionSpan(source,'assert(y);'));
 const safe={errorCode:'9576',sourceLocation:{file:'A.sol',...span},message:'CHC: Assertion violation check is safe!'};
 assert.equal(classifyProperty({errors:[safe]},'A.sol',span).result,'PROVED_UNDER_DECLARED_MODEL');
 assert.equal(classifyProperty({errors:[safe]},'B.sol',span).result,'PROOF_UNKNOWN');assert.equal(classifyProperty({errors:[safe]},'A.sol',span,true).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[safe,{message:'Inline assembly is not supported'}]},'A.sol',span).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[{...safe,errorCode:'6328'}]},'A.sol',span).result,'COUNTEREXAMPLE_FOUND');
});
test('safe and unsafe operational probes must both bind actual distinct assertion spans; raw SAT polarity is insufficient',()=>{
 const source='contract T { function f(uint x) public { assert(x == x); assert(x != 7); }}';
 const output={errors:[{errorCode:'9576',sourceLocation:{file:'ToolProbes.sol',...assertionSpan(source,'assert(x == x);')}},{errorCode:'6328',sourceLocation:{file:'ToolProbes.sol',...assertionSpan(source,'assert(x != 7);')}}]};
 const probe={incomplete:false,queries:[{answer:'sat'},{answer:'unsat'}],output};assert.equal(validateProbe(probe,source).unsafe.result,'COUNTEREXAMPLE_FOUND');
 assert.throws(()=>validateProbe({...probe,incomplete:true},source));assert.throws(()=>validateProbe({...probe,output:{errors:output.errors.map(error=>({...error,errorCode:'9576'}))}},source));assert.throws(()=>validateProbe({...probe,queries:[{answer:'unknown'},{answer:'sat'}]},source));
});
function packet(){const logs=['tradeId: 0x'+'1'.repeat(64),'principal: 10','surplus: 3','activeAfterTerminal: 0','paidAfterTerminal: 0','pendingAfterTerminal: 10','custodyAfterTerminal: 13','paidAfterWithdrawal: 10','pendingAfterWithdrawal: 0','custodyAfterWithdrawal: 3','seller: 0x'+'1'.repeat(40),'buyer: 0x'+'2'.repeat(40),'withdrawCaller: 0x'+'3'.repeat(40)];return{['formal/CanonicalRefinement.t.sol:'+spec.nativeContract]:{test_results:{[spec.nativeRefinement.test+'()']:{status:'Success',decoded_logs:logs},[spec.strictModelCounterexample.test+'()']:{status:'Failure',reason:'STRICT_TERMINAL_ALREADY_PAID: 0 != 10',decoded_logs:[...logs]}}}};}
test('native model-gap classifier requires exact actual-test identities, failure reason and complete conserved trace',()=>{
 const valid=packet(),result=nativeWitness(valid,1,spec);assert.equal(result.result,'MODEL_IMPLEMENTATION_GAP');assert.equal(result.nativeRefinement,'TEST_EVIDENCE_PASSED');assert.equal(result.trace.paidAfterWithdrawal,'10');
 assert.throws(()=>nativeWitness(valid,0,spec));assert.throws(()=>nativeWitness({},1,spec));
 for(const change of[p=>{Object.values(p)[0].test_results[spec.nativeRefinement.test+'()'].status='Failure';},p=>{Object.values(p)[0].test_results[spec.strictModelCounterexample.test+'()'].reason='compiler crashed';},p=>{for(const test of Object.values(Object.values(p)[0].test_results))test.decoded_logs[5]='pendingAfterTerminal: 9';},p=>{for(const test of Object.values(Object.values(p)[0].test_results))test.decoded_logs.pop();}]){const bad=packet();change(bad);assert.throws(()=>nativeWitness(bad,1,spec));}
});

test('guard translator rejects changed predicates, inserted side effects, unknown AST and changed enum',async()=>{
 const {guardPredicates}=await import('../formal/evm.mjs');
 const source=await readFile(new URL('../../contracts/evm/src/BasicEscrow.sol',import.meta.url),'utf8');
 const span=(text,from=0)=>{const at=source.indexOf(text,from);assert.ok(at>=0);return `${Buffer.byteLength(source.slice(0,at))}:${Buffer.byteLength(text)}:0`;};
 const member=(text,from)=>{const [name,memberName]=text.split('.');return{nodeType:'MemberAccess',expression:{nodeType:'Identifier',name},memberName,src:span(text,from)};};
 const nodes=[{nodeType:'EnumDefinition',name:'State',members:['None','Funded','Released','Refunded'].map(name=>({name}))}];
 for(const name of['release','refund']){const from=source.indexOf('function '+name+'(');const predicates=name==='release'?['escrow.state != State.Funded','msg.sender != escrow.seller','block.timestamp >= escrow.deadline']:['escrow.state != State.Funded','block.timestamp < escrow.deadline'];
 const body=[{nodeType:'VariableDeclarationStatement',src:span('Escrow storage escrow = _escrows[tradeId]',from)}];
 for(const text of predicates){const [left,operator,right]=text.split(' ');const errors={'escrow.state != State.Funded':'InvalidState(tradeId, escrow.state)','msg.sender != escrow.seller':'Unauthorized(msg.sender)','block.timestamp >= escrow.deadline':'DeadlinePassed(escrow.deadline)','block.timestamp < escrow.deadline':'DeadlineNotReached(escrow.deadline)'};body.push({nodeType:'IfStatement',src:span(`if (${text}) revert ${errors[text]}`,from),trueBody:{nodeType:'RevertStatement'},condition:{nodeType:'BinaryOperation',operator,leftExpression:member(left,from),rightExpression:member(right,from),src:span(text,from)}});}
 body.push({nodeType:'ExpressionStatement',expression:{nodeType:'Assignment'},src:span(`escrow.state = State.${name==='release'?'Released':'Refunded'}`,from)},{},{},{});nodes.push({nodeType:'FunctionDefinition',name,body:{statements:body}});}
 const ast={nodes:[{nodeType:'ContractDefinition',name:'BasicEscrow',nodes}]};assert.equal(guardPredicates(ast,source).bindings.length,5);
 const reject=change=>{const bad=structuredClone(ast);change(bad.nodes[0].nodes);assert.throws(()=>guardPredicates(bad,source));};
 reject(nodes=>{nodes[0].members.reverse();});reject(nodes=>{nodes[1].body.statements.splice(1,0,{nodeType:'ExpressionStatement'});});reject(nodes=>{nodes[1].body.statements[1].condition.leftExpression.nodeType='FunctionCall';});reject(nodes=>{nodes[1].body.statements[1].condition.operator='==';});reject(nodes=>{nodes[1].body.statements[1].trueBody.nodeType='Block';});reject(nodes=>{nodes[1].body.statements[1].falseBody={nodeType:'ExpressionStatement'};});
 assert.throws(()=>guardPredicates(ast,source.replace('msg.sender != escrow.seller','msg.sender == escrow.seller')));
});

test('owned process groups drain on success, timeout and output overflow including closed-pipe descendants', {timeout:12000}, async()=>{
 const {processBounded}=await import('../formal/evm.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'formal-process-'));const pids=[];
 const dead=async pid=>{try{const stat=await readFile(`/proc/${pid}/stat`,'utf8');return stat.slice(stat.lastIndexOf(')')+2).startsWith('Z');}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return true;throw error;}};
 try{for(const mode of['success','timeout','overflow']){
  const file=join(directory,mode);
  // Pass data as arguments; the child program stays a literal independent of paths.
  const script=`const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'ignore'});child.unref();fs.writeFileSync(process.argv[1],String(child.pid));const mode=process.argv[2];if(mode==='timeout')setTimeout(()=>{},5000);else if(mode==='overflow'){process.stdout.write('x'.repeat(8192));setTimeout(()=>{},5000);}else{process.stdout.write('done');process.stderr.write('separate');}`;
  const result=await processBounded(process.execPath,['-e',script,file,mode],{timeoutMs:mode==='timeout'?300:2000,maxOutput:mode==='overflow'?1024:8192});const pid=Number(await readFile(file,'utf8'));pids.push(pid);
  for(let i=0;i<40&&!await dead(pid);i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(await dead(pid),true,mode+' left descendant alive');
  if(mode==='success'){assert.equal(result.code,0);assert.equal(result.stdout,'done');assert.equal(result.stderr,'separate');}if(mode==='timeout')assert.equal(result.timedOut,true);if(mode==='overflow')assert.equal(result.limited,true);
 }}finally{for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
test('trusted tool roots are explicit and preserve existing Foundry compiler resolution and pin checks',async()=>{
 const {resolveTools}=await import('../formal/evm.mjs');assert.throws(()=>resolveTools({}));
 const tools=resolveTools({FORMAL_Z3_ROOT:'/tmp/public-z3',FORMAL_Z3_ARTIFACT:'/tmp/public.whl',FORMAL_FOUNDRY_ROOT:'/tmp/foundry',FOUNDRY_SOLC:'/tmp/compiler',PATH:'/usr/bin',HOME:'/tmp/local-home'});
 assert.equal(tools.z3,'/tmp/public-z3/bin/z3');assert.equal(tools.artifact,'/tmp/public.whl');assert.equal(tools.forge,'/tmp/foundry/forge');assert.equal(tools.solc,'/tmp/compiler');assert.equal(tools.env.PATH,'/tmp/foundry:/usr/bin');
 assert.equal(resolveTools({FORMAL_Z3_ROOT:'/tmp/z3',FORMAL_Z3_ARTIFACT:'/tmp/z3.whl',HOME:'/tmp/local-home'}).solc,'/tmp/local-home/.svm/0.8.30/solc-0.8.30');
});

test('the finite partition list binds exact original checks, helpers, actors, assumptions and assertions',async()=>{
 const {PARTITION_TARGETS,partitionBinding}=await import('../formal/evm.mjs');
 assert.equal(typeof partitionBinding,'function');
 assert.deepEqual(PARTITION_TARGETS.map(target=>target.contract),['NativeConstructor','UnauthorizedRelease','EarlyRefund']);
 const original=await readFile(new URL('../../contracts/evm/formal/CanonicalRefinement.t.sol',import.meta.url),'utf8');
 for(const target of PARTITION_TARGETS){
  const source=await readFile(new URL('../../contracts/evm/'+target.source,import.meta.url),'utf8');
  const bound=partitionBinding(target.id,source,original,spec);
  assert.equal(bound.property.id,target.id);assert.equal(bound.fragments.length,target.contract==='NativeConstructor'?1:3);
  assert.equal(source.match(/\bassert\s*\(/g).length,1);
  for(const fragment of bound.fragments)assert.equal(Buffer.from(source).subarray(fragment.partition.start,fragment.partition.end).toString(),Buffer.from(original).subarray(fragment.original.start,fragment.original.end).toString());
  const changed=source.replace('new address[](0)','new address[](1)');
  assert.throws(()=>partitionBinding(target.id,changed,original,spec));
  assert.throws(()=>partitionBinding(target.id,source+'\ncontract Extra {}\n',original,spec));
  if(target.contract!=='NativeConstructor')assert.throws(()=>partitionBinding(target.id,source.replace('msg.value > 0','msg.value > 1'),original,spec));
  assert.throws(()=>partitionBinding(target.id,source,original.replace('block.timestamp + 1800','block.timestamp + 1801'),spec));
 }
 assert.throws(()=>partitionBinding('ARBITRARY',original,original,spec));
 assert.deepEqual([LIMITS.compilerMs,LIMITS.queryMs,LIMITS.totalMs,LIMITS.queries,LIMITS.rounds],[25000,5000,120000,64,8]);
});

test('partition results require nonzero complete clean work and exact compiler diagnostics, never raw polarity',async()=>{
 const {classifyPartition}=await import('../formal/evm.mjs');assert.equal(typeof classifyPartition,'function');
 const {createHash}=await import('node:crypto');const empty=createHash('sha256').update('').digest('hex');
 const file='formal/partitions/NativeConstructor.sol',span={start:10,end:25};
 const safe={errorCode:'9576',severity:'info',sourceLocation:{file,...span},message:'CHC: Assertion violation check is safe!'};
 const complete={incomplete:false,stopReason:null,queries:[{answer:'sat',exitCode:0,timedOut:false,limited:false,stderrSha256:empty}],compilerRuns:[{exitCode:0,error:null,timedOut:false,limited:false,stderrSha256:empty}],output:{errors:[safe]}};
 assert.equal(classifyPartition(complete,file,span).result,'PROVED_UNDER_DECLARED_MODEL');
 assert.equal(classifyPartition({...complete,queries:[{...complete.queries[0],answer:'unsat'}]},file,span).result,'PROVED_UNDER_DECLARED_MODEL');
 for(const change of [p=>{p.queries=[];},p=>{p.incomplete=true;},p=>{p.stopReason='TOTAL_DEADLINE';},p=>{p.compilerRuns=[];},p=>{p.compilerRuns[0].timedOut=true;},p=>{p.compilerRuns[0].stderrSha256='nonempty';},p=>{p.queries[0].stderrSha256='nonempty';},p=>{p.queries[0].answer='unknown';},p=>{p.output.errors.push({message:'Inline assembly abstraction is not supported'});},p=>{p.output.errors=[];},p=>{p.output.errors[0].sourceLocation.file='foreign.sol';}]){
  const bad=structuredClone(complete);change(bad);assert.equal(classifyPartition(bad,file,span).result,'PROOF_UNKNOWN');
 }
 const violation=structuredClone(complete);violation.output.errors[0].errorCode='6328';assert.equal(classifyPartition(violation,file,span).result,'COUNTEREXAMPLE_FOUND');
 violation.incomplete=true;assert.equal(classifyPartition(violation,file,span).result,'PROOF_UNKNOWN');
});
