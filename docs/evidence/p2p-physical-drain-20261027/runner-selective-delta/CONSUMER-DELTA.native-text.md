# Consumer delta: interrupted fuzz runs must not pass

This is a selective two-file source delta from original shared runner v0 to the locally fixed helper/tests. It is data for the sole consumer integrator to inspect in a **NEW directory**, not an instruction to overwrite an existing runner. The P2P consumer is a different executor with its own harness changes. No consumer checkout, core runner, manifests, project code, test budgets or dependencies were replaced.

Parent reports shared Library file `libfile_10891e001ae481918162e6c01eebb8f9` v2 already native-verified with77members and this fix. This delta is for safe selective integration; **do not extract a whole checkpoint over a consumer-owned tree**. The local original v0 identity remains historical. No Library action was performed here.

## Baseline and target identities

Baseline source: `PRE-UPDATE-CHECKPOINT.md`,185846bytes/SHA256 `dc3bad3bd51b27533a235aa5942133d79cd3a8a417758554c1b36bde911c3be0`. Decoded as data using the **last** `<!-- BEGIN RUNNER_ARCHIVE_GZIP_BASE64 -->` marker (`rsplit(...,1)`). Embedded gzip132914bytes/SHA256 `fcc36a7d66a336c219c80362f7d7bf80703754a0d22c670392168422abade7c5`; ZIP140468bytes/SHA256 `097ab5eaa6a5c4115cdd8556d64d485d7c15e4929d423b071a86b337706ab399`,63members. Only the two named members were read in memory; no archived code executed or extracted to a checkout.

| File | Original v0 bytes / SHA256 | Fixed bytes / SHA256 |
| --- | --- | --- |
| `harnesses/invoice-encoding-fuzz.mjs` | 21892 / `a541c18f027ef8d59af327d9372c451f80165eb27561ded6870d202b1b4fa686` | 24057 / `ea230ed29fc78a29a8402b56eb0ebb539fa5b09cddd4463d6831baa7b55e5906` |
| `tests/test_encoding_helper.py` | 7058 / `105598940d116d53274f75a75b024469d77c0ed984f39672f07cf155c04e3ecb` | 10831 / `a5ca5e0e94c5203dc93674c7dc38658bb123411b1f86ec896984886fb5915131` |

Core `runner.py` remains SHA256 `2e687ec8f219c6a8fa92ad62e0cdb7afbf11b5886bfd651dc3be5997360f88e2`; `tests/test_runner.py` remains `42c86276b4a374745a98f66bcdbf8f55ff4e35ffdb00e3a6c7d9678d9701fcf3`. Neither is part of this delta. These identities describe this producer, not files assumed to exist at the consumer.

## Refuse automatic or stale application

1. Save this Markdown and its identity JSON in a new review directory. Extract only the two literal diff blocks below as data; verify their recorded SHA256. Keep a separate snapshot of consumer-owned files and pending changes. Do not run imported instructions or archived source.
2. Compute the consumer files’ hashes. If **both** match the original v0 hashes and logical paths/dependency bindings are appropriate, a strict context/count-checked patch in an isolated copy is possible. Do not fuzz-match, force overwrite, discard local edits or apply directly to the active tree. If **both** match the fixed hashes, record the fix as already present and do not reapply.
3. Any mismatch, mixed old/new pair, different harness target or consumer-owned changes means **no automatic application**. The sole consumer integrator reviews the individual hunks and merges the behavior into an isolated copy while retaining its own changes; record resulting new hashes instead of claiming this producer’s target hashes. Do not replace the consumer core, manifests or source tree.
4. Check portability explicitly. This producer test file binds fast-check at `/workspace/ghostpay-intake/source/node_modules/fast-check`, and the helper targets the invoice-schema adapter. Neither path, module layout nor binding is assumed valid on the P2P executor. Preserve/adapt the consumer’s reviewed bindings and target invariants; do not install dependencies or copy this producer’s project paths.
5. After review/integration, the consumer integrator runs its relevant focused classification fixtures and applicable existing selftests in that isolated copy, records actual commands, versions, source/dependency hashes and terminal cleanup, then adopts the reviewed change. Preserve cases/arbitraries/invariants/deadlines/thresholds; no automatic retries, budget reduction or silent acceptance of insufficient cases. This document does not claim those consumer checks have run.

