#!/usr/bin/env node
/** Local source-bound SMT/native evidence. No result produced here approves a deployment or closes specialist review. */
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {keccak_256} from '@noble/hashes/sha3.js';
import {forgeEnv,checkToolchain,TOOLCHAIN} from '../sepolia/lib.mjs';
import {isMain} from '../lib/is-main.mjs';
export const LIMITS=Object.freeze({queryBytes:4*1024*1024,totalQueryBytes:32*1024*1024,queries:64,rounds:8,queryMs:5000,totalMs:120000,compilerMs:25000,outputBytes:32*1024*1024,solverOutputBytes:131072});
export const Z3_PIN=Object.freeze({package:'z3-solver',version:'4.12.2.0',filename:'z3_solver-4.12.2.0-py2.py3-none-manylinux2014_x86_64.whl',artifactSha256:'03921d3021cb6e5dbeaeb94634132a5fbf5403748aa21774efac4047e633af1e',binarySha256:'112132c9f82751e663f5a5573957c678f9af821aaf376d0c5863e4f076370444',librarySha256:'5ba701bbb32fc0923ee98b4adb1b246f7ef60c30fa62065514d8099955678101',metadataSha256:'eb8d327ac5b681c48a7a74ae3f920487c203d188755e950265f680ee0938e8f5',reportedVersion:'Z3 version 4.12.2 - 64 bit',license:'MIT License',officialMetadata:'https://pypi.org/pypi/z3-solver/4.12.2.0/json'});
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),EVM=resolve(ROOT,'contracts/evm'),HARNESS='formal/CanonicalRefinement.t.sol';
export function resolveTools(env=process.env){
 if(typeof env.FORMAL_Z3_ROOT!=='string'||!env.FORMAL_Z3_ROOT.trim()||typeof env.FORMAL_Z3_ARTIFACT!=='string'||!env.FORMAL_Z3_ARTIFACT.trim())stop('TOOL_ROOT_REQUIRED');
 const z3Root=resolve(env.FORMAL_Z3_ROOT),foundryRoot=env.FORMAL_FOUNDRY_ROOT?resolve(env.FORMAL_FOUNDRY_ROOT):null;
 const solc=resolve(env.FOUNDRY_SOLC||resolve(env.HOME||homedir(),'.svm',TOOLCHAIN.solcVersion,`solc-${TOOLCHAIN.solcVersion}`));
 return{solc,forge:foundryRoot?resolve(foundryRoot,'forge'):'forge',z3Root,z3:resolve(z3Root,'bin/z3'),artifact:resolve(env.FORMAL_Z3_ARTIFACT),env:forgeEnv({...env,...(foundryRoot?{PATH:foundryRoot+':'+(env.PATH??'')} :{}),FOUNDRY_SOLC:solc})};
}
const utf8=new TextEncoder(),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hex=bytes=>Buffer.from(bytes).toString('hex');
export const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const stop=code=>{throw Error(code);};
export function queryIdentity(query){if(typeof query!=='string'||Buffer.byteLength(query)>LIMITS.queryBytes)stop('QUERY_LIMIT');return '0x'+hex(keccak_256(utf8.encode(query)));}
export function solverAnswer(stdout){if(typeof stdout!=='string'||Buffer.byteLength(stdout)>LIMITS.solverOutputBytes)stop('SOLVER_OUTPUT_LIMIT');const text=stdout.trim();return text==='sat'||text==='unsat'?text:'unknown';}
export function assertionSpan(source,assertion){if(typeof source!=='string'||typeof assertion!=='string'||!assertion.startsWith('assert('))stop('PROPERTY_INVALID');const at=source.indexOf(assertion);if(at<0||source.indexOf(assertion,at+1)>=0)stop('PROPERTY_BINDING_MISMATCH');return{start:Buffer.byteLength(source.slice(0,at)),end:Buffer.byteLength(source.slice(0,at+assertion.length-(assertion.endsWith(';')?1:0)))};}
export function classifyProperty(output,file,span,incomplete=false){
 const errors=Array.isArray(output?.errors)?output.errors:[],matches=errors.filter(error=>error?.sourceLocation?.file===file&&error.sourceLocation.start===span.start&&error.sourceLocation.end===span.end);
 const violation=matches.some(error=>String(error.errorCode)==='6328'),safe=matches.some(error=>String(error.errorCode)==='9576');
 const unsupported=errors.filter(error=>/not (?:yet )?supported|unsupported|not implemented|abstraction/i.test(String(error?.message??'')));
 if(violation)return{result:'COUNTEREXAMPLE_FOUND',toolReported:'ASSERTION_VIOLATION',unsupported,qualification:'Compiler-model counterexample requires native replay before calling it an implementation defect.'};
 if(incomplete||unsupported.length||!safe)return{result:'PROOF_UNKNOWN',toolReported:safe?'SAFE_UNDER_COMPILER_MODEL':'UNPROVED',unsupported};
 return{result:'PROVED_UNDER_DECLARED_MODEL',toolReported:'SAFE_UNDER_COMPILER_MODEL',unsupported};
}
async function collectSources(entry){
 const sources={},digests={};let total=0;
 async function visit(key){if(Object.hasOwn(sources,key))return;if(Object.keys(sources).length>=256)stop('SOURCE_LIMIT');const path=resolve(EVM,key);if(!path.startsWith(EVM+'/'))stop('SOURCE_PATH_INVALID');const bytes=await readFile(path);total+=bytes.length;if(bytes.length>1048576||total>8*1048576)stop('SOURCE_LIMIT');const content=bytes.toString('utf8');sources[key]={content};digests[key]=sha(bytes);
  const imports=content.matchAll(/import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']\s*;/g);
  for(const match of imports){const name=match[1];const imported=name.startsWith('forge-std/')?'lib/forge-std/src/'+name.slice(10):name.startsWith('@openzeppelin/contracts/')?'lib/openzeppelin-contracts/contracts/'+name.slice(24):resolve(dirname(path),name).slice(EVM.length+1);await visit(imported);}
 }
 await visit(entry);return{sources,digests};
}
async function verifySources(digests){for(const[key,hash]of Object.entries(digests))if(await hashFile(resolve(EVM,key))!==hash)stop('SOURCE_DRIFT');}
async function hashFile(path){return sha(await readFile(path));}
export async function processBounded(command,args,{input='',cwd=ROOT,env=process.env,timeoutMs=10000,maxOutput=LIMITS.outputBytes}={}){
 return new Promise(resolveResult=>{let child,stdout=[],stderr=[],bytes=0,ended=false,timedOut=false,limited=false,timer;
  const finish=(code,error)=>{if(ended)return;ended=true;clearTimeout(timer);kill();resolveResult({code,error:error?'SPAWN_FAILED':null,timedOut,limited,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});};
  const kill=()=>{try{if(child?.pid)process.kill(-child.pid,'SIGKILL');}catch{try{child?.kill('SIGKILL');}catch{}}};
  try{child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:true});}catch(error){finish(null,error);return;}
  timer=setTimeout(()=>{timedOut=true;kill();},Math.max(1,timeoutMs));
  const collect=(list,chunk)=>{bytes+=chunk.length;if(bytes>maxOutput){limited=true;kill();return;}list.push(Buffer.from(chunk));};
  child.stdout.on('data',chunk=>collect(stdout,chunk));child.stderr.on('data',chunk=>collect(stderr,chunk));child.on('error',error=>finish(null,error));child.on('close',code=>finish(code));child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
function baseSettings(contractFile,contract){return{optimizer:{enabled:true,runs:200},evmVersion:'cancun',viaIR:false,remappings:['forge-std/=lib/forge-std/src/','@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/'],modelChecker:{engine:'chc',solvers:['smtlib2'],targets:['assert'],showProvedSafe:true,showUnproved:true,showUnsupported:true,extCalls:'trusted',contracts:{[contractFile]:[contract]}},outputSelection:{'*':{'*':['metadata']}}};}
async function bridge(input,{outputDirectory,deadline,sourceLabel,tools}){
 const responses={},queries=[],known=new Set(),compilerRuns=[];let totalBytes=0,incomplete=false,stopReason=null,output;
 for(let round=0;round<LIMITS.rounds;round++){
  if(performance.now()>=deadline){incomplete=true;stopReason='TOTAL_DEADLINE';break;}
  const supplied={...input,...(Object.keys(responses).length?{auxiliaryInput:{smtlib2responses:responses}}:{})},inputText=JSON.stringify(supplied);if(Buffer.byteLength(inputText)>LIMITS.outputBytes){incomplete=true;stopReason='INPUT_LIMIT';break;}
  const raw=await processBounded(tools.solc,['--base-path',EVM,'--standard-json'],{input:inputText,timeoutMs:Math.min(LIMITS.compilerMs,deadline-performance.now())});
  compilerRuns.push({round,inputSha256:sha(inputText),stdoutSha256:sha(raw.stdout),stderrSha256:sha(raw.stderr),exitCode:raw.code,timedOut:raw.timedOut,limited:raw.limited,error:raw.error});await writeFile(resolve(outputDirectory,`${sourceLabel}-round${round}-input.json`),inputText);await writeFile(resolve(outputDirectory,`${sourceLabel}-round${round}-stdout.json`),raw.stdout);await writeFile(resolve(outputDirectory,`${sourceLabel}-round${round}-stderr.txt`),raw.stderr);
  if(raw.timedOut||raw.limited||raw.error||raw.code!==0){incomplete=true;stopReason=raw.timedOut?'COMPILER_TIMEOUT':raw.limited?'COMPILER_OUTPUT_LIMIT':'COMPILER_FAILURE';break;}
  try{output=JSON.parse(raw.stdout);}catch{incomplete=true;stopReason='COMPILER_OUTPUT_INVALID';break;}
  if((output.errors??[]).some(error=>error.severity==='error')){incomplete=true;stopReason='COMPILER_ERROR';break;}
  const requested=output.auxiliaryInputRequested?.smtlib2queries??{};if(typeof requested!=='object'||Array.isArray(requested)){incomplete=true;break;}
  const entries=Object.entries(requested);if(entries.length===0)return{output,queries,incomplete,stopReason,compilerRuns,sourceInputSha256:sha(canonical(input))};
  for(const[key,query]of entries){
   if(known.has(key)||queries.length>=LIMITS.queries||typeof query!=='string'||queryIdentity(query)!==key){incomplete=true;break;}
   totalBytes+=Buffer.byteLength(query);if(totalBytes>LIMITS.totalQueryBytes||performance.now()>=deadline){incomplete=true;break;}
   known.add(key);const remaining=Math.min(LIMITS.queryMs,deadline-performance.now());
   const solved=await processBounded(tools.z3,['-in','-smt2','-T:5','memory_max_size=512'],{input:query,timeoutMs:remaining,maxOutput:LIMITS.solverOutputBytes});
   const answer=solved.error||solved.code!==0||solved.timedOut||solved.limited||solved.stderr.trim()!==''?'unknown':solverAnswer(solved.stdout);if(answer==='unknown')incomplete=true;
   const name=`${sourceLabel}-${key.slice(2)}`;await writeFile(resolve(outputDirectory,name+'.smt2'),query);await writeFile(resolve(outputDirectory,name+'.stdout'),solved.stdout);await writeFile(resolve(outputDirectory,name+'.stderr'),solved.stderr);
   queries.push({key,querySha256:sha(query),queryBytes:Buffer.byteLength(query),responseSha256:sha(solved.stdout),answer,exitCode:solved.code,timedOut:solved.timedOut,limited:solved.limited,stderrSha256:sha(solved.stderr)});
   responses[key]=answer+'\n';
  }
  if(incomplete)break;
 }
 return{output:output??{},queries,incomplete:true,stopReason:stopReason??'SOLVER_OR_QUERY_INCOMPLETE',compilerRuns,sourceInputSha256:sha(canonical(input))};
}
async function verifyTools(tools){
 const paths={artifact:tools.artifact,binary:tools.z3,library:resolve(tools.z3Root,'z3/lib/libz3.so.4.12'),metadata:resolve(tools.z3Root,'z3_solver-4.12.2.0.dist-info/METADATA')};
 const expected={artifact:Z3_PIN.artifactSha256,binary:Z3_PIN.binarySha256,library:Z3_PIN.librarySha256,metadata:Z3_PIN.metadataSha256},hashes={};
 for(const[name,path]of Object.entries(paths)){hashes[name]=await hashFile(path);if(hashes[name]!==expected[name])stop('TOOL_ARTIFACT_DRIFT');}
 const version=await processBounded(tools.z3,['--version'],{timeoutMs:5000,maxOutput:8192});if(version.code!==0||version.stdout.trim()!==Z3_PIN.reportedVersion)stop('TOOL_VERSION_MISMATCH');
 const metadata=await readFile(paths.metadata,'utf8');if(!metadata.includes('License: MIT License'))stop('TOOL_LICENSE_MISMATCH');
 return{...Z3_PIN,paths,hashes,reportedVersion:version.stdout.trim(),licenseEvidence:'Pinned package METADATA; license classification is not legal release approval.'};
}
export function validateProbe(probe,source){
 if(probe.incomplete||probe.queries.length!==2||probe.queries.some(query=>!['sat','unsat'].includes(query.answer)))stop('TOOL_PROBE_INCOMPLETE');
 const safe=classifyProperty(probe.output,'ToolProbes.sol',assertionSpan(source,'assert(x == x);'));
 const unsafe=classifyProperty(probe.output,'ToolProbes.sol',assertionSpan(source,'assert(x != 7);'));
 if(safe.result!=='PROVED_UNDER_DECLARED_MODEL'||unsafe.result!=='COUNTEREXAMPLE_FOUND')stop('TOOL_PROBE_BINDING_FAILED');
 return{safe,unsafe,qualification:'CHC/HORN consistency semantics: SAT can mean safety and UNSAT reachability; compiler source-bound diagnostics, never raw SAT/UNSAT polarity, determine outcomes.'};
}
export function nativeWitness(output,exitCode,spec){
 const suites=Object.entries(output??{});if(exitCode!==1||suites.length!==1||suites[0][0]!==`${HARNESS}:${spec.nativeContract}`)stop('NATIVE_WITNESS_INCOMPLETE');
 const results=suites[0][1]?.test_results;if(!results||Object.keys(results).length!==2)stop('NATIVE_WITNESS_INCOMPLETE');
 const good=results[spec.nativeRefinement.test+'()'],bad=results[spec.strictModelCounterexample.test+'()'];
 if(good?.status!=='Success'||bad?.status!=='Failure'||typeof bad.reason!=='string'||!bad.reason.startsWith(spec.strictModelCounterexample.expectedReason+':'))stop('NATIVE_WITNESS_MISMATCH');
 const decode=test=>{const trace={};if(!Array.isArray(test.decoded_logs)||test.decoded_logs.length!==13)stop('NATIVE_TRACE_INVALID');for(const line of test.decoded_logs){if(typeof line!=='string')stop('NATIVE_TRACE_INVALID');const match=/^([A-Za-z]+): (0x[0-9a-fA-F]+|[0-9]+)$/.exec(line);if(!match||Object.hasOwn(trace,match[1]))stop('NATIVE_TRACE_INVALID');trace[match[1]]=match[2].toLowerCase();}return trace;};
 const trace=decode(good);if(canonical(trace)!==canonical(decode(bad)))stop('NATIVE_TRACE_MISMATCH');
 for(const name of['principal','surplus','activeAfterTerminal','paidAfterTerminal','pendingAfterTerminal','custodyAfterTerminal','paidAfterWithdrawal','pendingAfterWithdrawal','custodyAfterWithdrawal'])if(!/^(0|[1-9][0-9]{0,77})$/.test(trace[name]??''))stop('NATIVE_TRACE_INVALID');
 const p=BigInt(trace.principal),s=BigInt(trace.surplus);if(bad.reason!==spec.strictModelCounterexample.expectedReason+': 0 != '+p)stop('NATIVE_WITNESS_MISMATCH');if(p<=0n||BigInt(trace.activeAfterTerminal)!==0n||BigInt(trace.paidAfterTerminal)!==0n||BigInt(trace.pendingAfterTerminal)!==p||BigInt(trace.custodyAfterTerminal)!==p+s||BigInt(trace.paidAfterWithdrawal)!==p||BigInt(trace.pendingAfterWithdrawal)!==0n||BigInt(trace.custodyAfterWithdrawal)!==s)stop('NATIVE_REFINEMENT_FAILED');
 for(const name of['seller','buyer','withdrawCaller'])if(!/^0x[0-9a-f]{40}$/.test(trace[name]??''))stop('NATIVE_TRACE_INVALID');if(new Set([trace.seller,trace.buyer,trace.withdrawCaller]).size!==3||!/^0x[0-9a-f]{64}$/.test(trace.tradeId??''))stop('NATIVE_TRACE_INVALID');
 return{result:'MODEL_IMPLEMENTATION_GAP',nativeRefinement:'TEST_EVIDENCE_PASSED',strictFailure:bad.reason,trace,counterexampleDigest:sha(canonical(trace)),qualification:'Intended push-to-credit behavior is not theft. This is an actual canonical native witness, not an unbounded proof or a release approval.'};
}
/** Predicate-only extraction: no modifier, payout, storage transition or execution theorem. */
export function guardPredicates(ast,source){
 const contract=ast?.nodes?.find(n=>n.nodeType==='ContractDefinition'&&n.name==='BasicEscrow');if(!contract)stop('GUARD_AST_INVALID');
 const enumeration=contract.nodes.find(n=>n.nodeType==='EnumDefinition'&&n.name==='State');
 const funded=enumeration?.members?.findIndex(n=>n.name==='Funded');if(funded!==1)stop('GUARD_ENUM_CHANGED');
 const expected={release:['escrow.state != State.Funded','msg.sender != escrow.seller','block.timestamp >= escrow.deadline'],refund:['escrow.state != State.Funded','block.timestamp < escrow.deadline']};
 const atoms={'escrow.state':'state','State.Funded':String(funded),'msg.sender':'caller','escrow.seller':'seller','block.timestamp':'time','escrow.deadline':'deadline'};
 const reverts={'escrow.state != State.Funded':'InvalidState(tradeId, escrow.state)','msg.sender != escrow.seller':'Unauthorized(msg.sender)','block.timestamp >= escrow.deadline':'DeadlinePassed(escrow.deadline)','block.timestamp < escrow.deadline':'DeadlineNotReached(escrow.deadline)'};
 const bindings=[];const text=node=>{if(typeof node?.src!=='string')stop('GUARD_AST_INVALID');const [a,b]=node.src.split(':').map(Number);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<1||a+b>Buffer.byteLength(source))stop('GUARD_AST_INVALID');return Buffer.from(source).subarray(a,a+b).toString('utf8');};
 const atom=node=>{if(node?.nodeType!=='MemberAccess'||node.expression?.nodeType!=='Identifier')stop('GUARD_AST_UNSUPPORTED');const name=node.expression.name+'.'+node.memberName;if(!Object.hasOwn(atoms,name)||text(node)!==name)stop('GUARD_AST_UNSUPPORTED');return atoms[name];};
 const output={};for(const[name,conditions]of Object.entries(expected)){
  const matches=contract.nodes.filter(n=>n.nodeType==='FunctionDefinition'&&n.name===name);if(matches.length!==1)stop('GUARD_FUNCTION_CHANGED');const fn=matches[0],body=fn.body?.statements;
  if(!Array.isArray(body)||body.length!==conditions.length+5||body[0].nodeType!=='VariableDeclarationStatement'||text(body[0])!=='Escrow storage escrow = _escrows[tradeId]')stop('GUARD_PREFIX_CHANGED');
  const predicates=[];for(let i=0;i<conditions.length;i++){
   const node=body[i+1],condition=node?.condition;
   if(node?.nodeType!=='IfStatement'||node.falseBody!==null&&node.falseBody!==undefined||node.trueBody?.nodeType!=='RevertStatement'||condition?.nodeType!=='BinaryOperation'||text(condition)!==conditions[i]||text(node)!==`if (${conditions[i]}) revert ${reverts[conditions[i]]}`)stop('GUARD_PREFIX_CHANGED');
   const operator={'!=':'distinct','>=':'>=','<':'<'}[condition.operator];if(!operator)stop('GUARD_AST_UNSUPPORTED');
   predicates.push(`(not (${operator} ${atom(condition.leftExpression)} ${atom(condition.rightExpression)}))`);
   bindings.push({function:name,sourceSpan:condition.src,sourceText:text(condition),astSha256:sha(canonical(condition))});
  }
  // The very next statement must be the canonical state assignment; no skipped side effects.
  const next=body[conditions.length+1];if(next?.nodeType!=='ExpressionStatement'||next.expression?.nodeType!=='Assignment'||text(next)!==`escrow.state = State.${name==='release'?'Released':'Refunded'}`)stop('GUARD_PREFIX_CHANGED');
  output[name]='(and '+predicates.join(' ')+')';
 }
 return{predicates:output,bindings,sourceSha256:sha(source),astSha256:sha(canonical(ast))};
}
async function proveGuards(sourceClosure,{outputDirectory,deadline,tools}){
 const settings=baseSettings(HARNESS,'CanonicalSMT');delete settings.modelChecker;settings.outputSelection={'*':{'':['ast']}};
 const input=JSON.stringify({language:'Solidity',sources:sourceClosure.sources,settings});const compiled=await processBounded(tools.solc,['--standard-json'],{input,timeoutMs:Math.min(LIMITS.compilerMs,Math.max(1,deadline-performance.now()))});
 await writeFile(resolve(outputDirectory,'guard-compiler-input.json'),input);await writeFile(resolve(outputDirectory,'guard-compiler-output.json'),compiled.stdout);
 if(compiled.code!==0||compiled.timedOut||compiled.limited||compiled.error)stop('GUARD_COMPILER_INCOMPLETE');let parsed;try{parsed=JSON.parse(compiled.stdout);}catch{stop('GUARD_COMPILER_INVALID');}if(parsed.errors?.some(e=>e.severity==='error'))stop('GUARD_COMPILER_INVALID');
 const extracted=guardPredicates(parsed.sources?.['src/BasicEscrow.sol']?.ast,sourceClosure.sources['src/BasicEscrow.sol'].content),{release,refund}=extracted.predicates;
 const prefix=`(set-logic QF_LIA)\n(declare-const state Int)\n(declare-const caller Int)\n(declare-const seller Int)\n(declare-const time Int)\n(declare-const deadline Int)\n(assert (and (<= 0 state) (<= state 3) (<= 0 caller) (< caller ${2n**160n}) (<= 0 seller) (< seller ${2n**160n}) (<= 0 time) (< time ${2n**256n}) (<= 0 deadline) (< deadline ${2n**64n})))\n`;
 const obligations=[['GUARD-RELEASE-REFUND-DISJOINT',`(and ${release} ${refund})`],['GUARD-UNAUTHORIZED-RELEASE-REFUSED',`(and ${release} (distinct caller seller))`],['GUARD-SELLER-DEADLINE-COVERAGE',`(and (= state 1) (= caller seller) (not (or ${release} ${refund})))`],['GUARD-DEADLINE-EQUALITY-REFUND',`(and (= state 1) (= caller seller) (= time deadline) (or ${release} (not ${refund})))`]];
 const results=[];for(const[id,violation]of obligations){const query=prefix+`(assert ${violation})\n(check-sat)\n`;if(performance.now()>=deadline)stop('GUARD_TOTAL_DEADLINE');const solved=await processBounded(tools.z3,['-in','-smt2','-T:5','memory_max_size=512'],{input:query,timeoutMs:Math.min(LIMITS.queryMs,deadline-performance.now()),maxOutput:LIMITS.solverOutputBytes});const answer=solved.code===0&&!solved.timedOut&&!solved.limited&&!solved.error&&!solved.stderr.trim()?solverAnswer(solved.stdout):'unknown';await writeFile(resolve(outputDirectory,id+'.smt2'),query);await writeFile(resolve(outputDirectory,id+'.stdout'),solved.stdout);results.push({id,result:answer==='unsat'?'PROVED_GUARD_LOGIC_ONLY':answer==='sat'?'COUNTEREXAMPLE_FOUND':'PROOF_UNKNOWN',answer,queryIdentity:queryIdentity(query),querySha256:sha(query),responseSha256:sha(solved.stdout),timedOut:solved.timedOut});}
 return{...extracted,compilerInputSha256:sha(input),compilerOutputSha256:sha(compiled.stdout),properties:results,qualification:'Only side-effect-free canonical pre-payout revert predicates; excludes modifiers, storage transitions, gas, transfers, bytecode and whole-contract correctness.'};
}
export async function runFormal({outputDirectory=resolve(ROOT,'.formal-evidence'),environment=process.env}={}){
 await mkdir(outputDirectory,{recursive:true});const deadline=performance.now()+LIMITS.totalMs;
 const tools=resolveTools(environment),env=tools.env;const toolchain=await checkToolchain(env),solver=await verifyTools(tools);
 const sourceClosure=await collectSources(HARNESS),source=sourceClosure.sources[HARNESS].content,specBytes=await readFile(resolve(EVM,'formal/properties.json')),spec=JSON.parse(specBytes),canonicalPath=resolve(EVM,spec.canonicalSource),canonicalBefore=await hashFile(canonicalPath),abiPath=resolve(EVM,'abi/BasicEscrow.json'),interfaceBefore=await hashFile(abiPath);
 if(canonicalBefore!==spec.canonicalSourceSha256)stop('CANONICAL_SOURCE_CHANGED');
 const probeSource='// SPDX-License-Identifier: UNLICENSED\npragma solidity 0.8.30; contract ToolProbes { function safe(uint x) public pure { assert(x == x); } function unsafe(uint x) public pure { assert(x != 7); } }';
 const probeInput={language:'Solidity',sources:{'ToolProbes.sol':{content:probeSource}},settings:baseSettings('ToolProbes.sol','ToolProbes')};
 const probe=await bridge(probeInput,{outputDirectory,deadline,sourceLabel:'probes',tools}),probeResults=validateProbe(probe,probeSource);
 const actualInput={language:'Solidity',sources:sourceClosure.sources,settings:baseSettings(HARNESS,spec.formalContract)};
 const guards=await proveGuards(sourceClosure,{outputDirectory,deadline,tools});
 const formal=await bridge(actualInput,{outputDirectory,deadline,sourceLabel:'canonical',tools});
 const properties=spec.properties.map(property=>({...property,modelCommit:null,modelSourceSha256:sha(source),assumptions:spec.assumptions,toolVersion:Z3_PIN.reportedVersion,...classifyProperty(formal.output,HARNESS,assertionSpan(source,property.assertion),formal.incomplete),counterexampleDigest:null}));
 await verifySources(sourceClosure.digests);const native=await processBounded(tools.forge,['test','--match-contract',spec.nativeContract,'--json','-vvvv'],{cwd:EVM,env:forgeEnv(env,{FOUNDRY_TEST:'formal',FOUNDRY_OFFLINE:'true',FOUNDRY_SOLC:tools.solc,RAYON_NUM_THREADS:'1',TOKIO_WORKER_THREADS:'1'}),timeoutMs:Math.min(60000,Math.max(1,deadline-performance.now()))});
 await writeFile(resolve(outputDirectory,'native-stdout.json'),native.stdout);await writeFile(resolve(outputDirectory,'native-stderr.txt'),native.stderr);if(native.error||native.timedOut||native.limited)stop('NATIVE_TOOL_INCOMPLETE');let parsedNative;try{parsedNative=JSON.parse(native.stdout);}catch{stop('NATIVE_TOOL_OUTPUT_INVALID');}const witness=nativeWitness(parsedNative,native.code,spec);
 const artifact=JSON.parse(await readFile(resolve(EVM,'out/BasicEscrow.sol/BasicEscrow.json'),'utf8')),committedABI=JSON.parse(await readFile(abiPath,'utf8'));if(canonical(artifact.abi)!==canonical(committedABI))stop('INTERFACE_DRIFT');
 await verifySources(sourceClosure.digests);if(await hashFile(canonicalPath)!==canonicalBefore||await hashFile(abiPath)!==interfaceBefore)stop('ARTIFACT_DRIFT');const solverAfter=await verifyTools(tools);if(canonical(solverAfter.hashes)!==canonical(solver.hashes))stop('TOOL_ARTIFACT_DRIFT');
 const commit=await processBounded('git',['rev-parse','HEAD'],{maxOutput:1024,timeoutMs:5000});if(commit.code!==0||!/^[0-9a-f]{40}\n?$/.test(commit.stdout))stop('SOURCE_COMMIT_UNAVAILABLE');
 const report={version:1,scope:'LOCAL_SOURCE_BOUND_EVM_FORMAL_REFINEMENT',releaseEnabled:false,productionApproval:false,result:witness.result,reviewUnit:{chain:'evm',sourceCommit:commit.stdout.trim(),canonicalSourceSha256:canonicalBefore,modelCommit:null,modelSourceSha256:sha(source),compilerVersion:toolchain.solcVersion,compilerFlags:{optimizer:true,runs:200,evmVersion:'cancun',viaIR:false},dependencyLockDigest:sha(canonical({npmLock:await hashFile(resolve(ROOT,'package-lock.json')),soliditySources:sourceClosure.digests})),dependencySourceSha256:sourceClosure.digests,artifactDigest:sha(Buffer.from(artifact.deployedBytecode.object.replace(/^0x/,''),'hex')),interfaceDigest:interfaceBefore,threatModelDigest:await hashFile(resolve(EVM,'SECURITY-NOTES.md')),propertySetDigest:sha(specBytes),deploymentParameters:{allowlist:[],context:'local test VM only'},reviewReports:[],findings:[{id:spec.strictModelCounterexample.id,result:'MODEL_IMPLEMENTATION_GAP',counterexampleDigest:witness.counterexampleDigest}]},toolchain,solver,guards,probe:{sourceSha256:sha(probeSource),sourceInputSha256:probe.sourceInputSha256,queries:probe.queries,results:probeResults},formal:{sourceInputSha256:formal.sourceInputSha256,queries:formal.queries,compilerRuns:formal.compilerRuns,stopReason:formal.stopReason,incomplete:formal.incomplete,diagnostics:formal.output.errors??[],properties},native:witness,qualifications:['SMT compiler-model checks and native trace evidence are separate from fuzzing and external review.','Unsupported compiler abstractions, timeouts and missing results stay PROOF_UNKNOWN.','The strict terminal-paid model gap blocks promotion until explicitly reviewed; deferred credit is intended, not theft.','No ERC20/Solana/native deployment, wallet/browser, fiat or network-liveness approval.','The candidate model is uncommitted until integration; modelCommit is null and exact model/source hashes bind local evidence.']};
 await writeFile(resolve(outputDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(isMain(import.meta.url)){const directory=process.argv[2]??resolve(ROOT,'.formal-evidence');try{const report=await runFormal({outputDirectory:directory});console.log(JSON.stringify({scope:report.scope,result:report.result,properties:report.formal.properties.map(p=>({id:p.id,result:p.result})),queries:report.formal.queries.length,native:report.native.nativeRefinement,releaseEnabled:false,report:resolve(directory,'report.json')}));}catch(error){console.error(JSON.stringify({result:'TOOL_INCOMPLETE',code:/^[A-Z_]{1,64}$/.test(error?.message??'')?error.message:'UNAVAILABLE',releaseEnabled:false}));process.exitCode=1;}}
