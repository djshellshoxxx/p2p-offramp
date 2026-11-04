# Final native acceptance evidence review

**Eleven scoped command logs are consistent; no issue found.** Source remains clean at `a2b414f60c6ceedaa6388701eca7737dfcc7cb12`. Every raw SHA256 matches the run ledger, each recorded exit is 0, and stdout commands match the committed npm scripts. No suites were rerun.

The failed-release CLI case preserves a real status 0x0/TX_REVERTED transaction and then performs the first distinct timeout refund; the asserted nonce delta permits exactly fund, failed release, fund and two refunds. The UI/Worker native+ERC20 journey records **11 submissions / 16 signatures / 32 explicit reviews**, with one actual broker/two controlled pools, strict refusal, fresh ordinary acknowledgement, held close/admission and durable unknown-marker checks.

Retention’s 15 actual cases exercise complete closure, deferred/zero credit, cancel/lock/stale-CAS and conservative dependency protection, plus old-backup restore. Review/deletion performs **zero sends and zero reconciliation journal writes**. Its 2 seed and 2 withdrawal-phase fixture calls remain separate (the latter are receiver setup plus actual withdrawal). The distribution test is top-level awaited; TAP completes 1/1 with 3 nested smoke checks. It remains unsigned/unpublished/local-header-only.

All 596 retention input hashes match current files:112 root-tracked files also match git-show a2;454 vendor files match 5 clean pinned recursive submodules;30 installed module files match logged bytes and their 6 package versions match the committed lock. All 128 rendered modules are included. The retained solc executable matches its logged hash. Temporary emitted assets were cleaned up and were not independently rehashed.

The earlier root 1,712-case package run remains attributed to `a1cda13`, not a2. All 502 captured package/App source/test/config rows independently match that original source, current a2 and working-tree bytes, supporting unchanged-source reuse.

Original failures and qualification limits remain preserved. This evidence does not qualify production carriers/providers, physical devices, published headers, signed releases, a fresh install/lab or future merge/hosting outcomes. The reviewer edited no source/ledger/log and made no commit.

## Commands and exact log hashes

| # | Command | Completed scope | Log SHA256 |
|---|---|---|---|
| 1 | `test:evm:local` | 8 local trade checks | `273a4840c3e3aa3426bae35f1e6f982a7ac56cc0b2231316622746bb263ff2ed` |
| 2 | `test:exchange:evm` | 12 exchange checks | `46b917df97435f982abaf4f1a03480156b3b451b3ec3881509af211d4f7143af` |
| 3 | `test:payment:preflight` | 6 receipt cases +7 native preflight checks | `7fe44fc4a3d3ea8958b9cc242332662a7519a5005e90ab7f866ffd8c2eddf93c` |
| 4 | `test:evm:reconcile` | 9 reconcile checks | `08754773888141d9d0fd4dce59d732579ccdb1f6d7f5495e319e417e31cf2959` |
| 5 | `test:recovery:evm` | 12 recovery cases +6 native checks | `ce57441886d9ed4d196fdaff2bcc3919ab71a909bddf70ea39b56c0ec53565fb` |
| 6 | `test:sepolia:kit` | 18 deployment/hygiene cases +11 kit checks | `a2e74e4e6379153b1f146cd4e8afbced5e2f7163332384a48e3ff9e0a0f48a32` |
| 7 | `test:sepolia:trade` | 12 state cases +13 native trade checks | `c52ec76d0800fc87866356cc48c53c438125119e82d1ab8e6a7c7f14cd1a973d` |
| 8 | `test:eip1271:local` | 5 native EIP1271 checks | `b37fd27670be5fa4d8e0fcc596febf9baae0eac8b1e47ea42b7dc43e83a2cbae` |
| 9 | `test:journey:browser` | 11 submissions /16 signatures /32 reviews | `41a4c64060e96413e9febcfe29645a6f4031481d6e6b93eb74187810b830e341` |
| 10 | `test:retention:browser` | 15 actual retention cases | `c60d3bffc67862248fec074f6435b8521bfc93d6c3076d8947ac56267168faa7` |
| 11 | `test:distribution:browser` | 1 awaited test /3 nested checks | `08c115f2e802ca47e19cad264e853e852d861141297f7aecc67909acf84ec581` |