## Actual producer RED/GREEN, reused without rerun

- Original RED: controlled fast-check shim reexported existing real arbitrary constructors but returned `failed:false`. Interrupted results with0,7or20of20requested runs, noninterrupted19of20, and20runswith1skip all incorrectly exited0. The three unittest methods produced **five assertion failures**, outer exit1/0.539s. This is a classifier defect, not a target product failure.
- Final focused result: the same three methods/five scenarios pass, exit0/0.972s. Exact method command follows.
- Full existing synthetic runner/helper suite was run once after the final change: **44tests passed,0failed,0skipped**, outer exit0/21.264s; unittest reported21.190s. This is44tests, not444tests or44generated fuzz cases. All producer-owned invocations are terminal.
- One intermediate post-fix attempt failed only because a new assertion expected plaintext rather than the existing bounded UTF16hex corpus representation. It remains `FOCUSED-GREEN.{json,log}` with actual exit1; its preselected filename is not a pass claim. Final successful attempt is `FOCUSED-02`.
- Original real Ghost650case demonstration belongs to old helper hash `a541c18f…` and remains unchanged. No prior run is claimed interrupted, and no real Ghost/browser/million-case test was rerun to produce this delta.

Executed focused argv (cwd `/workspace/module-test-runner/tests`):

```text
/usr/bin/python3 -m unittest -v test_encoding_helper.EncodingHelper.test_interrupted_nonfailed_results_never_pass test_encoding_helper.EncodingHelper.test_short_noninterrupted_result_is_incomplete_with_provenance test_encoding_helper.EncodingHelper.test_skipped_result_is_not_an_ordinary_pass
```

Executed full-suite argv (cwd `/workspace/module-test-runner`):

```text
/usr/bin/python3 -m unittest discover -s tests -v
```

| Preserved evidence in interruption-guard-11 | SHA256 |
| --- | --- |
| `RED.log` | `d27fbe6a068fc66b72ba61589485f870e0c38f27da276bcf34296aa07ef9f61e` |
| `RED.json` | `abf539138187d98e206bc0d4f69ebe07354578ca3097132acf04ef37d94a993c` |
| `FOCUSED-02.log` | `082006e2fab80ec2a8df9b47ad3d90ce89003c41b61deda535d8709c59a96090` |
| `FOCUSED-02.json` | `3e05ca1950557318a97bc33c96867aeeeb614468f143ddeb7a763c6c801f94d9` |
| `SELFTESTS-11.log` | `900723593ee68ac23be33595b7d408bfcf647e94a6a6dc3b6d675244af9aed44` |
| `SELFTESTS-11.json` | `69889b8503a2bc6786c302b7e129959942f495ac6d82c6190e23954a465de8a6` |
| `RESULT.json` | `53ad13ed5c1083f26ff3d22786513dee3de2ca22a76e86ba959da91f073362d9` |

## Terminal classification and replay limits

Ordinary property pass now requires `failed:false`, `interrupted:false`, valid nonnegative integer counts, `numRuns===requested_numRuns` and `numSkips===0`. Interrupted/nonfailed results are `status:"interrupted"`; short/skipped/malformed results are `status:"incomplete"`. A real failing property remains `status:"fail"`. Any nonpass makes helper exit1; the generic runner’s eight job statuses remain unchanged, with explicit helper diagnostic in retained metrics. No logical interruption is misreported as a product counterexample or a completed pass.

Each property retains interrupted flag, requested/returned counts, seed, available shrink path, bounded counterexample and reason. Totals count interrupted/incomplete properties. Metrics add harness/target/fast-check **entry-file** hashes, argv and metrics path; these are not a complete dependency-closure hash. Actual project Git snapshots and stdout/stderr paths belong to the calling runner; the standalone helper does not invent them.

