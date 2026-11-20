# Independent optional privacy-policy review

## Verdict and exact source

**Qualified for isolated source integration after repair; the reproduced Medium
finding is closed.** Reviewed final head:
`8b04cfc3a03c3bd82618244bba775633174ffb45`. Independently reviewed repair checkpoint:
`599fb729d4c02b7a50746268454ec9208bd8e2a8`, package tree
`5ab375b6f3b5520bd6059ff858f48699edf53aca`.

Initial reviewed head: `7b9f6ee800ffc94a85e63133f6c423246ae9597d`, based on
`ac9a4b0ffc3ca50a299398e72554e7964a634cd4`. Initial implementation checkpoint:
`066508b4926a38fcbf73b38f04315972b9d10255`.

The initial package subtree was exactly `3d85dc5a444f5546f966d778da14c22eab3a260d`,
matching original PR #148 head `7c1f3441fcaa45f076957633b2005bd5c1e25e9e`.
The reviewer inspected and executed this pinned worktree without changing its
source. D7 accepts isolated optional-package recovery; default application wiring
is not part of this review. The finding was reported to the coordinator before
any repair, and publication was held for an author repair and independent retest.

## Closed Medium: pruning invalidated an already-checked atomic module

At the initial reviewed head, `packages/privacy-policy/src/plan.ts:99` validates native
G14 atomic manifest groups, and the loop beginning at line 117 propagates group
and dependency blocking. The subsequent orphan-dependency pruning at line 129
can change an enabled group member to disabled. The groups are not checked again
before `canPrepare` is calculated at line 132.

This matters because `packages/privacy-policy/src/mode.ts:101` selects a module
when any of its catalog nodes is enabled, and line 106 initializes its complete
native G14 instance. G14 does not initialize capability subsets.

A reproducible composition uses a native atomic module containing two
capabilities, `local:primary` and `local:companion`. The policy requires primary
and optionally requests an unavailable third capability whose sole dependency
is companion. Expansion initially activates both members of the present module,
so the atomic-group check passes. The absent optional root is blocked, and later
pruning disables its otherwise unused companion dependency. Primary remains
enabled. The controller initializes the full two-capability module and publishes
an active, preparable plan that describes companion as disabled.

This was a package-level activation correctness defect and a contradiction of its
atomic activation boundary. It was Medium because the optional package is not
imported by the default application and this reproduction grants no wallet or
funded-trade authority. It nevertheless blocked qualification of the initial source:
the plan must not activate a complete native module while labeling one of its
capabilities disabled.

The existing 21 tests passed. They separately cover explicitly disabled companion
capabilities and pruning a dependency of an absent optional root, but not this
composition of those behaviors.

### Exact reproduction

Run from the pinned privacy-policy worktree with the existing dependencies. This
uses the real native extension registry and the repository's local broker fixture.
The assertions confirm the defect at the reviewed head; they are not a passing
acceptance test for corrected behavior.

```sh
node --import ./scripts/test-support/register-tsx.mjs --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createModeController } from './packages/privacy-policy/index.ts';
import { createExtensionRegistry } from './packages/extensions/index.ts';
import { makeBroker } from './packages/relay/test/support/harness.mjs';
const hash = 'a'.repeat(64);
const ref = name => ({ name, protocolVersion: 1, schemaHash: hash });
const primary = ref('local:primary');
const companion = ref('local:companion');
const absent = ref('local:absent');
const node = (ref, moduleId, dependencies = []) => ({
  ...ref, moduleId, profileId: null, mandatory: false, dependencies,
  conflicts: [], channels: [], unbrokeredPaths: [], dataClasses: ['private'],
});
const policy = {
  format: 'p2p-offramp-feature-policy', version: 1,
  policyId: 'independent-pruning-repro', revision: 0,
  required: [primary], optional: [absent], disabled: [],
  mode: 'ordinary', profileIds: [],
};
const manifest = {
  format: 'p2p-offramp-extension', version: 1, id: 'paired',
  protocolVersion: 1, coreApiVersion: 1,
  capabilities: [primary.name, companion.name], schemaHashes: [hash],
};
const { broker } = makeBroker({ mode: 'ordinary' });
let starts = 0;
const controller = createModeController({
  broker, unbrokeredPaths: [],
  catalog: [node(primary, 'paired'), node(companion, 'paired'),
    node(absent, 'missing', [companion.name])],
  createRegistry: (generation, isCurrent) => createExtensionRegistry({
    generation, isCurrent,
    registeredCapabilities: [primary.name, companion.name, absent.name],
    entries: [{ instance: {
      manifest,
      initialize: async () => { starts++; return { ok: true, value: undefined }; },
      dispose: async () => {},
    } }],
  }),
});
try {
  const result = await controller.requestMode(policy);
  console.log(JSON.stringify({
    ok: result.ok, starts,
    state: result.ok ? result.value.state : null,
    canPrepare: result.ok ? result.value.evaluation.canPrepare : null,
    nodes: result.ok ? result.value.evaluation.nodes.map(
      ({ name, state, reasons }) => ({ name, state, reasons })) : result.error,
  }, null, 2));
  assert.equal(result.ok, true);
  assert.equal(starts, 1);
  assert.equal(result.value.evaluation.nodes.find(
    n => n.name === companion.name).state, 'disabled');
} finally {
  await controller.dispose();
  broker.dispose();
}
JS
```

