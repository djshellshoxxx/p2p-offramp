# Merge ledger

Initial main: [`6c38e641e24abcfdcf645f864bd64c9645836d75`](https://github.com/djshellshoxxx/p2p-offramp/commit/6c38e641e24abcfdcf645f864bd64c9645836d75).
Current product checkpoint: [`91ee6991d4527bba0e76b048a76e65ed7693c5a1`](https://github.com/djshellshoxxx/p2p-offramp/commit/91ee6991d4527bba0e76b048a76e65ed7693c5a1).
All entries are source integration only; `ReleaseEnabled=0`.

## Direct PR merges executed in this run

| PR | Source branch and exact source SHA | Resulting main merge | Resulting tree / verification |
| --- | --- | --- | --- |
| [#169](https://github.com/djshellshoxxx/p2p-offramp/pull/169) | `integration/docs-reconciliation-20261118` — `db3198379a0c9e12b3f1415ce09256cce18a01d7` | [`9620890feba318d01493e713e1a79abfd733e0c7`](https://github.com/djshellshoxxx/p2p-offramp/commit/9620890feba318d01493e713e1a79abfd733e0c7) | Full 15-file documentation review; source ancestry and exact-head required CI verified |
| [#166](https://github.com/djshellshoxxx/p2p-offramp/pull/166) | `integration/core-hardening-20261118` — `9bc9aa83d740891a01522b7398f5fd3e4049b3e8` | [`22711c16847133be0d6de39fdf31dd7372be4e7a`](https://github.com/djshellshoxxx/p2p-offramp/commit/22711c16847133be0d6de39fdf31dd7372be4e7a) | `d79839bf256a419b1d905ed15352ded877d18ea9`, exact locally predicted combined tree |
| [#167](https://github.com/djshellshoxxx/p2p-offramp/pull/167) | `integration/solana-core-qualification-20261118` — `c277a9383f1712d70e94807a376dc8fc3f5c43e1` | [`e17b4d34097ca97c21e621547a38766c0271fbde`](https://github.com/djshellshoxxx/p2p-offramp/commit/e17b4d34097ca97c21e621547a38766c0271fbde) | `ba0b017d74c6a5cc3c8d850ffd1b179a6ce097f4`, exact locally predicted combined tree |
| [#170](https://github.com/djshellshoxxx/p2p-offramp/pull/170) | `feature/erc20-browser-continuation-20261118` — `189f7b1ddfc1b53be7da84cc2a24c9a745d43585` | [`91ee6991d4527bba0e76b048a76e65ed7693c5a1`](https://github.com/djshellshoxxx/p2p-offramp/commit/91ee6991d4527bba0e76b048a76e65ed7693c5a1) | `c494301afcf9577175d68f64dda924d6b8fe3c39`, exact locally predicted combined tree |

[MERGE-LEDGER.json](MERGE-LEDGER.json) records every integrated path, source branch/head, merge parent and resulting tree for each direct operation. Full PR states and check URLs are in [BRANCH-INVENTORY.json](BRANCH-INVENTORY.json). The #166 scope is wallet, payment,
chain/recovery and D1 hardening; #167 adds native Solana lifecycle, encrypted journal
and funded recovery; #170 brings native/ERC-20 browser composition and repaired
Worker boundaries. Required checks and independent reviews are detailed in
[TEST-RESULTS.md](TEST-RESULTS.md). These qualified stack merges had no unresolved
source conflicts. The repair-only conflicts appear in the separate conflict ledger.

## Append-only audit ledger merge

After the qualified product stack, [#138](https://github.com/djshellshoxxx/p2p-offramp/pull/138)
passed all seven required and three CodeQL checks at
`6fbb0872ad1bad16e4a0e269e75843ec9031aa73`. The complete append-only ledger and audit
107's changed source pins were independently reviewed. It merged as
[`80375193f16082c582a1faf2c6ba598f9eca532a`](https://github.com/djshellshoxxx/p2p-offramp/commit/80375193f16082c582a1faf2c6ba598f9eca532a),
with verified predicted tree `6be72aa4282328654a9243e91f4d9259624e0196`.
The only delta from `91ee699…` is 218 appended ledger lines. A current-main spec
check passed; the product source remains identical to the tested `91ee699…` baseline.
This brings direct merge operations to five.

## Source PRs recognized as merged through ancestry

| Consolidation | Source PR | Exact preserved tip |
| --- | --- | --- |
| #169 | #136 | `014a10a148f8b3b69c9d650fbcb083c8142e7d28` |
| #169 | #139 | `708d937df7e4799e4ad212b3293bec923f619940` |
| #169 | #164 | `436b591a3a750bcca2327117e487336f6dd77470` |
| #169 | #165 | `1fe5ae00ed2105633081d71a67db2b5436da9c8d` |
| #167 | #152 | `37f074dd1d65d5f12b73182420998a152374b813` |
| #167 | #153 | `b7d06fed31fb7d2793da99c23f15bf6795a82b8a` |
| #167 | #157 | `f1d9dd63a2ac9d55912899f8c6233456ebf8a499` |
| #167 | #158 | `0b0ca2907b372071471d7e060d0a80178d4294c9` |

All eight were re-fetched after integration and reported merged. They are not
counted as eight additional direct merge operations. #153's old failing CI is
preserved as historical evidence; its repaired integrated descendant passed its
own checks.

## Repaired parent incorporated without a separate merge

Original #168 head: `a0be1b656b977d0356768817d99d8aeb42c7bcba`.
The React-key repair `81135167ed762f8953fb6e2218ef48240a3fdf08` and EIP-1193 request
repair `189f7b1ddfc1b53be7da84cc2a24c9a745d43585` already existed in #170.

They were backported onto #168. Local tested commit
`9c3ac97fb71135212f16ebf0ac0c8e02ed82ef79` and connector-published commit
`823f5d3b8a26e5be8d8a5a65fc5b74766cc04c10` have the same tree
`3f90594849cca2ba1a34d76f66d77cf45c7bc124`. Commit identity is not claimed to be
identical. Typecheck, 30 focused regressions, unchanged-source controller retry
and hosted local-trade evidence passed.

`git merge-tree --write-tree 189f7b1… 823f5d3…` produced #170's unchanged tree
`b36afa9f15185da0abd300d4debde344cb6b2fde`. The same comparison after main's merge
produced unchanged main tree `c494301…`. #168 was then closed with an incorporation
comment. The original head is a main ancestor; the new repaired head is retained
on its branch. This is **one explicit superseded closure**, not another direct merge.

## New development checkpoints

- #173 original published head `7a85ccbe720b540b059c5b1b030b3de8ade224c5`, tree
  `4105421f1dad2bcd44167f35d828ee318944bbe5`, adds actual-browser ERC-20 recovery and
  authority-revocation assertions. Hosted RED led to correction `2edda4e57ba0dcadc1a148a870ef0a8b8271b492`,
  tree `071e8b75807b85ac414a9fb803ebefe859a443a3`, equal to independently reviewed
  local `4a0f3b171b75286fda66081dc70efcccdcbcdf18`. Await new exact-head browser GREEN.
- #174 published `030ba10169531dc9a6324d862bb4fad71fbb117b`, tree
  `5284fb94e13b3f0fdd4c146d45ac445f35c00783`, has parents main `91ee699…` and original
  #154 `3591dcbb84ff7280be3d93a27b5b160066074c06`. Its tree equals local integration
  `d5ae31427584effffea16cec00161a5cab9a7298`. Review/CI gates remain open.
- [#175](https://github.com/djshellshoxxx/p2p-offramp/pull/175) publishes the RED/core/app resumption history, ending at `ba90ad4cdd7e98eaee0d9595096e2812938b1722`, tree `bc0b0700495b8001d409cc7ec0ef8152e2744a77`, equal to reviewed local `81de237…`. 128 affected tests, typechecks and artifact gates passed. Actual hosted browser qualification remains required; it is not counted as a main feature.

No historical branch was deleted; no shared history was rewritten. All remote
source updates used an expected previous SHA and non-forced ref update.