Corpus strings preserve up to120UTF16code units as hex plus original length/truncation flag; byte arrays preserve up to256bytes as hex plus length/truncation flag. Arrays/objects are capped at16entries and nesting depth6. This is exact within the stated string/byte bounds, **not a lossless general corpus archive**. Keep seed/shrink path plus exact arbitrary/harness/dependency versions for reproducibility. The helper has no path-replay CLI switch or automatic replay/resume/retry. No coverage-guided engine is implied.

## Minimal literal diffs

### Diff1: harnesses/invoice-encoding-fuzz.mjs

Diff bytes6142, SHA256 `fab364c108495ce66bb29b980d701588dd7184fc257ed368d8d353a47ef1be7e`. Strict in-memory literal reconstruction from verified v0 bytes produced the exact fixed hash; no checkout patch was executed.

```diff
--- a/harnesses/invoice-encoding-fuzz.mjs
+++ b/harnesses/invoice-encoding-fuzz.mjs
@@ -1,11 +1,13 @@
 #!/usr/bin/env node
 // Seeded property/mutation encoding fuzz harness for invoice-schema.
 // NOT coverage-guided. No network, installs, or source writes.
-// Exit codes: 0 all pass, 1 property failure, 2 prerequisite/argument/setup failure.
+// Exit codes: 0 all requested cases pass, 1 failed/interrupted/incomplete run,
+// 2 prerequisite/argument/setup failure.
 
 import fs from 'node:fs';
 import path from 'node:path';
-import { pathToFileURL } from 'node:url';
+import { createHash } from 'node:crypto';
+import { pathToFileURL, fileURLToPath } from 'node:url';
 
 const MAX_BYTES = 2048;
 const MAX_UNITS = 300;
@@ -317,7 +319,8 @@
   // ---- run ----
   const results = [];
   let anyFail = false;
-  const totals = { properties: 0, numRuns: 0, numSkips: 0, numShrinks: 0 };
+  const totals = { properties: 0, numRuns: 0, numSkips: 0, numShrinks: 0,
+    interrupted_properties: 0, incomplete_properties: 0 };
   for (const p of properties) {
     let rec;
     try {
@@ -327,22 +330,38 @@
         }),
         { seed: args.seed, numRuns: args.cases, verbose: 0 }
       );
+      const interrupted = res.interrupted === true;
+      const countIsValid = v => Number.isSafeInteger(v) && v >= 0;
+      const countsValid = [res.numRuns, res.numSkips, res.numShrinks].every(countIsValid);
+      const incomplete = !countsValid || res.failed !== false || res.interrupted !== false
+        || res.numRuns !== args.cases || res.numSkips !== 0;
+      const status = res.failed === true ? 'fail' : interrupted ? 'interrupted' : incomplete ? 'incomplete' : 'pass';
+      const diagnostic = status === 'interrupted'
+        ? `fast-check interrupted; returned numRuns=${res.numRuns}, requested=${args.cases}, skips=${res.numSkips}; no complete-run acceptance`
+        : `fast-check incomplete measurement; returned numRuns=${res.numRuns}, requested=${args.cases}, skips=${res.numSkips}; no complete-run acceptance`;
       rec = {
         id: p.id,
         encoding: p.encoding,
         invariant: p.invariant,
-        status: res.failed ? 'fail' : 'pass',
-        numRuns: res.numRuns,
-        numSkips: res.numSkips,
-        numShrinks: res.numShrinks,
-        counterexamplePath: res.failed ? res.counterexamplePath ?? null : null,
-        counterexample: res.failed ? sanitize(res.counterexample && res.counterexample.length === 1 ? res.counterexample[0] : res.counterexample) : null,
-        failure_message: res.failed ? bounded(res.errorInstance && res.errorInstance.message ? res.errorInstance.message : String(res.error || 'property failed'), 300) : null,
+        status,
+        interrupted,
+        requested_numRuns: args.cases,
+        seed: Number.isSafeInteger(res.seed) ? res.seed : args.seed,
+        numRuns: countIsValid(res.numRuns) ? res.numRuns : 0,
+        numSkips: countIsValid(res.numSkips) ? res.numSkips : 0,
+        numShrinks: countIsValid(res.numShrinks) ? res.numShrinks : 0,
+        counterexamplePath: res.counterexamplePath ?? null,
+        counterexample: res.counterexample == null ? null : sanitize(res.counterexample.length === 1 ? res.counterexample[0] : res.counterexample),
+        failure_message: status === 'fail'
+          ? bounded(res.errorInstance && res.errorInstance.message ? res.errorInstance.message : String(res.error || 'property failed'), 300)
+          : status === 'pass' ? null : bounded(diagnostic, 300),
       };
     } catch (e) {
-      rec = { id: p.id, encoding: p.encoding, invariant: p.invariant, status: 'fail', numRuns: 0, numSkips: 0, numShrinks: 0, counterexamplePath: null, counterexample: null, failure_message: bounded('harness error: ' + (e && e.message), 300) };
+      rec = { id: p.id, encoding: p.encoding, invariant: p.invariant, status: 'fail', interrupted: false, requested_numRuns: args.cases, seed: args.seed, numRuns: 0, numSkips: 0, numShrinks: 0, counterexamplePath: null, counterexample: null, failure_message: bounded('harness error: ' + (e && e.message), 300) };
     }
-    if (rec.status === 'fail') anyFail = true;
+    if (rec.status !== 'pass') anyFail = true;
+    if (rec.status === 'interrupted') totals.interrupted_properties += 1;
+    if (rec.status === 'incomplete') totals.incomplete_properties += 1;
     totals.properties += 1;
     totals.numRuns += rec.numRuns;
     totals.numSkips += rec.numSkips;
@@ -376,6 +395,14 @@
     seed: args.seed,
     requested_cases_per_property: args.cases,
     method: METHOD,
+    provenance: {
+      harness: artifactIdentity(fileURLToPath(import.meta.url)),
+      fast_check_entry: artifactIdentity(fcPath),
+      target_entry: artifactIdentity(schemaPath),
+      argv: [process.execPath, ...process.argv.slice(1)],
+      metrics_file: args.output,
+      log_capture: 'stdout/stderr paths and full project source identity are retained by the calling runner when used; unavailable to this standalone helper',
+    },
     controls: [{ id: 'memo-envelope-positive', status: memoControl.ok && memoControl.value?.memo === 'ok memo' ? 'pass' : 'fail', invariant: 'validatePrivatePart accepts lineItems:[] and exact synthetic ok memo before rejection oracles' }],
     properties: results,
     totals,
@@ -383,8 +410,15 @@
   };
   fs.mkdirSync(path.dirname(args.output), { recursive: true });
   fs.writeFileSync(args.output, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
-  process.stdout.write('properties=' + totals.properties + ' numRuns=' + totals.numRuns + ' failed=' + results.filter((r) => r.status === 'fail').length + '\n');
+  process.stdout.write('properties=' + totals.properties + ' numRuns=' + totals.numRuns
+    + ' failed=' + results.filter((r) => r.status === 'fail').length
+    + ' interrupted=' + totals.interrupted_properties + ' incomplete=' + totals.incomplete_properties + '\n');
   process.exitCode = anyFail ? 1 : 0;
+}
+
+function artifactIdentity(file) {
+  return { path: file, resolved_path: fs.realpathSync(file),
+    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
 }
 
 main().catch((e) => {
```

