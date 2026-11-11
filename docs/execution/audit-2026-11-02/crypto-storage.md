T38-A reviewed every production file in identity, Nostr crypto, storage and native retention:21 files/2942 original lines at `76c45df0b2f39a928d92ae0af3d60f37737802c5`, plus the exact T85 repair delta. [Full inventory and semantic review](/workspace/work/audit-crypto-storage.json) bind final hashes while preserving audit-start hashes. No unexpected scoped drift remains.

Two medium findings were repaired by root and independently verified:

- Migration foreign-error classification used unguarded reflection/direct code access. T85 adds guarded own-data extraction and a fixed code allowlist.
- IndexedDB subscriber exceptions/live-set mutation could interrupt invalidation and teardown. T85 snapshots and isolates notifications, including closed-store delivery.

[Independent T85 review](/workspace/work/t85-independent-storage-review.json) binds the final four source/test files. All27 focused cases passed with zero failures, skips or cancellations; root's original2-failure RED evidence is retained. No reviewer source edits or commits.

The full read traced key-purpose separation, pinned crypto APIs, authenticated encryption, bounded strict imports, current-backup authentication, migrations/fresh-key restore/adoption, live leases/CAS/late writes, complete reauthenticated history and deferred-credit retention closure. Unknown/incomplete native dependencies retain data; age grants no deletion authority.

Eight fresh existing BIP340/NIP44/native-WebCrypto vector cases passed. Unchanged hash-verified T67 evidence is reused:34 storage/identity/native cases,13 runtime cases and9 pinned Anvil checks. Native9/the old filtered turn were not retried; the15-group browser proof remains historical evidence.

`packages/domain/src/recovery*` and `apps/web/src/recovery/` do not exist. Stable journey vault composition was supporting context; T82 favorites/runtime/UI WIP was excluded and needs final composition review. Professional crypto qualification, complete vendored/side-channel proof, physical erasure and production/browser/device approval remain absent or outside this audit.
