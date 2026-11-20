# Generation 37 correction — coherent proposal snapshots at idle expiry

## Result

A concrete independent review finding exposed a controller exception when the idle deadline crossed during a proposal snapshot. The correction separates pure ownership-reference projection from authority-bearing currentness validation. A maintained regression reproduces the original null dereference and passes after the fix. **100/100 targeted and adjacent cases pass**, followed by all four TypeScript projects, static boundaries and full main-baseline whitespace.

| Identity | Exact value |
| --- | --- |
| Original G37 app source, retained unchanged | `107ce93d030298f2668285067e156979c883184d` |
| Original author evidence / corrective parent | `cc144c69b7ee190880aff7f51a86d74fde863522` |
| Corrective source | **`3ccf809e01e729980b3ab5fbe12ba3993fbe9982`** |
| Complete corrective source tree | `d04ac2f61e50022e8f2c4439b1142d4ddeb15320` |
| Independent failing combined source | `cbda12a11c24014e2a791d058460e642bad9f995` |
| Independent failing combined tree | `1549b5ba9077244e43720edbb1072eceeb6abb60` |

The source change is confined to the [controller](../../apps/web/src/solana-localnet/controller.ts), its [controlled monotonic-clock fixture](../../apps/web/test/solana-funding-flow-support.mjs) and one [maintained regression](../../apps/web/test/solana-localnet-funding-flow.test.mjs). It changes no economic rule, message, native client, journal, wallet bridge, configuration, deadline duration, margin, trust setting, native driver or release setting.

## Finding and narrow repair

The original snapshot first called `#current()` to decide whether private data could be projected. While mapping proposals, its `walletConnected` field called `#ownsFunding()`, which called `#current(owner.epoch)` again. That second read could observe expiry and synchronously clear the session and inventories. The outer projection still held `open=true` and later dereferenced the now-null session.

The independent controlled reproduction connects a saved proposal while monotonic time is zero, then supplies 299,999 milliseconds for the next read and 300,000 thereafter. The existing idle deadline is 300,000. On its recorded combined source, `snapshot()` throws a null-profile dereference. The independently captured controller blob is byte-identical to the original author source; the finding is attributed to that actual combined execution, not claimed as an author run.

The new `#fundingReferences()` predicate only compares the retained epoch, proposal, original bound trade, actual client/wallet and current session/profile references. Snapshot uses it after its initial currentness admission, so projection itself cannot revoke the session midway through assembling a view.

Every authority-bearing path continues to use `#ownsFunding()`, which still executes the original `#current(owner.epoch)` validation before checking the same references. Native private ownership, lease validity, epoch checks, preparation/confirmation expiry and all existing action-side guards remain in force. Optional chaining in the pure comparison makes absence a false ownership result rather than dereferencing a missing session.

A snapshot admitted immediately before expiry may return one coherent ready view. The next snapshot that observes expiry must be completely redacted. The regression accepts that coherent boundary behavior; it does not add redundant clock reads merely to force an earlier lock. It also verifies the subsequent funding command returns `LOCKED` and performs no RPC, preparation, signature or send.

## Exact verification and failure preservation

| Execution | Result | Source attribution |
| --- | --- | --- |
| Independent original expiry probe | **0/1**, null-profile exception | Recorded combined `cbda12a`; original log/probe/tree snapshot retained |
| Maintained regression before production fix | **0/1**, same null-profile exception | Parent `cc144c6` plus retained test-only patch, tree `7f1006f59ddd513bbd9c3b913e769a72cc5eb5e5` |
| Maintained regression plus controller, proposal admission, TSX/document-client and wallet-bridge selection | **100/100**, zero other outcomes | Exact precommit corrective tree `d04ac2f`, retained binary patch |
| Corrective-source TypeScript | All four projects pass | Frozen `3ccf809` |
| Corrective-source import boundaries | **244 production files / 157 core graph modules** | Frozen `3ccf809` |
| Full whitespace against main `8e836baa877b676a863c877003e277b638fc5061` | Pass without exclusions | Frozen corrective source and evidence |

The 100-case selection ran from **2026-11-20 21:24:59.751921 to 21:25:10.280386 UTC**. Its complete 9,864-byte log has SHA-256 `f7162e92aeb64db270aeba856549bec808163769b3203f594694e0ac57b0540f`. The preceding maintained failure ran at 21:24:38–21:24:39 UTC and retains its complete 1,015-byte log, SHA-256 `fc79b3edbbd134de00efb0b6486323a0ee2a40b09eaaa450fad62796479f6ae4`.

The independent original log is 1,115 bytes with SHA-256 `f1324de2c0e4dcedbb348547ae50b5eaa1458e070c93e648f69af1a56fbb765b`. Its original receipt, complete failing probe snapshot, companion probe snapshot and full source-tree snapshot are preserved separately. The original failure occurs before the probe's initial-state assertion; later clarification to accept either coherent boundary view does not erase or replace that failure. The maintained baseline already uses the coherent-view assertion and still reproduces the actual exception.

All four new author execution trees reconstruct exactly from their recorded HEAD and retained binary patches. The passing selection occurred before the corrective source commit but on its exact complete tree; it is not claimed as another run on the later commit. The prior 208-case initial-source qualification remains unchanged historical evidence and is not transferred to the corrected source. These overlapping counts are not added.

## Evidence and remaining qualification

This correction retains **23 gzip artifacts** with raw/compressed lengths and SHA-256 hashes and zero gzip timestamps: four author execution receipts/logs/patches, source mapping and patch, the runner and packaging verifier, the coordinator contract, and the independently captured original failure materials. The corrective source still has **1,042 non-documentation entries**; evidence adds documentation only. Every earlier source and evidence commit remains intact.

No full-repository suite, build, browser, validator, native financial journey, dependency installation, remote mutation or release occurred in this correction task. The native companion owner is separately checking whether its captured build-only inputs include any corrected path; equivalence is not assumed. Root owns one fresh combined-source qualification after mapping this actual correction, and the independent reviewer owns its corrected-source revalidation.

The original G37 implementation remains described in the [initial report](SOLANA_BROWSER_FUNDING_FLOW_GENERATION37_20261120.md). Its dated qualification and this corrective qualification have distinct source identities. Actual-source/actual-target hosted acceptance and matching Tier C owner authorization remain separate. **`ReleaseEnabled=0`.**

- [Corrective receipt and retained artifacts](../execution/solana-browser-funding-snapshot-correction-generation37-20261120/receipt.json)