### Diff2: tests/test_encoding_helper.py

Diff bytes4604, SHA256 `1e9c619dc767baac103bc8c7244b5a04071be1816b19b625b3a4c13d486d903c`. Strict in-memory literal reconstruction from verified v0 bytes produced the exact fixed hash; no checkout patch was executed.

```diff
--- a/tests/test_encoding_helper.py
+++ b/tests/test_encoding_helper.py
@@ -68,8 +68,66 @@
         self.exports.write_text(FAKE_TARGET.replace('__FAULT__',json.dumps(fault)))
         cmd=[NODE,str(ROOT/'harnesses/invoice-encoding-fuzz.mjs'),'--project-root',str(self.project),'--seed','1592598566','--cases',str(cases),'--output',str(output or self.output)]
         result=subprocess.run(cmd,env=self.env,capture_output=True,text=True,timeout=20)
-        metrics=json.loads(self.output.read_text()) if self.output.exists() else None
+        metrics_path=output or self.output
+        metrics=json.loads(metrics_path.read_text()) if metrics_path.exists() else None
         return result,metrics
+
+    def controlled_check_result(self, *, interrupted=False, num_runs=20, num_skips=0):
+        """Use real arbitrary constructors, but control only check's result."""
+        package=self.project/'node_modules/fast-check'
+        if package.is_symlink():
+            package.unlink()
+        (package/'lib').mkdir(parents=True,exist_ok=True)
+        (package/'package.json').write_text('{"type":"module"}')
+        actual=(FC/'lib/fast-check.js').resolve().as_uri()
+        details={'failed':False,'interrupted':interrupted,'numRuns':num_runs,
+                 'numSkips':num_skips,'numShrinks':0,'seed':1592598566,
+                 'counterexamplePath':'0:1','counterexample':['retained synthetic corpus']}
+        (package/'lib/fast-check.js').write_text(
+            'export * from '+json.dumps(actual)+';\n'
+            'export async function check() { return '+json.dumps(details)+'; }\n')
+
+    def test_interrupted_nonfailed_results_never_pass(self):
+        for num_runs in [0,7,20]:
+            with self.subTest(num_runs=num_runs):
+                self.controlled_check_result(interrupted=True,num_runs=num_runs)
+                result,metrics=self.run_helper(output=self.base/f'interrupted-{num_runs}.json')
+                self.assertNotEqual(result.returncode,0,result.stdout)
+                self.assertTrue(all(p['status']=='interrupted' for p in metrics['properties']))
+                self.assertTrue(all(p['interrupted'] is True for p in metrics['properties']))
+                self.assertTrue(all(p['numRuns']==num_runs for p in metrics['properties']))
+                self.assertTrue(all(p['requested_numRuns']==20 for p in metrics['properties']))
+                self.assertTrue(all(p['seed']==1592598566 for p in metrics['properties']))
+                self.assertTrue(all(p['counterexamplePath']=='0:1' for p in metrics['properties']))
+                for prop in metrics['properties']:
+                    corpus=prop['counterexample']
+                    self.assertFalse(corpus['truncated'])
+                    self.assertEqual(bytes.fromhex(corpus['utf16_hex']).decode('utf-16-be'),'retained synthetic corpus')
+                self.assertTrue(all('interrupt' in p['failure_message'].lower() for p in metrics['properties']))
+                self.assertEqual(metrics['totals']['numRuns'],13*num_runs)
+                self.assertEqual(metrics['totals']['interrupted_properties'],13)
+
+    def test_short_noninterrupted_result_is_incomplete_with_provenance(self):
+        self.controlled_check_result(num_runs=19)
+        result,metrics=self.run_helper()
+        self.assertNotEqual(result.returncode,0,result.stdout)
+        self.assertTrue(all(p['status']=='incomplete' for p in metrics['properties']))
+        self.assertTrue(all(p['interrupted'] is False for p in metrics['properties']))
+        self.assertEqual(metrics['totals']['numRuns'],13*19)
+        self.assertEqual(metrics['totals']['incomplete_properties'],13)
+        self.assertEqual(metrics['seed'],1592598566)
+        for key in ['harness','fast_check_entry','target_entry']:
+            self.assertRegex(metrics['provenance'][key]['sha256'],r'^[0-9a-f]{64}$')
+        self.assertIn('--seed',metrics['provenance']['argv'])
+        self.assertEqual(metrics['provenance']['metrics_file'],str(self.output))
+
+    def test_skipped_result_is_not_an_ordinary_pass(self):
+        self.controlled_check_result(num_runs=20,num_skips=1)
+        result,metrics=self.run_helper()
+        self.assertNotEqual(result.returncode,0,result.stdout)
+        self.assertTrue(all(p['status']=='incomplete' for p in metrics['properties']))
+        self.assertEqual(metrics['totals']['numRuns'],13*20)
+        self.assertEqual(metrics['totals']['numSkips'],13)
 
     def test_reference_target_passes_and_measures_generated_cases(self):
         result,metrics=self.run_helper()
```

Only this new delta Markdown and its identity JSON were written for this task. No tests, API/network/Library calls, source edits or checkpoint replacement occurred.