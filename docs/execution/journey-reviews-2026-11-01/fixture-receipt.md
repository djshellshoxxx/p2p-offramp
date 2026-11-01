# T32 independent receipt fixture review

Approved frozen test-only fix. Hosted push native preflight failed immediate receiptreadnull after successful send; sameheadPRrun passed. Helper now polls exact submittedhash with eth_getTransactionReceipt only, null-only retry, immediatefixedrefusal on malformed/reverted/foreign receipt or readerror. Original sender invokes eth_sendTransaction exactlyonce and delegates no sendcapability to helper.40read/39wait bound,50ms delay,5s monotonic budget checkedbefore/afterawait and remainingbudget realtimer for logicalhungreadwait; timer cleanup. No physicalRPCcancellation claimed.

Independent focused6/6 PASS; npm-enrolled node--test file alsoPASS. Tests cover nullfirst, exactmethod/hash, immediateinvalid/readfailure, stalledclock attemptbound, deadline/late-success/reversal. Owner pinnednative preflight7checks log /workspace/work/t32-preflight-native.log reviewed, no duplicate native/whole-suite run. Package prepends focusedtests before existing native harness; no production authority or compiler/policy changes. No sourcewrites.

| Path | SHA256 |
|---|---|
| `scripts/test-support/fixture-receipt.mjs` | `1b376fc97e2afdabfd8ecb56b6c56347c148454926fd8f3edd156856ab5f9822` |
| `scripts/tests/fixture-receipt.test.mjs` | `6d833e0e4edff5f43d9e866bf9549bf9c2de1b6857778c8e00444a3a78617f7a` |
| `scripts/test-payment-preflight-local.mjs` | `3fa239dd0c861099ff8ef7a40be6c991a9df4cdeee8971887f8e81020b947e5b` |
| `package.json` | `cedb08f6f896819f10f9c36dede3ae8a8a3aa824fb173c08ac6619d9da61dca2` |

Final sixth regression independently verified: a never-settling singleRPC rejects after mocked5000ms without sleeping, waiting or retrying; all6focusedtestsPASS. Helper/harness source unchanged.