Observed result: exit 0; `ok: true`, `starts: 1`, `state: "active"`,
`canPrepare: true`. Final node states were:

| Node | State | Reason |
| --- | --- | --- |
| `local:absent` | blocked | `UNSUPPORTED_PROVIDER` |
| `local:companion` | disabled | `DISABLED` |
| `local:primary` | enabled | `ENABLED` |

The repair must keep pruning, atomic-group blocking and dependency propagation
consistent before selecting native modules. Under the existing orphan-pruning
policy, this example should not initialize the paired module; required primary
must not remain preparable after its atomic companion is pruned. Add a regression
covering both the final evaluation and actual initializer count. Independent
closure must review and test the exact repaired head rather than infer success
from the original 21 tests.

## Repair and independent closure

The author added the native regression at checkpoint
`613328a4773d58bce856926df3bcc257ac6e7ece` and repaired the implementation at
`599fb729d4c02b7a50746268454ec9208bd8e2a8`. The repair moves orphan pruning inside
the existing group/dependency fixed-point loop and marks a pass changed whenever
an enabled node is pruned. Every changing pass removes at least one enabled node
from a catalog bounded to 64 nodes. Nothing enables a previously removed node,
so closure is bounded and cannot grant a missing companion or dependency.
Relative to the initial reviewed package, the complete repair changes only
`src/plan.ts`, `README.md` and the new `test/atomic-pruning.test.mjs`.

The reviewer read the exact source delta and all four new native regressions:
required primary, optional primary, a downstream consumer with a newly orphaned
leaf, and an explicitly retained complete pair. Independently executing
`node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-policy/test/*.test.mjs`
at repair checkpoint `599fb72` produced **25/25 passing tests**, zero failures,
cancellations or skips. This includes the new regressions and all original
authority, lifecycle, diagnostic and isolation checks.

A separate reviewer-written native replay reimplemented the original scenario
with the following three cases; it did not merely reuse the new test helper:

| Policy | `canPrepare` | Request result | Paired initializer calls | Final primary / companion |
| --- | --- | --- | --- | --- |
| Required primary; absent optional root | false | `UNSUPPORTED_PROVIDER` | 0 | blocked / disabled |
| Optional primary; absent optional root | true | active, core-only | 0 | blocked / disabled |
| Required primary and explicitly selected companion | true | active | 1 | enabled / enabled |

The exact replay command was:

```sh
node --import ./scripts/test-support/register-tsx.mjs --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {createModeController,createPolicyRuntime,evaluatePolicy} from './packages/privacy-policy/index.ts';
import {createExtensionRegistry} from './packages/extensions/index.ts';
import {makeBroker} from './packages/relay/test/support/harness.mjs';
const hash='a'.repeat(64), ref=name=>({name,protocolVersion:1,schemaHash:hash});
const primary=ref('local:primary'),companion=ref('local:companion'),absent=ref('local:absent');
const node=(ref,moduleId,dependencies=[])=>({...ref,moduleId,profileId:null,mandatory:false,dependencies,conflicts:[],channels:[],unbrokeredPaths:[],dataClasses:['private']});
const catalog=[node(primary,'paired'),node(companion,'paired'),node(absent,'missing',[companion.name])];
const manifest={format:'p2p-offramp-extension',version:1,id:'paired',protocolVersion:1,coreApiVersion:1,capabilities:[primary.name,companion.name],schemaHashes:[hash]};
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const observed=[];
for(const [kind,required,retainCompanion] of [['required-primary',true,false],['optional-primary',false,false],['explicit-pair',true,true]]){
 const {broker}=makeBroker({mode:'ordinary'});let starts=0;
 const createRegistry=(generation=0,isCurrent)=>createExtensionRegistry({generation,...(isCurrent?{isCurrent}:{}),registeredCapabilities:[primary.name,companion.name,absent.name],entries:[{instance:{manifest,initialize:async()=>{starts++;return {ok:true,value:undefined}},dispose:async()=>{}}}]});
 const registry=val(createRegistry()),controller=createModeController({broker,catalog,unbrokeredPaths:[],createRegistry});
 const policy={format:'p2p-offramp-feature-policy',version:1,policyId:'independent-pruning-repro',revision:0,required:required?[primary]:[],optional:[absent,...(!required?[primary]:[]),...(retainCompanion?[companion]:[])],disabled:[],mode:'ordinary',profileIds:[]};
 try{
  const evaluation=val(evaluatePolicy(policy,val(createPolicyRuntime({broker,registry,catalog,unbrokeredPaths:[]}))));
  const result=await controller.requestMode(policy);
  const states=Object.fromEntries(evaluation.nodes.map(n=>[n.name,n.state]));
  assert.equal(evaluation.canPrepare,!required||retainCompanion);
  assert.equal(result.ok,!required||retainCompanion);
  assert.equal(starts,retainCompanion?1:0);
  assert.equal(states[primary.name],retainCompanion?'enabled':'blocked');
  assert.equal(states[companion.name],retainCompanion?'enabled':'disabled');
  if(!result.ok)assert.equal(result.error.code,'UNSUPPORTED_PROVIDER');
  else assert.equal(result.value.state,'active');
  observed.push({kind,canPrepare:evaluation.canPrepare,ok:result.ok,starts,states});
 }finally{await controller.dispose();await registry.disposeAll();broker.dispose();}
}
console.log(JSON.stringify(observed,null,2));
JS
```

