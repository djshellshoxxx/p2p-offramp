# Current domain/transport continuation review

Baseline HEAD: f264cabec4e21bc110a378bd63f8672285e28338. Read-only review; excluded newly changing privacy/journey modules.

No newly reproduced actionable correctness/security defect. Prior same-nonce recovery is deliberately explicit and cannot establish permanent absence of the original transaction; no duplicated-funds finding was reproduced.

Confirmed stale documentation: G21 spec-relay-failover-and-abuse-limits.md §6(a), line64, incorrectly states destination URL is not checked. Canonical relay pool.ts244 passes expectedURL, and transport policy.ts215-219 compares it with the detached registry grant. Reported to root for reconciliation. Existing WebSocket prebuffering, production route issuer, in-memory penalty and injected-clock limitations remain valid.

Reviewed diagnostics allowlisted projections/expiry/release revocation/export snapshot ownership; messaging native reauthentication and recovery; extension generation/proposal gating; exchange late state/replay checks; domain authority/journal/native lifecycle; payment preflight finalized/latest consistency and monotonic freshness; bounded transport/relay destination/resource controls and relevant schema copies. This is source review, not formal or third-party cryptographic certification.

Focused verification log: /workspace/work/a4-current-focused.log (diagnostics, canonical relay URL binding, native payment preflight). Root owns full suite and exact delivery revision.

## Snapshot SHA-256 inventory

