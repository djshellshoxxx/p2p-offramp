# Reputation / identity / nullifier profile

Decision: exact upstream V4 membership evaluation is READY; app issuer/score/root/consumer policy is still undefined. Membership must not become creditworthiness.

Candidate source: Semaphore release v4.14.5, commit [`dbab555`](https://github.com/semaphore-protocol/semaphore/tree/dbab5553c486a09d5e1042e5271e3316224cc176), observed release2026-10-17. Reviewed [identity](https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/identity/src/index.ts), [generation](https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/proof/src/generate-proof.ts), [verification](https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/proof/src/verify-proof.ts), [hash](https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/proof/src/hash.ts). Identity uses upstream EdDSAPoseidon/secret scalar and base64 private export, not a V3 trapdoor/nullifier tuple or wallet-signature-derived identity.

Important artifact/version distinction: generation at this package release auto-resolves artifacts with version `4.13.0` when none are supplied. Therefore “use4.14.5” does not pin WASM/zkey/verifier bytes. Local evaluation must supply and hash explicit depth-specific artifacts; prohibit implicit CDN download from a core-only build. Verification public signals are `[root,nullifier,hash(message),hash(scope)]`. The provider hash is Keccak of the value's32-byte encoding, shifted right8; it is not an app-invented arbitrary modulo reduction. Preserve upstream input conversion/API and publish exact test preimages before binding the app's tuple domain to it.

Ready local work: intake pinned identity/group/proof artifacts and upstream tests, round-trip encrypted identity serialization, public synthetic group membership proof/verify, wrong root/scope/message/depth/key and cancellation tests; define the existing app length-prefixed purpose tuple as bytes and test its serialization separately. Do not claim the chosen tuple-to-Semaphore-value mapping is approved until the application profile freezes it. No secret goes to an issuer/relay.

Missing application fields:

- Issuer ID/signing key and authorization/rotation, admission policy digest, group ID, membership uniqueness assumptions, tree depths/artifact hashes and field modulus/encoding.
- Signed root format, monotonic epoch, issued/valid-until seconds (interval<=86400s), revocation source/checkpoint and conflict/rollback handling. A prover-selected root is never authoritative; offline cache cannot prove a worldwide latest root.
- Exact relying-party/network/deployment/verifier/issuer/purpose/epoch tuple, whether tradeId is present, terms-bound message encoding and canonical provider scope mapping. Scope per trade and global one-per-epoch enforce different policies.
- If global single-use is required: an actual deployed consumer that checks root/proof/message/domain and consumes `(domainHash,nullifier)` atomically with native reorg handling. G02 local dedup is only observed-local. Basic escrow has no reputation consumer.
- Score-threshold capability needs a separate issuer-authenticated, identity-bound score credential/circuit constraining0..1000000, threshold, epoch/policy/expiry. Standard Semaphore membership does not implement it. No circuit, credential issuer or honest-fiat rating policy is selected here.

Repo bounds: proof envelope<=256KiB; identical terms/root/profile advisory cache<=300s; secrets only G02 under explicit consent; root/revocation refresh and public proof egress need G05. Reuse extension negotiation and vault/session guards, not another evaluator or economic authority.

Local membership feasibility is independent of a real issuer decision. Issuer governance, score semantics and consumer deployment are concrete predecessors; independent cryptographic/privacy review and interoperability follow, with no claim that upstream audits cover this app.