The command exited 0 with the results above. Before it ran,
`git diff --quiet 599fb729d4c02b7a50746268454ec9208bd8e2a8 -- packages/privacy-policy`
confirmed the worktree's package bytes still matched the reviewed source.

Final head `8b04cfc3a03c3bd82618244bba775633174ffb45` differs from the repaired
checkpoint only in `docs/engineering/OPTIONAL_PRIVACY_POLICY_20261119.md`.
The reviewer independently verified identical package tree
`5ab375b6f3b5520bd6059ff858f48699edf53aca`, clean worktree status and
`git diff --check ac9a4b0..HEAD`. The final repository tree is
`6812e53a42e30375564fc053d0a9f9ef839d6516`. No test rerun was needed for that
documentation-only wrapper. No further High or Medium finding remains open in
this scoped review.

| Reviewer evidence | SHA-256 |
| --- | --- |
| `independent-optional-privacy-policy-repair.tap` | `897656295847b65f484d73730184e9056c7ab5fe37acdc1aac1f4d4de28b5b9c` |
| `independent-optional-privacy-policy-repair-repro.json` | `a8c88ee534795101c21f36209b998cc8c754fe1d15ec197b9c15170ed44908ff` |

## Other reviewed boundaries

The policy parser snapshots exact inert records, bounds total capability entries,
rejects conflicting classifications, and uses fixed diagnostics. Catalog bindings
include module/version/schema, dependencies, conflicts, profiles and channels.
Imported or cloned status objects do not substitute for the locally issued
runtime capability. Constructor-owned native services are trusted code inputs;
policy documents do not implement those services.

The controller acquires physical transition admission before policy or consent
reflection, freezes the old generation before invalidating permits, drains old
registry disposal, and reevaluates before active publication. Cancellation and
disposal retain admission while an abort-ignoring initializer drains. Strict-to-
ordinary transition requires separate explicit consent. Evidence revocation
retires active preparation. The tests exercise these behaviors through actual
G14 lifecycle wrappers.

The default catalog and registry contain no advanced providers. Strict privacy
is blocked by the default unbrokered static path. Outputs retain
`economicAuthority: false`; there is no wallet, escrow, payout, imported endpoint
selection or automatic provider-loading surface. These existing boundaries did
not cure the original atomic activation defect; the reviewed repair above does.

## Initial verification and overall scope

| Check | Result |
| --- | --- |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-policy/test/*.test.mjs` | 21/21 passed; zero failures, cancellations or skips |
| Focused atomic-group/pruning reproduction at initial head | Defect confirmed; full module initialized while companion was disabled |
| Original and extracted package subtree comparison | Exact identity |
| `git diff --check ac9a4b0..HEAD` and pinned worktree status | Passed; clean before the author's subsequent repair |

Test log `independent-optional-privacy-policy.tap` has SHA-256
`bc76fcc8520e7ab61c9d077abb60f906807ed589973258a9b2509cae1c165c04`.
The 21 tests include package authority checks and static isolation tests over
tracked imports/configuration, deliberately forbidden fixtures, and the actual
maintained AST boundary checker. The initial nine changed files were the package and
extraction report; no root script, workflow, configuration, dependency, lockfile,
application entry or core facade changed in either reviewed version.

The extraction author's broad TypeScript checks, default build and emitted-byte
comparison remain separate evidence. This reviewer did not duplicate the
inherited full suite or claim hosted, browser, deployed-host or production
privacy evidence. Applicable exact-head PR gates remain mandatory after repair.
No source, remote ref, deployment, release, credential or setting was changed by
this review.
