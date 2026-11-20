# Independent review: public Solana recovery export

Reviewer: `solana_export_review_g14`. Observed 2026-11-20 UTC.

**No actionable source or ordinary functional finding.** This review covers the
bounded export of an existing retained public recovery document. It does not
qualify broader Solana negotiation/funding, native browser execution, a public
deployment, physical wallets or release enablement.

## Exact source and independent change

| Checkpoint | Commit | Complete tree |
| --- | --- | --- |
| Author source | b993d17fdbd7cdfce8f0d1e5d239c7785c9d787e | e35d9cdb942fec95aa6d1133149d113a559afbdc |
| Independent test checkpoint | fb4adca6ae355e5a9c21879cf9515ea3ac8fd6b5 | fa2cf3afb3476bd5d025963459f64ec01ad261a5 |

The author base is `bf12a45604497860b8ded9d0e65f06a1c0cc9860`. The review used
an isolated worktree and physical dependency copy. All seven changed author
paths were read, together with the existing recovery parser, vault activation,
Worker/client lifecycle, command validation and portable recovery documentation.

The independent test commit adds one ordinary public-document round trip to
the maintained controller suite. It changes no production source, browser
fixture, workflow, assertion, parser or authority boundary.

## Standards and behavior review

The new `recovery.export` command uses the existing exact-field command parser
and 64-character lowercase hexadecimal trade identity. It remains subject to the
controller's unlocked-session, vault freshness, current lease and epoch checks.
The selected trade comes from the controller's retained map. Its document was
strictly parsed and deeply frozen on import or unlock; the export serializes
that document rather than a caller-supplied object, profile wrapper or journal.

The existing recovery schema contains public network/deployment identities,
canonical terms and their bytes/hash, escrow/vault addresses, roles and asset
identity. It contains the private agreement hash, not private agreement content.
The export adds no profile identity, origin-profile provenance, passphrase,
wallet secret, signature or transaction-journal field. UTF-8 output is bounded
to 16 KiB. The resulting JSON remains consumable by the maintained parser.

Export performs no RPC refresh, wallet connection, signature request, send or
durable write. An existing transaction review remains unchanged. The explicit
user action refreshes the existing idle deadline, consistent with other profile
actions; that is separate from persisted state.

The UI download uses a fixed JSON MIME type and filename derived from the
validated selected trade identity. Rendering does not export automatically.
The existing synchronous pending guard suppresses duplicate submissions. Before
downloading, the handler checks its command generation, owned client and both
the result/current profile identities. Lock, profile replacement, document hide
and unmount retire pending downloads. The unchanged real browser client also
disposes on pagehide and settles pending work without a successful export.

The public-file description explicitly distinguishes trade terms, public wallet
addresses and deployment identity from the encrypted backup needed for private
profile and journal recovery. This is a portable public reference, not proof of
current chain state and not a private backup substitute.

## Independent functional verification

The new round-trip case exports from one unlocked profile, locks it, creates a
separate fresh profile and imports the exported JSON through the existing
controller/parser path. It verifies the original public document and trade
identity, new private provenance, an empty journal and zero wallet/sign/send
activity. This tests actual portability between profiles without relying on the
encrypted-backup restore path already covered by the author.

| Executed check | Result |
| --- | --- |
| Controller, export UI and RPC/command suites | **21/21**, zero failures/skips/cancellations/todos |
| Four TypeScript configurations | Passed through `npm run build` |
| Default static build | Passed |
| Source boundary check | Passed: 239 production files, 143 core modules |
| Updated actual-browser fixture syntax | Passed |
| Whitespace | Passed |

The 21-case invocation includes the independent new case and existing author
cases. It is not a full repository suite and is not added to another overlapping
test total. The UI harness executes maintained TSX handlers with a controlled
client and synthetic Blob/download surface. Controller checks use the existing
ordinary synthetic chain fixtures and maintained parser/storage services.

Commands, exit codes, durations and exact log SHA-256 values are recorded in
[the structured review](solana-public-export-independent-review-generation14.json).

## Actual default artifact isolation

The independent build produced 13 files, including 12 scanned assets totaling
784,437 bytes. All 13 hashes exactly match the frozen base's recorded default
artifacts in `generation12-combined-qualification.json`, bound to source
`bf12a45604497860b8ded9d0e65f06a1c0cc9860` and tree
`3ed920615ec2ffcea9621339ff88556a19f0f9d7`.

| Actual graph | Modules | Solana localnet/chain modules |
| --- | ---: | ---: |
| Document | 94 | 0 |
| Vault Worker | 30 | 0 |
| QR Worker | 4 | 0 |

The default artifact retains `ReleaseEnabled=0`, signed release false, release
acceptance false, empty connection origins and CSP `connect-src 'none'`. The
new feature stays inside the explicit Solana localnet composition.

## Remaining qualification and handoff

The actual Solana browser fixture now checks the downloaded filename, the full
public document, the 16 KiB bound and zero wallet/connect/send activity before
continuing its existing transaction journey. Its syntax was checked here;
**it was not executed in a native browser by this reviewer**. The managed local
browser restriction was not bypassed. Applicable exact-source hosted browser and
native-validator gates remain required, with both real 1,800-second refund
minima unchanged.

No source correction, remote mutation, release action, trust configuration,
wallet/RPC activation or broader Solana protocol decision followed from this
review. Cherry-pick the independent test commit followed by this separate review
documentation commit onto the author's report continuation. Preserve the author
and reviewer source identities and do not transfer older native/browser passes
to the newly changed fixture.