- `packages/diagnostics/index.ts` `b70bb7183fd79f184c88eb26e3b6524e362169ec07494eb3df6d4c23a2f66f6e`
- `packages/diagnostics/src/diagnostics.ts` `4147eb32fae6cb5dfc03c07ecc6e3276a08f3c85475668725d7db8eb419c3d18`
- `packages/domain/index.ts` `041978f8029704a6887575b446ff3b083f07f43db05fbd224ea51c915ef4e5b2`
- `packages/domain/src/authority.ts` `410a6dfc063d2fcf0811fe3a6f6aeec04072bec9f471f4f8b1851b4724b6430f`
- `packages/domain/src/errors.ts` `2a8d8bc2f199c4ae803ef3e16ba42a84d3868c66a780dbdb1d15c71320c442a5`
- `packages/domain/src/intent-journal.ts` `1f490fb8b1980e8ce4d7c345977419180b7d16b646d3abfa8a08abf501884d01`
- `packages/domain/src/payment-preflight.ts` `4daa511bdb25b6437e44047940a80cf6c3b7b087a5963dba4082d2ff1f974ce1`
- `packages/domain/src/read-retry.ts` `50001c753a7f5fd4d3a764896fba52019619511122edf3ad38f87588931e34cc`
- `packages/domain/src/registry.ts` `1e24b5f15b4d3c44d0117e4f15077a262b6315d22c49d2c2755619261ac68d20`
- `packages/domain/src/terms-review.ts` `e7d20a723f154faf813ea59dec7a6c0b6d6e0b6802fbb48988ea7ba0bf7e02e6`
- `packages/domain/src/trade-composition.ts` `294fa9c249fc56cc68e7ff317a8c90ecf5d73b41e4cea3b1967052be21b75ddd`
- `packages/domain/src/trade-terms.ts` `e0d3733a996981f83351884d7f00ea51fae61b8ce49b09d5af546d1152bb1bd2`
- `packages/domain/src/tx-lifecycle.ts` `adef2e1920465b4f8acc80d6e42857f3516a0cfdb71a65020e8925834ff2362d`
- `packages/exchange/index.ts` `c8363ff04c91d4bb05d3270966cafcd486b00ba6192706f88b5749bd0755555a`
- `packages/exchange/src/exchange.ts` `263aaf875c457e444aae904fc3f7d53c440e6e2fccc6888a234d932b9af7ae2a`
- `packages/exchange/src/machine.ts` `9b895887b53ff79e675702a024afaf62d3a8a5ad561de9ffb2a9ca6b21faa2b2`
- `packages/exchange/src/messages.ts` `035f0f6f7c84245f19efba85d6f256372b042af1a6167a4c8a22617cccf64fc1`
- `packages/extensions/index.ts` `fa52854156cc34d5c01495afaf14024b71afdeb171fa42e87a56903065a666af`
- `packages/extensions/src/manifest.ts` `3a4fe523f3a9c2ff1932d879d2d8813a6a9694b8b739ad160ade0780f7526d79`
- `packages/extensions/src/registry.ts` `653b58de32a6f3cca66c3fde38e720e9a047e5a885b08b16c29fa315669266ec`
- `packages/messaging/index.ts` `33ad97305b743bff8e5172e0ed92c35b6b5b12be1bade28213f28685a266f8a5`
- `packages/messaging/src/durable-chat.ts` `bde2e8cf79930d33dfd0d548c23c17691374aee77b3e02ddcf1f3d0e6def223e`
- `packages/messaging/src/envelope.ts` `84082a8ad1645a4fd3b5205de866639a2e763298bf33ad52160412d67eddd952`
- `packages/relay/index.ts` `1148cf0a82239f59a86d250a490d1a989f7eacbef8ccbec8ebe46f22c632c928`
- `packages/relay/src/ad.ts` `7675a2eb48b4ea977a7fa48b424a5c02f5453cf7c711c23ef62cdf0b31912581`
- `packages/relay/src/advertisement.ts` `718a130271cbce06099bd8ed25f447ff6c1a38ecf6a14d30412c85922b587d78`
- `packages/relay/src/local-pool.ts` `279a8cbd10feea0ed66200635f4f1c02927c837b72eaea8d88ff5ca7f5f1ce7e`
- `packages/relay/src/nip01.ts` `f15611ec153dd614536e4a620183ea5830fff11d6e2b629ab9c1ffa128bb24a7`
- `packages/relay/src/pool.ts` `b94d203aa9858cc215659933ef1dc717296528882bbdd6ef639730ec79ddbb24`
- `packages/schemas/index.ts` `c609546026dc895057aa26c4f5b6af1b5452e07f0247dbf75107038560bec98f`
- `packages/schemas/src/backup.ts` `d59f5ae03d8b8463cb9f2f875f6ec10a914dd3c28db549987930eadf14631fc2`
- `packages/schemas/src/core.ts` `079ac1a941b77111500a6642b95430571d89f3e2d93b377a583c27e9cb013f36`
- `packages/schemas/src/evm-agreement-control.ts` `f847624e30aa27539808c57bcf30082ccc31d36c32bcaaf5283e78bd1b93e4fb`
- `packages/schemas/src/evm-agreement-input.ts` `7b3e0a67bf70a53b1ebcc241097bd16a372197f0596f0868af448ce6e823af3d`
- `packages/schemas/src/evm-agreement-protocol.ts` `443cbf82644994864fc4374bd087b0835e868fdc8569811471b2f3bc9ccb014e`
- `packages/schemas/src/identity.ts` `df9a3278760f9d8d6c8062cd9202e0f0710d8bb7e8153eb3729c328fa6be5a4e`
- `packages/schemas/src/intent.ts` `20b2c987591b741f9d6407e1d13c75952c0b4f513a2cb1bceba9eae40fb7846f`
- `packages/schemas/src/recovery-reference.ts` `56a9646c2dbbb26647398ac10e3217f8507c34773825d2d145f19d411b3bf30a`
- `packages/schemas/src/registry.ts` `dbc1245b39c87875481b8d872c66ea5bd4db962b5669493def4099463ded1183`
- `packages/schemas/src/runtime.ts` `baf83a2d5f5966e4fc7364839316fecefd71ab199b36aad973ab8272b050cfb4`
- `packages/schemas/src/saved-review.ts` `5d6ad0a31b5c0ff880f2e7202a602bf8aa961166f51db3dc8b821cc33dd8f9c5`
- `packages/schemas/src/transport.ts` `084c0b5e16975340911f7e4f70eaf5d3823799b7cb19037db5012f6d3c892dc8`
- `packages/schemas/src/vault-service.ts` `4465d3ef755c2137ee5a5da8b203e144aee7a3d27a36f39dc84011b3083441e6`
- `packages/schemas/src/vault.ts` `e9bd69ea8eeba487d8df4757d0db58dc656984b925624e009cd019cb96a0ebb8`
- `packages/transport/index.ts` `8214daf6696e4a76b0f23af1e9ed9072c097b0bff9445f852aac9d5385c785de`
- `packages/transport/src/http-driver.ts` `5b279fdff6ba77574c28e94628519df386e5bab459d4bd57ad79418bba3ecb42`
- `packages/transport/src/policy.ts` `7d969fb3df67d0f12c67c1b861e18509508412f4877d7e6735c1d1bc310409ef`
- `packages/wallet/src/evm-payment-preflight.ts` `7b8b6b058d81d3314a04e9c25d94aa34c446b06151bb01c53cb4bdc02944bec0`
