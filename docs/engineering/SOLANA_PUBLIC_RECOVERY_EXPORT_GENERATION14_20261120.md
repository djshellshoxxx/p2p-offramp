# Generation 14: public Solana recovery document export

## Implemented scope

The funded-escrow browser app already retains a complete canonical Solana recovery
document in its encrypted profile, but previously exposed only whole-profile
encrypted backup export. Users can now explicitly download the original public
document for a selected retained trade. The new read-only Worker command accepts
the existing 64-character terms-hash identity, checks the open and current vault
session, selects its retained parsed document, and serializes only that document.
The output remains within the existing 16 KiB import limit.

The document contains the existing schema's public deployment/genesis identities,
trade terms, public role keys and derived escrow addresses. It adds no private
profile wrapper, journal records, signatures or current chain-state assertion.
The action makes no additional RPC or wallet call and writes no durable data.
Existing prepared transaction reviews retain their identity and authority.

The UI labels the public data and distinguishes the encrypted private backup.
The downloaded JSON filename includes the selected terms hash. Existing request
ownership suppresses late completion after lock, hiding or unmount; an explicit
current-profile comparison also retires a download when the selected profile
changes. New data is returned only by the explicit export command and is not
added to routine snapshots.

This is a funded-recovery completion slice. Full Solana discovery, bilateral
negotiation and funding remain separate: the accepted D1 carrier currently uses
EVM EIP-712, and the Solana prepared-review interface intentionally supports exit
actions only. No alternate peer-acceptance semantics or funding authority were
invented. The existing local native-SOL configuration is unchanged.

## Exact source

| Identity | Value |
| --- | --- |
| Base | `bf12a45604497860b8ded9d0e65f06a1c0cc9860` |
| Implementation | `b993d17fdbd7cdfce8f0d1e5d239c7785c9d787e` |
| Implementation tree | `e35d9cdb942fec95aa6d1133149d113a559afbdc` |
| Branch | `codex/solana-recovery-export-g14-20261120` |

The seven-file implementation contains only the existing Solana UI, Worker
protocol, command validation, controller, focused tests and the existing browser
fixture. Its patch is independent of the base's backup UI and CI-oracle additions.
Publication on another base must record its actual tree and qualifying checks.
This report and user documentation are a separate documentation commit.

## Executed local validation

| Check | Result |
| --- | --- |
| Controller and new UI tests | 17/17, zero failures or skips |
| New cases within that execution | Three controller cases and six UI cases |
| Existing restore lifecycle, wallet and Solana artifact-policy suites | 17/17, zero failures or skips |
| Build-policy suite | 57/57, zero failures or skips |
| Four TypeScript configurations | Passed |
| Import boundaries | Passed; 239 production source files, 143 core modules |
| Existing native browser fixture syntax | Passed |
| Default build | Passed; 13 output files |
| Demo build | Passed; 14 output files |
| Documentation engineering consistency | Passed; semantic approval remains false |
| Specification audit | Passed; 173 indexed documents, zero broken links |
| Whitespace | Passed |

The documentation validator retains the base's locale drift and six stale claim
rows. The locale catalog and approval evidence are unchanged by this slice; no
semantic approval, evidence repinning or publication is inferred from exit zero.

Controller cases use the actual encrypted vault/controller with an in-memory CAS
store and the existing synthetic chain fixture. They verify exact document
content, explicit output selection, the 16 KiB output bound, no additional RPC,
zero wallet prompts, unchanged encrypted row, preserved prepared review, missing
and locked selections, and the same document after fresh-key restore.

UI cases execute maintained TSX handlers with controlled client results. They
cover exact bytes/MIME/filename, synchronous duplicate suppression, lock, profile
replacement, document hiding, unmount and ordinary request failure. They are not
DOM, native Worker, browser or download-manager execution.

The existing Solana artifact-policy suite built the actual localnet Worker
artifact and retained its profile-specific policy assertions. This establishes
build admission, not runtime execution.

## Build isolation

All 13 default and all 14 demo output files match the parent's exact base build
hashes byte-for-byte. The comparison uses its source-bound
`generation12-combined-qualification.json` receipt for `bf12a456`.

| Build graph | Default modules | Demo modules | Solana runtime modules |
| --- | ---: | ---: | ---: |
| Document | 94 | 96 | 0 |
| Vault Worker | 30 | 30 | 0 |
| QR Worker | 4 | 4 | 0 |

Both build receipts retain `ReleaseEnabled=0`, `signedRelease=false` and
`releaseAcceptance=false`. No dependency, manifest, trust root, network endpoint,
contract, journal state transition, funding or release configuration changes.

## Hosted qualification and handoff

The existing real-validator browser fixture now downloads the selected public
JSON before any wallet connection, compares it with the original complete chain
fixture document, checks the exact filename and size, and confirms zero wallet
connections, prompts and sends. Every original financial assertion and both real
1,800-second refund minima remain unchanged.

That new browser step has **not** executed locally. The workspace's previously
observed native browser restriction was not bypassed. Current-source hosted
Solana/native/browser checks, plus fresh independent review, remain required.
No public-network, physical-wallet, new-funding, negotiation or production claim
is made. No remote mutation was performed by this worker.

Portable structured evidence, exact command results, artifact hashes and local
log digests are in
[SOLANA_PUBLIC_RECOVERY_EXPORT_GENERATION14_20261120.json](SOLANA_PUBLIC_RECOVERY_EXPORT_GENERATION14_20261120.json).
Raw local logs are in `dist/solana-export-evidence/` in the author worktree.
