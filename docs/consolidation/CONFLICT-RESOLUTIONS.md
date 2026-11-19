# Conflict and repair record

## Actual merge conflict

The historical #154 tooling merge into `e17b4d3…` had **one textual conflict**, in
`package.json`. The feature stack had added `build:localnet` beside #154's
`check:docs` and `test:tooling`. The intentional resolution retained all three.
Every existing test command, current test concurrency, artifact regression and
wallet/Solana/localnet command remained. The workflow merge only adds a
`docs-tooling` job; no existing required job was renamed, removed or weakened.

Local repair commit `aba8ca0843dcf24e2a80adfa2c8d38e0574a4a2c` preserves both
`e17b4d34097ca97c21e621547a38766c0271fbde` and original #154
`3591dcbb84ff7280be3d93a27b5b160066074c06`. Updating that integration to main
`91ee699…` merged cleanly; its final tree is `5284fb94…`, published in [#174](https://github.com/djshellshoxxx/p2p-offramp/pull/174).

## Semantic integration repairs

| Problem | Reproduction | Resolution | Qualification |
| --- | --- | --- | --- |
| Duplicate localnet profile UI | #168 real Chromium strict locator found two matching private profile elements | Distinct `private:` and `backup:` React sibling keys; no selector loosened | Focused 30 tests/typecheck plus actual hosted native browser GREEN; same repair included in merged #170 |
| AbortSignal crosses Worker wallet boundary | EIP-1193 provider request contained a non-cloneable control object | Forward only `{method, params}` and assert the provider-visible request shape | Independent review, affected tests and actual #170 native/ERC-20 Chromium GREEN |
| #154 documentation manifest stale | Strict checker returned `DOCS_STALE` for maintained wiki bytes | Regenerate immutable source bindings and current owned document/link digests; semantic approval remains false | Seven pages, 172 links, six claims; stale arrays empty |
| Seven tooling fixtures omitted newly linked targets | Docs tests failed on missing consolidation files in isolated temporary checkouts | Discover bounded immediate local targets using existing parser; enforce containment and preserve production checker | 30 focused tests pass; no validation relaxed |
| Sequential lab runs overwrite evidence | Historical #28 regression demonstrates flat output collisions | Fresh private directory per invocation; exclusive `wx` file writes; retained failed-run records | Ported exact narrow historical fix; both regression cases pass |
| Claims arrays bypass a 32-item bound | Changing Proxy `length` admitted 40 preconditions | Capture own data length once, validate safe integer and own-key count, iterate bounded snapshot | New regression failed before fix; focused suite passes |
| New #173 wrong-chain test expected immediate release availability | Hosted browser timed out after correct reconnect while durable prepared intent remained | Assert the hold, mine 11 configured lease blocks and require continued hold, then the 12th and require recovered exit without any wallet action | New real-browser GREEN pending; no product/journal rule weakened |
| Restored cancelled releases veto a fresh funded exit | Second hosted #173 run failed at restored release; native reproduction showed three successor-required records despite a finalized same-nonce consumer | Extend the existing canonical finalized account/chain/nonce proof to hashless value-moving records. Retain original profile, null hash and markers; a fresh explicit review remains mandatory | New regression RED→GREEN; 31 affected tests, independent review and real native release/refund diagnostic pass; fresh full browser gate pending |

## Combined-tree verification

#169/#166/#167/#170 integration did not require unresolved code conflicts. Each
actual main tree was checked against the locally predicted combined tree. #168's
repair was content-equivalent to #170; its closure was based on unchanged tree
identity, not merely a clean merge.

One initial typecheck process exited 137 under concurrent memory load; the same
source passed when rerun serially. One native controller run timed out waiting
for its second negotiation; the unchanged retry passed. The latter is recorded as
an intermittent qualification observation, not a proven environmental diagnosis
or a silently suppressed failure. See [TEST-RESULTS.md](TEST-RESULTS.md).
