# Historical S04 EVM wallet-execution regression recovery — 2026-11-23 UTC

## Source identities and scope

Fresh authenticated GitHub source readback against `djshellshoxxx/p2p-offramp` and exact current main `01f6f4feca051d68de24a04299cd3bb444bce40c` (tree `437323a382952b9623a875c818f8af005a5d4563`). Historical stage `claude/loving-einstein-xgzvdy-s04-wallet-release@4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2` retains wallet-execution regression file blob `66246d3a824c900cf7e2d714d4d66670d15fa4da`. Main has test blob `d08491dabbe6c6f46a6617656bc8de5ebe2b3d31`, parent draft [PR247](https://github.com/djshellshoxxx/p2p-offramp/pull/247) head `3f23c774b2464b04de6cfece9ab1721dd5130f86` test blob `de53e46750c63b6a14685dbcf9bec054509bba18`, and child draft [PR248](https://github.com/djshellshoxxx/p2p-offramp/pull/248) head `4fc269e4fe17b8aaa9f315c29f726071f3834f5e` test blob `ca324dfe61554936cd3478dc93e151c508f89179`.

The historical file has **20 named test declarations**, eleven of which are already represented in main; main has **12** including its newer separate D9 marker-uncertainty regression. The historical **nine additional named admission/signal scenarios are absent from main, but all nine occur on the child PR248 head**. Five first appear in PR247; the remaining four appear in PR248. These are staged, **NOT merged or validated on current main**. Original PR40 and S04 source branches remain intact.

| Historical scenario (exact title prefix) | main | PR247 | PR248 |
|---|---|---|---|
| final account accessors are rejected without invocation or a send attempt | absent | present | present |
| scope retirement during final account reflection prevents invocation and preserves the unknown marker | absent | present | present |
| scope retirement while capturing the final request capability prevents its invocation | absent | present | present |
| disposal during the last current callback prevents invocation despite a true return | absent | present | present |
| disposal in the initial current callback starts no validator or provider work | absent | present | present |
| malformed and throwing signal hooks return fixed input errors before work and do not strand admission | absent | absent | present |
| native signal | absent | absent | present |
| overridden signal hooks preserve prompt | absent | absent | present |
| native signal reflection cannot start work after retiring its owner | absent | absent | present |

The five PR247 cases cover own-descriptor account admission, scope retirement during final reflection, final request-capability capture and both disposal reentry boundaries. PR248 adds four historical hostile/native AbortSignal cases, including the two dynamically composed test-title groups. The current-main D9 marker-failure regression is retained in both drafts. This establishes **named-source test recovery** and direct Git blob provenance, not complete patch-ID or whole-tree equivalence.

## Git ancestry and current hosted evidence

- `main...PR247`: merge base `01f6f4feca051d68de24a04299cd3bb444bce40c`, two ahead, zero behind, three changed files.
- `PR247...PR248`: merge base `3f23c774b2464b04de6cfece9ab1721dd5130f86`, two ahead, zero behind, three changed files. Original historical S04 application source must **not** replace current code wholesale.
- The exact PR247 source has **14/14 completed-success GitHub check runs**, including CodeQL. PR248 has **11/11 completed-success reported check runs**; CodeQL is **not** among those eleven. These are separate source/target qualifications and cannot be transferred between PRs.
- PR247 has no submitted review in the readback. PR248 has a scoped **COMMENTED** review, not Tier C approval. Both remain **DRAFT, OPEN, UNMERGED**, and recorded owner authorization plus required current-target financial/native/security acceptance remain outstanding.

The `evm-execution.ts` boundary is explicitly documented as **test-only**, not imported/bundled by the application. No production exploit or live-fund effect is inferred from this regression recovery. The updated tests do not establish full signed-update, EIP-1271, Solana escrow, or release acceptance.

## Reconciliation decision and remaining gates

**Keep S04 classification V (partially reconciled).** The nine historically missing EVM execution test scenarios now have source-bound draft recovery through PR247 → PR248, but neither PR is in main. The S04 stage also has other divergent paths and a native EIP-1271 fixture/harness retained separately through PR246 → PR249 → PR250; these still need exact-source/target review and acceptance. The complete historical S04 commit range, patch-IDs/range-diff and the other 38 previously divergent changed paths were **not** exhaustively reconciled by this focused pass. Do not mark S04 complete, merge old source, count absent checks as success, or waive Tier C/owner/native gates.

Next actionable work: qualify and independently review PR247, then PR248 against its actual parent and eventually current main, checking Git tree/ordered parents and durable marker/retry-safe semantics. Separately continue unblocked nonfinancial historical cohorts while parent approvals are pending. Release stays disabled.

## Inventory and execution boundaries

Fully paginated REST inventory checked on 2026-11-23: **262 remote branches across pages 100/100/62; 247 PR records across pages 100/100/47**, of which 65 open, 124 merged and 58 closed without merge. Stable classification **A137/P64/F34/C5/E0/V21/B1/D0**. No local Anvil, Node test runner, browser, native Solana journey or additional red-green execution was performed in this focused provenance pass; GitHub hosted checks above belong only to their exact prior PR sources. Main remained `01f6f4feca051d68de24a04299cd3bb444bce40c`. No main merge, forced ref movement, source branch deletion, default feature activation, funds, release or deployment.
