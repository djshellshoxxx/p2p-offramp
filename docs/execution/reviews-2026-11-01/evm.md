# Whole-source EVM audit after local guidance/privacy slice

Baseline f264cab; read-only audit except root-admitted T25 minimal fix in owned evm-submit.ts/test. No commits or whole-suite/native-chain runs by this reviewer during this pass. Existing reports p2p-continue-audit-evm.md and p2p-continue-review-recovery.md reviewed to avoid duplicating resolved findings.

## Confirmed finding and resolution

T25 / P2: packages/wallet/src/evm-submit.ts read() used `error instanceof ReaderFailure` on arbitrary provider-thrown values. A thrown Proxy whose getPrototypeOf trap throws a private diagnostic bypassed the intended CoreResult normalization and rejected the reader promise with that raw diagnostic. Independent probe p2p-evm-reader-hostile-probe.mjs reproduced `rejectedRaw:true`; RED test log t25-reader-red.log records the same failure.

Root admitted fix: remove the unsafe prototype classification and use existing normalizeError for local and foreign thrown values. It safely reads own code descriptors and preserves local ReaderFailure codes. New regression covers all eight public read operations with hostile prototype and descriptor traps, asserting fixed UNAVAILABLE result and no private URLs/messages. Direct wallet-reader suite now5/5PASS; independent probe returns typed UNAVAILABLE. No parallel refactor or new wrapper. Adjacent wallet modules have no similar instanceof catch remaining; intrinsic Uint8Array validation remains inside snapshot/error boundaries.

## Source reviewed and boundaries traced

- All packages/wallet/src source: discovery, adapter, agreement, escrow ABI bindings, isolated execution, canonical payment preflight, canonical submit/reader, terms/signature encoders.
- packages/chain-evm/src isolated reader and test coverage; canonical getTrade ABI remains separate from isolated escrows ABI.
- contracts/evm/src BasicEscrow, ABI/config, owned scripts, documented token/push-credit policy and test structure; isolated escrow-evm contract/compiler/tool fixture profile remains distinct.
- scripts/sepolia deploy, record-deployment, send, trade, owner-release, verify-release, lib; recovery builder/CLI/native read and offline reference schema.
- Relevant existing tests and historical native evidence reviewed; no claim that historical results substitute for root's current final verification.

No additional reproduced actionable finding in this pass. T10 latest-state veto/numbered-anchor fixes, T16 canonical receipt/guard/geth failure-address proof, and T17 detached recovery pins/FIFO bounds remain present. Trading gates remain disabled.

## Uncertain contracts / limitations

Canonical BasicEscrow verifies acceptance off-chain and uses push-then-credit settlement; isolated escrow requires on-chain acceptances and reverts failed payouts. Never use one profile's ABI or payout interpretation for the other. Canonical token exact-transfer/non-rebase/non-upgradeable admission is an external policy prerequisite; balance deltas cannot establish token honesty, future freezing or proxy immutability. A consistently dishonest RPC remains outside consensus-proof guarantees. External crypto review, production endpoint/deployment qualification, real-wallet and physical-device acceptance are not established by this engineering audit. Legacy native tooling is testnet qualification tooling, not shipped app spending authority.

