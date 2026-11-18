import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,rmdir,symlink,chmod,access} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {queryIdentity,solverAnswer,assertionSpan,classifyProperty,validateProbe,nativeWitness,LIMITS} from '../formal/evm.mjs';
import * as formal from '../formal/evm.mjs';
const spec=JSON.parse(await readFile(new URL('../../contracts/evm/formal/properties.json',import.meta.url)));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex'),EMPTY=sha256('');
const ROOT=realpathSync(new URL('../../',import.meta.url));
// Verbatim solc 0.8.30 diagnostics from the recorded 2026-11-18 partition run (report.json, formal.targets[].diagnostics and
// probes-round{0,1}-stdout.json), one per error code; only the derived formattedMessage field is omitted.
const RECORDED=Object.freeze({
 nativeFile:'formal/partitions/NativeConstructor.sol',nativeSpan:{start:339,end:381},
 releaseFile:'formal/partitions/UnauthorizedRelease.sol',releaseSpan:{start:1888,end:2058},
 abstractions:[
  {component:'general',errorCode:'8364',message:'Assertion checker does not yet implement type error',severity:'warning',sourceLocation:{end:4396,file:'lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol',start:4318},type:'Warning'},
  {component:'general',errorCode:'7650',message:'Assertion checker does not yet support this expression.',severity:'warning',sourceLocation:{end:5932,file:'lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol',start:5925},type:'Warning'},
  {component:'general',errorCode:'7737',message:'Inline assembly may cause SMTChecker to produce spurious warnings (false positives).',severity:'warning',sourceLocation:{end:8928,file:'lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol',start:8507},type:'Warning'},
  {component:'general',errorCode:'3996',message:'CHC analysis was not possible. No Horn solver was available. None of the installed solvers was enabled.',severity:'warning',type:'Warning'},
 ],
 nativeSafe:{component:'general',errorCode:'9576',message:'CHC: Assertion violation check is safe!',severity:'info',sourceLocation:{end:381,file:'formal/partitions/NativeConstructor.sol',start:339},type:'Info'},
 releaseMightHappen:{component:'general',errorCode:'6328',message:'CHC: Assertion violation might happen here.',severity:'warning',sourceLocation:{end:2058,file:'formal/partitions/UnauthorizedRelease.sol',start:1888},type:'Warning'},
 probeRound0:[
  {component:'general',errorCode:'6328',message:'CHC: Assertion violation might happen here.',severity:'warning',sourceLocation:{end:135,file:'ToolProbes.sol',start:121},type:'Warning'},
  {component:'general',errorCode:'6328',message:'CHC: Assertion violation might happen here.',severity:'warning',sourceLocation:{end:191,file:'ToolProbes.sol',start:177},type:'Warning'},
  {component:'general',errorCode:'3996',message:'CHC analysis was not possible. No Horn solver was available. None of the installed solvers was enabled.',severity:'warning',type:'Warning'},
 ],
 probeRound1:[
  {component:'general',errorCode:'6328',message:'CHC: Assertion violation happens here.',severity:'warning',sourceLocation:{end:191,file:'ToolProbes.sol',start:177},type:'Warning'},
  {component:'general',errorCode:'9576',message:'CHC: Assertion violation check is safe!',severity:'info',sourceLocation:{end:135,file:'ToolProbes.sol',start:121},type:'Info'},
 ],
});
/** The shape bridge() returns for clean complete work, around the given compiler diagnostics. */
const cleanWork=(errors,answers=['sat'])=>({incomplete:false,stopReason:null,output:{errors:structuredClone(errors)},queries:answers.map(answer=>({answer,exitCode:0,timedOut:false,limited:false,stderrSha256:EMPTY})),compilerRuns:[0,1].map(()=>({exitCode:0,error:null,timedOut:false,limited:false,stderrSha256:EMPTY}))});
test('query binding uses Keccak and rejects oversized work; unknown or contaminated solver output stays unknown',()=>{
 assert.equal(queryIdentity(''),'0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
 assert.throws(()=>queryIdentity('x'.repeat(LIMITS.queryBytes+1)));
 assert.equal(solverAnswer('sat\n'),'sat');assert.equal(solverAnswer('unsat\n'),'unsat');
 for(const value of['unknown','timeout','unsat\n(error "failed")','sat\nunsat',''])assert.equal(solverAnswer(value),'unknown');
});
test('source-bound compiler assertions reject missing, duplicate, foreign, unsupported and incomplete proof claims',()=>{
 const source='// unicode é\nassert(x == x);',span=assertionSpan(source,'assert(x == x);');assert.equal(span.start,Buffer.byteLength('// unicode é\n'));assert.equal(span.end,Buffer.byteLength(source)-1);
 assert.throws(()=>assertionSpan('assert(x); assert(x);','assert(x);'));assert.throws(()=>assertionSpan(source,'assert(y);'));
 assert.throws(()=>assertionSpan(source,'require(x == x);'),{message:'PROPERTY_INVALID'});
 const safe={errorCode:'9576',severity:'info',sourceLocation:{file:'A.sol',...span},message:'CHC: Assertion violation check is safe!'};
 const happens={errorCode:'6328',severity:'warning',sourceLocation:{file:'A.sol',...span},message:'CHC: Assertion violation happens here.'};
 assert.equal(classifyProperty({errors:[safe]},'A.sol',span).result,'PROVED_UNDER_DECLARED_MODEL');
 assert.equal(classifyProperty({errors:[safe]},'B.sol',span).result,'PROOF_UNKNOWN');assert.equal(classifyProperty({errors:[safe]},'A.sol',span,true).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[safe]},'A.sol',{...span,end:span.end+1}).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[happens]},'A.sol',span).result,'COUNTEREXAMPLE_FOUND');
 assert.equal(classifyProperty({errors:[happens]},'A.sol',span,true).result,'PROOF_UNKNOWN');
 // A code alone decides nothing: 6328 is a counterexample only with solc's answered "happens here" wording.
 for(const message of['CHC: Assertion violation check is safe!','',undefined])assert.deepEqual(classifyProperty({errors:[{...happens,message}]},'A.sol',span).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[{...safe,message:'CHC: Assertion violation happens here.'}]},'A.sol',span).toolReported,'UNRECOGNIZED');
 // solc tags every unanswered CHC target 6328 "might happen"; it is unanswered, not a violation, even when the bridge looks complete.
 const partial={...happens,message:'CHC: Assertion violation might happen here.'};
 for(const incomplete of[true,false]){const result=classifyProperty({errors:[partial]},'A.sol',span,incomplete);assert.equal(result.result,'PROOF_UNKNOWN');assert.equal(result.toolReported,'UNANSWERED');}
 // Contradictory or duplicated target diagnostics at one span decide nothing.
 assert.deepEqual(classifyProperty({errors:[happens,safe]},'A.sol',span).toolReported,'CONTRADICTORY');assert.equal(classifyProperty({errors:[happens,safe]},'A.sol',span).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[safe,{...safe}]},'A.sol',span).result,'PROOF_UNKNOWN');
 assert.equal(classifyProperty({errors:[{...safe,severity:'error'}]},'A.sol',span).result,'PROOF_UNKNOWN');
});
test('verbatim solc 0.8.30 abstraction diagnostics next to a safe or violated target always leave the property PROOF_UNKNOWN',()=>{
 const {nativeFile:file,nativeSpan:span,nativeSafe:safe}=RECORDED;
 // Positive control: the recorded safe diagnostic alone, on complete clean work, is a proof claim.
 assert.equal(classifyProperty({errors:[safe]},file,span).result,'PROVED_UNDER_DECLARED_MODEL');assert.equal(formal.classifyPartition(cleanWork([safe]),file,span).result,'PROVED_UNDER_DECLARED_MODEL');
 const violated={...safe,errorCode:'6328',severity:'warning',type:'Warning',message:'CHC: Assertion violation happens here.'};
 assert.equal(formal.classifyPartition(cleanWork([violated]),file,span).result,'COUNTEREXAMPLE_FOUND');
 for(const abstraction of RECORDED.abstractions)for(const target of[safe,violated]){
  const property=classifyProperty({errors:[target,abstraction]},file,span),partition=formal.classifyPartition(cleanWork([target,abstraction]),file,span);
  assert.equal(property.result,'PROOF_UNKNOWN',abstraction.errorCode);assert.equal(partition.result,'PROOF_UNKNOWN',abstraction.errorCode);
  assert.deepEqual(property.unsupported,[abstraction]);assert.equal(property.toolReported,target===safe?'SAFE_UNDER_COMPILER_MODEL':'ASSERTION_VIOLATION');
  // Blocking is by code first: the same code with neutral wording still blocks, and so does an unknown code.
  assert.equal(classifyProperty({errors:[target,{...abstraction,message:'neutral'}]},file,span).result,'PROOF_UNKNOWN',abstraction.errorCode);
 }
 for(const other of[{errorCode:'5084',severity:'warning',message:'Type conversion is not yet fully supported and might yield false positives.'},{errorCode:'1234',severity:'warning',message:'neutral'},{severity:'info',message:'neutral'}])
  assert.equal(formal.classifyPartition(cleanWork([safe,other]),file,span).result,'PROOF_UNKNOWN',other.errorCode);
 // The whole recorded final diagnostic set of the native partition, as the replay of its report gives it.
 const recorded=formal.classifyPartition(cleanWork([...RECORDED.abstractions.slice(0,3),safe]),file,span);
 assert.equal(recorded.result,'PROOF_UNKNOWN');assert.equal(recorded.toolReported,'SAFE_UNDER_COMPILER_MODEL');assert.deepEqual(recorded.unsupported.map(error=>error.errorCode),['8364','7650','7737']);
 // The recorded funded-partition set: unanswered 6328 plus 3996, even on work that claims to be complete, or with zero queries.
 const funded=[...RECORDED.abstractions,RECORDED.releaseMightHappen];
 for(const work of[cleanWork(funded),{...cleanWork(funded),queries:[]}]){const result=formal.classifyPartition(work,RECORDED.releaseFile,RECORDED.releaseSpan);assert.equal(result.result,'PROOF_UNKNOWN');assert.equal(result.toolReported,'UNANSWERED');}
 assert.equal(classifyProperty({errors:[RECORDED.releaseMightHappen,RECORDED.abstractions[3]]},RECORDED.releaseFile,RECORDED.releaseSpan).result,'PROOF_UNKNOWN');
 // No code is allowlisted as benign.
 assert.deepEqual(formal.BENIGN_DIAGNOSTIC_CODES,[]);
});
test('whole-target classification ignores only recognized sibling targets and applies the clean-work gate to every property',()=>{
 const source='contract T { function f(uint x) public pure { assert(x == x); assert(x >= 0); } }',assertions=['assert(x == x);','assert(x >= 0);'];
 const [first,second]=assertions.map(assertion=>assertionSpan(source,assertion)),at=(span,errorCode,message)=>({errorCode,severity:errorCode==='9576'?'info':'warning',sourceLocation:{file:'T.sol',...span},message});
 const safeBoth=[at(first,'9576','CHC: Assertion violation check is safe!'),at(second,'9576','CHC: Assertion violation check is safe!')];
 assert.deepEqual(formal.classifyWholeTarget(cleanWork(safeBoth),'T.sol',source,assertions).map(result=>result.result),['PROVED_UNDER_DECLARED_MODEL','PROVED_UNDER_DECLARED_MODEL']);
 const violated=[safeBoth[0],at(second,'6328','CHC: Assertion violation happens here.')];
 assert.deepEqual(formal.classifyWholeTarget(cleanWork(violated),'T.sol',source,assertions).map(result=>result.result),['PROVED_UNDER_DECLARED_MODEL','COUNTEREXAMPLE_FOUND']);
 for(const extra of[at({start:0,end:5},'9576','CHC: Assertion violation check is safe!'),at(second,'6328','CHC: Assertion violation might happen here.'),RECORDED.abstractions[0]])
  assert.deepEqual(formal.classifyWholeTarget(cleanWork([...safeBoth,extra]),'T.sol',source,assertions).map(result=>result.result),['PROOF_UNKNOWN','PROOF_UNKNOWN']);
 // Without siblings declared, the other target's diagnostic is unexpected and blocks.
 assert.equal(formal.classifyPartition(cleanWork(safeBoth),'T.sol',first).result,'PROOF_UNKNOWN');
 // The recorded zero-query whole-target shape: unanswered 6328 plus 3996 never becomes a counterexample.
 for(const work of[{...cleanWork([at(first,'6328','CHC: Assertion violation might happen here.'),RECORDED.abstractions[3]]),queries:[]},{...cleanWork(safeBoth),queries:[]},{...cleanWork(safeBoth),stopReason:'COMPILER_TIMEOUT'}])
  assert.deepEqual(formal.classifyWholeTarget(work,'T.sol',source,assertions).map(result=>result.result),['PROOF_UNKNOWN','PROOF_UNKNOWN']);
});
test('safe and unsafe operational probes must both bind actual distinct assertion spans; raw SAT polarity is insufficient',()=>{
 const source=formal.PROBE_SOURCE,probe=cleanWork(RECORDED.probeRound1,['sat','unsat']);
 const valid=validateProbe(probe,source);assert.equal(valid.safe.result,'PROVED_UNDER_DECLARED_MODEL');assert.equal(valid.unsafe.result,'COUNTEREXAMPLE_FOUND');
 const reject=change=>{const bad=structuredClone(probe);change(bad);assert.throws(()=>validateProbe(bad,source));};
 reject(p=>{p.incomplete=true;});reject(p=>{p.stopReason='SOLVER_UNKNOWN';});reject(p=>{p.queries[0].answer='unknown';});reject(p=>{p.queries.pop();});
 reject(p=>{for(const error of p.output.errors)error.errorCode='9576';});reject(p=>{p.output.errors=structuredClone(RECORDED.probeRound0);});
 reject(p=>{p.output.errors.push(structuredClone(RECORDED.abstractions[2]));});reject(p=>{p.compilerRuns[1].stderrSha256='nonempty';});
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
test('trusted tool roots are explicit and preserve existing Foundry compiler resolution',async()=>{
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
 for(const change of [p=>{p.queries=[];},p=>{p.incomplete=true;},p=>{p.stopReason='TOTAL_DEADLINE';},p=>{p.compilerRuns=[];},p=>{p.compilerRuns[0].timedOut=true;},p=>{p.compilerRuns[0].limited=true;},p=>{p.compilerRuns[0].exitCode=1;},p=>{p.compilerRuns[0].error='SPAWN_FAILED';},p=>{p.compilerRuns[0].stderrSha256='nonempty';},p=>{p.queries[0].stderrSha256='nonempty';},p=>{p.queries[0].answer='unknown';},p=>{p.queries[0].exitCode=1;},p=>{p.queries[0].timedOut=true;},p=>{p.queries[0].limited=true;},p=>{p.output.errors.push(structuredClone(RECORDED.abstractions[2]));},p=>{p.output.errors=[];},p=>{p.output.errors[0].sourceLocation.file='foreign.sol';},p=>{p.output.errors[0].sourceLocation.end+=1;}]){
  const bad=structuredClone(complete);change(bad);assert.equal(classifyPartition(bad,file,span).result,'PROOF_UNKNOWN');
 }
 const violation=structuredClone(complete);violation.output.errors[0].errorCode='6328';violation.output.errors[0].message='CHC: Assertion violation happens here.';assert.equal(classifyPartition(violation,file,span).result,'COUNTEREXAMPLE_FOUND');
 violation.incomplete=true;assert.equal(classifyPartition(violation,file,span).result,'PROOF_UNKNOWN');
});

test('literal imports retain direct, named, wildcard, multiline and mapped source order',()=>{
 const source=`import "./direct.sol";\nimport './single.sol';\nimport { A as B,\n C } from "forge-std/Test.sol";\nimport * as Token from '@openzeppelin/contracts/token/ERC20/IERC20.sol'\t;\nimport\r\n{ D }\r\nfrom\t"../relative.sol";`;
 assert.deepEqual(formal.literalImports(source),['./direct.sol','./single.sol','forge-std/Test.sol','@openzeppelin/contracts/token/ERC20/IERC20.sol','../relative.sol']);
 assert.deepEqual(formal.literalImports('import\u00a0"./nonbreaking.sol"; import {X}\u2028from\ufeff"./unicode-space.sol";'),['./nonbreaking.sol','./unicode-space.sol']);
});

test('literal import delimiters neither hide later matches nor split quoted semicolons',()=>{
 const cases=[
  ['import"./missing-space.sol"; IMPORT "./upper.sol";',[]],
  ['import ""; import {X}; import "./unfinished.sol"',[]],
  ['import {X}; import "./next.sol";', ['./next.sol']],
  ['import orphan import "./next.sol";', ['./next.sol']],
  ['import orphan import {X} from "./next.sol";', ['./next.sol']],
  ['import "./semi;colon.sol"; import "./last.sol";', ['./semi;colon.sol','./last.sol']],
  ['import "./unsupported.sol" as Alias; import {X} from "./valid.sol";', ['./valid.sol']],
  ['import {X} from "./missing-terminator.sol"\nimport "./valid.sol";', ['./valid.sol']],
  ['import  from "./existing-whitespace-form.sol";', ['./existing-whitespace-form.sol']],
 ];
 for(const [source,expected]of cases)assert.deepEqual(formal.literalImports(source),expected);
});

test('literal extraction stays inside the existing UTF-8 source byte bound',()=>{
 const source='é'.repeat(524288);
 assert.equal(Buffer.byteLength(source),1048576);
 assert.deepEqual(formal.literalImports(source),[]);
 assert.throws(()=>formal.literalImports(source+'a'),{message:'SOURCE_LIMIT'});
});

test('import extraction leaves exact UTF-8 source bytes and assertion diagnostic spans unchanged',()=>{
 const prefix='// π🧪\r\nimport {X} from "./X.sol";\r\ncontract T { function f() external pure { ',assertion='assert(true);',source=prefix+assertion+' } }\n',bytes=Buffer.from(source);
 const span=assertionSpan(source,assertion);
 assert.deepEqual(formal.literalImports(source),['./X.sol']);
 assert.deepEqual(Buffer.from(source),bytes);
 assert.deepEqual(span,{start:Buffer.byteLength(prefix),end:Buffer.byteLength(prefix+'assert(true)')});
 assert.deepEqual(assertionSpan(source,assertion),span);
 const diagnostic={errorCode:'9576',sourceLocation:{file:'Fixture.sol',...span},message:'CHC: Assertion violation check is safe!'};
 assert.equal(classifyProperty({errors:[diagnostic]},'Fixture.sol',span).result,'PROVED_UNDER_DECLARED_MODEL');
 assert.equal(classifyProperty({errors:[diagnostic]},'Foreign.sol',span).result,'PROOF_UNKNOWN');
});

test('actual canonical and model import literals retain their pinned dependency inputs without tools',async()=>{
 const canonical=await readFile(new URL('../../contracts/evm/src/BasicEscrow.sol',import.meta.url),'utf8');
 const model=await readFile(new URL('../../contracts/evm/formal/CanonicalRefinement.t.sol',import.meta.url),'utf8');
 assert.deepEqual(formal.literalImports(canonical),['@openzeppelin/contracts/token/ERC20/IERC20.sol','@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol','@openzeppelin/contracts/utils/ReentrancyGuard.sol']);
 assert.deepEqual(formal.literalImports(model),['../src/BasicEscrow.sol','../test/mocks/Mocks.sol','forge-std/Test.sol']);
});
test('the CLI evidence directory must resolve inside the checkout, so arguments cannot direct writes elsewhere',()=>{
 const root=new URL('../../',import.meta.url).pathname.replace(/\/$/,'');
 assert.equal(formal.evidenceDirectory(undefined,'.formal-evidence'),root+'/.formal-evidence');
 assert.equal(formal.evidenceDirectory(root+'/.formal-evidence/run-1'),root+'/.formal-evidence/run-1');
 for(const outside of['/tmp/formal-evidence',root,root+'-sibling/evidence',root+'/../outside','/'])
  assert.throws(()=>formal.evidenceDirectory(outside),/FORMAL_OUTPUT_OUTSIDE_REPOSITORY/,outside);
});
const fakeTool=async(directory,name,plan,body)=>{const path=join(directory,name);await writeFile(path,`#!${process.execPath}\nconst plan=${JSON.stringify(plan)};\n${body}\n`);await chmod(path,0o755);return path;};
// Fake solc: answers round n (n = number of responses supplied) from the plan; it never reads the environment or the network.
const FAKE_SOLC=`let input='';process.stdin.on('data',chunk=>input+=chunk).on('end',()=>{const responses=JSON.parse(input).auxiliaryInput?.smtlib2responses??{};const step=plan.rounds[Math.min(Object.keys(responses).length,plan.rounds.length-1)];
 setTimeout(()=>{if(step.raw!==undefined)process.stdout.write(step.raw);else process.stdout.write(JSON.stringify({errors:step.errors,...(step.queries?{auxiliaryInputRequested:{smtlib2queries:step.queries}}:{})}));if(step.stderr)process.stderr.write(step.stderr);process.exitCode=step.exit??0;},step.sleepMs??0);});`;
const FAKE_Z3=`if(process.argv[2]==='--version'){process.stdout.write(plan.version+'\\n');}else{let input='';process.stdin.on('data',chunk=>input+=chunk).on('end',()=>setTimeout(()=>{process.stdout.write(plan.stdout??'');if(plan.stderr)process.stderr.write(plan.stderr);process.exitCode=plan.exit??0;},plan.sleepMs??0));}`;
test('bridge incompleteness bookkeeping ends PROOF_UNKNOWN through the whole-target classification, with fake solc and z3',{timeout:60000},async()=>{
 const source='contract T { function f(uint x) public pure { assert(x == x); assert(x >= 0); } }',assertions=['assert(x == x);','assert(x >= 0);'];
 const spans=assertions.map(assertion=>assertionSpan(source,assertion)),at=(span,errorCode,message)=>({errorCode,severity:errorCode==='9576'?'info':'warning',sourceLocation:{file:'T.sol',...span},message});
 const SAFE=spans.map(span=>at(span,'9576','CHC: Assertion violation check is safe!')),MIGHT=[...spans.map(span=>at(span,'6328','CHC: Assertion violation might happen here.')),RECORDED.abstractions[3]];
 const query=index=>`(set-logic HORN)\n; fake query ${index}\n(check-sat)\n`,key=index=>queryIdentity(query(index)),request=index=>({[key(index)]:query(index)});
 // Failure scenarios report "safe" at both spans in every compiler round, so only the bookkeeping can make them unknown.
 const safeRounds=(second={})=>[{errors:SAFE,queries:request(0)},{errors:SAFE,...second}];
 const scenarios=[
  {name:'clean control',rounds:[{errors:MIGHT,queries:request(0)},{errors:SAFE}],z3:{stdout:'sat\n'},expect:{stopReason:null,results:['PROVED_UNDER_DECLARED_MODEL','PROVED_UNDER_DECLARED_MODEL']}},
  {name:'recorded abstraction on clean work',rounds:[{errors:MIGHT,queries:request(0)},{errors:[...SAFE,RECORDED.abstractions[0]]}],z3:{stdout:'sat\n'},expect:{stopReason:null}},
  {name:'z3 unknown',rounds:safeRounds(),z3:{stdout:'unknown\n'},expect:{stopReason:'SOLVER_UNKNOWN',answer:'unknown'}},
  {name:'z3 timeout',rounds:safeRounds(),z3:{stdout:'sat\n',sleepMs:20000},deadlineMs:1500,expect:{stopReason:'SOLVER_UNKNOWN',answer:'unknown',timedOut:true}},
  {name:'z3 stderr',rounds:safeRounds(),z3:{stdout:'sat\n',stderr:'WARNING: resource limit\n'},expect:{stopReason:'SOLVER_UNKNOWN',answer:'unknown'}},
  {name:'z3 non-zero exit',rounds:safeRounds(),z3:{stdout:'sat\n',exit:1},expect:{stopReason:'SOLVER_UNKNOWN',answer:'unknown'}},
  {name:'compiler stderr',rounds:safeRounds({stderr:'Warning: unexpected\n'}),z3:{stdout:'sat\n'},expect:{stopReason:'COMPILER_STDERR'}},
  {name:'compiler timeout',rounds:safeRounds({sleepMs:20000}),z3:{stdout:'sat\n'},deadlineMs:1500,expect:{stopReason:'COMPILER_TIMEOUT'}},
  {name:'compiler non-zero exit',rounds:safeRounds({exit:2}),z3:{stdout:'sat\n'},expect:{stopReason:'COMPILER_FAILURE'}},
  {name:'compiler invalid output',rounds:safeRounds({raw:'{not json'}),z3:{stdout:'sat\n'},expect:{stopReason:'COMPILER_OUTPUT_INVALID'}},
  {name:'compiler error diagnostic',rounds:safeRounds({errors:[...SAFE,{errorCode:'2314',severity:'error',message:'Expected token'}]}),z3:{stdout:'sat\n'},expect:{stopReason:'COMPILER_ERROR'}},
  {name:'query-key mismatch',rounds:[{errors:SAFE,queries:{[key(1)]:query(0)}},{errors:SAFE}],z3:{stdout:'sat\n'},expect:{stopReason:'QUERY_KEY_MISMATCH',queries:0}},
  {name:'duplicate key',rounds:safeRounds({queries:request(0)}),z3:{stdout:'sat\n'},expect:{stopReason:'QUERY_REPEATED',queries:1}},
  {name:'round exhaustion',rounds:Array.from({length:LIMITS.rounds+1},(_,index)=>({errors:SAFE,queries:request(index)})),z3:{stdout:'sat\n'},expect:{stopReason:'ROUND_EXHAUSTED',queries:LIMITS.rounds}},
  {name:'shared round budget',rounds:safeRounds(),z3:{stdout:'sat\n'},budget:{queries:0,bytes:0,rounds:LIMITS.rounds},expect:{stopReason:'ROUND_LIMIT',queries:0}},
 ];
 const directory=await mkdtemp(join(tmpdir(),'formal-bridge-'));
 try{for(const[index,scenario]of scenarios.entries()){
  const work=join(directory,String(index));await mkdir(work);
  const tools={solc:await fakeTool(work,'solc',{rounds:scenario.rounds},FAKE_SOLC),z3:await fakeTool(work,'z3',scenario.z3,FAKE_Z3)};
  const out=await formal.bridge({language:'Solidity',sources:{'T.sol':{content:source}},settings:{}},{outputDirectory:work,deadline:performance.now()+(scenario.deadlineMs??30000),sourceLabel:'fake',tools,...(scenario.budget?{budget:scenario.budget}:{})});
  const results=formal.classifyWholeTarget(out,'T.sol',source,assertions).map(result=>result.result);
  assert.equal(out.stopReason,scenario.expect.stopReason,scenario.name);assert.equal(out.incomplete,scenario.expect.stopReason!==null,scenario.name);
  assert.deepEqual(results,scenario.expect.results??['PROOF_UNKNOWN','PROOF_UNKNOWN'],scenario.name);
  if(scenario.expect.answer)assert.equal(out.queries[0].answer,scenario.expect.answer,scenario.name);
  if(scenario.expect.timedOut)assert.equal(out.queries[0].timedOut,true,scenario.name);
  if(scenario.expect.queries!==undefined)assert.equal(out.queries.length,scenario.expect.queries,scenario.name);
 }}finally{await rm(directory,{recursive:true,force:true});}
});
test('Z3 pinning fails closed on a wrong digest, a missing file, a wrong version or license, and drift between checks',{timeout:20000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'formal-pins-'));
 try{
  const z3Root=join(directory,'z3root'),pin={...formal.Z3_PIN};await mkdir(join(z3Root,'bin'),{recursive:true});await mkdir(join(z3Root,'z3/lib'),{recursive:true});await mkdir(join(z3Root,'z3_solver-4.12.2.0.dist-info'),{recursive:true});
  const files={artifact:join(directory,'pinned.whl'),library:join(z3Root,pin.libraryPath),metadata:join(z3Root,pin.metadataPath),solc:join(directory,'solc')};
  await writeFile(files.artifact,'wheel bytes');await writeFile(files.library,'library bytes');await writeFile(files.metadata,'Name: z3-solver\nLicense: MIT License\n');await writeFile(files.solc,'compiler bytes');
  const binary=await fakeTool(join(z3Root,'bin'),'z3',{version:pin.reportedVersion},FAKE_Z3);
  const tools={artifact:files.artifact,z3:binary,z3Root,solc:files.solc};
  const hashOf=async path=>sha256(await readFile(path));
  Object.assign(pin,{artifactSha256:await hashOf(files.artifact),binarySha256:await hashOf(binary),librarySha256:await hashOf(files.library),metadataSha256:await hashOf(files.metadata)});
  const before=await formal.verifyTools(tools,pin);assert.equal(before.reportedVersion,pin.reportedVersion);assert.equal(before.hashes.library,pin.librarySha256);
  const solcSha256=await hashOf(files.solc);assert.equal((await formal.recheckTools(tools,before,{pin,solcSha256})).solcSha256,solcSha256);
  // Production defaults: the real pins never match these files.
  await assert.rejects(formal.verifyTools(tools),{message:'TOOL_ARTIFACT_DRIFT'});
  for(const name of['artifactSha256','binarySha256','librarySha256','metadataSha256'])await assert.rejects(formal.verifyTools(tools,{...pin,[name]:'0'.repeat(64)}),{message:'TOOL_ARTIFACT_DRIFT'},name);
  await assert.rejects(formal.verifyTools({...tools,artifact:join(directory,'missing.whl')},pin),{message:'TOOL_ARTIFACT_MISSING'});
  await assert.rejects(formal.verifyTools({...tools,z3Root:join(directory,'missing-root')},pin),{message:'TOOL_ARTIFACT_MISSING'});
  await assert.rejects(formal.verifyTools(tools,{...pin,reportedVersion:'Z3 version 4.12.3 - 64 bit'}),{message:'TOOL_VERSION_MISMATCH'});
  const wrongVersion=await fakeTool(directory,'z3-other',{version:'Z3 version 4.13.0 - 64 bit'},FAKE_Z3);
  await assert.rejects(formal.verifyTools({...tools,z3:wrongVersion},{...pin,binarySha256:await hashOf(wrongVersion)}),{message:'TOOL_VERSION_MISMATCH'});
  await assert.rejects(formal.verifyTools(tools,{...pin,license:'Apache License'}),{message:'TOOL_LICENSE_MISMATCH'});
  // Drift between the checks: the files change and still match a (different) pin, but the hashes taken before do not.
  await writeFile(files.library,'replaced library bytes');const moved={...pin,librarySha256:await hashOf(files.library)};
  await assert.rejects(formal.recheckTools(tools,before,{pin,solcSha256}),{message:'TOOL_ARTIFACT_DRIFT'});
  await assert.rejects(formal.recheckTools(tools,before,{pin:moved,solcSha256}),{message:'TOOL_ARTIFACT_DRIFT'});
  await writeFile(files.library,'library bytes');await formal.recheckTools(tools,before,{pin,solcSha256});
  await writeFile(files.solc,'replaced compiler');await assert.rejects(formal.recheckTools(tools,before,{pin,solcSha256}),{message:'TOOL_ARTIFACT_DRIFT'});
  await rm(files.solc);await assert.rejects(formal.recheckTools(tools,before,{pin,solcSha256}),{message:'TOOL_ARTIFACT_MISSING'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