## Final inspected source hashes
f50d312d37be76ce1b32767baccfe6053645b67d877bb4f0c90b8e86bf6341b8  contracts/evm/script/DeployBasicEscrow.s.sol
8145ea9c5271556e10b4f3f258c043ee2813d79db92740f8093ea3298bd26c4a  contracts/evm/script/SendCall.s.sol
6a5d9474c519a60a71458b3fb33566e0e7e65c1a2189ba5f01e96c59e2a2a710  contracts/evm/script/export-abi.sh
dbeca9669391701beb9167e9cd9354f6d230e6cd6f60bf575d0690d96b04569f  contracts/evm/src/BasicEscrow.sol
c99586e244dc6bd94c850a356381b10a7a2a038a8c9fafe7e5adb9ca790863d8  packages/chain-evm/src/reader.ts
42c1020620dc987caf6c2af13139f635a3fb363016f7ab3288ecf8549a96e821  packages/escrow-evm/contracts/BasicEscrow.sol
c3dcaf61eb11f6af19498dbc36ee3320918f4c44d0f9012affc5d8b3116b811f  packages/escrow-evm/contracts/TestActors.sol
fe2d596ee48acd133b589d839f5c2325c44fcc91a9aca38982f0600d632b50dd  packages/escrow-evm/scripts/compile.mjs
1baea73ac7dc1256603b369cbf35bfbb142f39fd7d309570803e27e6fd8dff09  packages/escrow-evm/scripts/evidence.mjs
b20d7e2759af9d4c8bdf863474f53a869df6929341e55eb3ef8febc72926e729  packages/wallet/src/discovery.ts
2db30e1e941824aa80ec7fa67151bb87cc4b0e9d5bb9b4f0f9d87392a61e1bbf  packages/wallet/src/evm-adapter.ts
f7acb2d484db116c4cebac89d3c9d4e375af63bfe2f8aa3646e2117c19792991  packages/wallet/src/evm-agreement.ts
b52c7dc21e8ff8ba13a534b67d02c50a6628df59060e4c4475bd80789b18b000  packages/wallet/src/evm-escrow.ts
5cfe77ab122ff0fdc4131ddef45103a0ee1b6d2ee7fda86689d315f9860e0900  packages/wallet/src/evm-execution.ts
7b8b6b058d81d3314a04e9c25d94aa34c446b06151bb01c53cb4bdc02944bec0  packages/wallet/src/evm-payment-preflight.ts
c5d23b880e5a150a3c9ad63b724a321927046044174a7feb12cd79b52e36f92b  packages/wallet/src/evm-submit.ts
3fca07e32e95756421140647639214adec0b7cd83a84c8e53467f9ddfee97af9  packages/wallet/src/evm-terms.ts
986ccec90db4df3e98d61d69e7f30c409becd339b89fa3c8dc96a53e40391fc6  scripts/recovery/build-evm.mjs
67d9db1d4b627d61912a911650f4f7683fe0e39b78daa9938f904b6c38afd8cf  scripts/recovery/evm-cli.mjs
fec5fcf398c538ad40eb0e9cb8d431204fdcdbb8be13a177379d48db407002b2  scripts/recovery/evm-recovery.mjs
f0b9d0bd0503d07f77ac65d02e9a48de42ff55f73e662847fba0a3ac1416f2b4  scripts/sepolia/deploy.mjs
3c140a197bb17c19f43d3d7c95323c16da8b818bd2e986aaed5108dd08046bf7  scripts/sepolia/lib.mjs
ca366d7aa299fc134e051d0b938675267508eec63a5a965799d9870b95571f20  scripts/sepolia/owner-release.mjs
eadbf177119e706e63485323118389df21a8fdb5562278125824153f08fdaf54  scripts/sepolia/record-deployment.mjs
0a55772d4c3fb9e8ca9435e8849eefb90b7afdf3209d5f926cf44c979cb472a2  scripts/sepolia/send.mjs
740e62c5363f21aa59735c07a3d7af42db0bb638d629bd2863eb5126546185e1  scripts/sepolia/trade.mjs
fc4059a11b364de40adce86129b530ca9f8dd5153739515cdcf14f7ca7f97db8  scripts/sepolia/verify-release.mjs
f36c852b62b48330babd0d9929a46e6309c03c5f91ac69b893cdc23f7bf6c5d4  packages/wallet/test/evm-submit.test.mjs
6bd07ceba44e08ca4582c9e2464a9d4d699969af54c4ff12cbbe2b1729ead3d0  packages/escrow-evm/test/helpers.mjs
aef2d91866e7ec1b5a58d12770e3abe527ff5b6a8ec0ea143b183cf72a656f98  contracts/evm/abi/BasicEscrow.json
56a9646c2dbbb26647398ac10e3217f8507c34773825d2d145f19d411b3bf30a  packages/schemas/src/recovery-reference.ts
