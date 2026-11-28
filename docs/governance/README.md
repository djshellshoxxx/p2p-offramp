# Inert governance records (historical decision packets)

GOV01/GOV02 tooling validates public sanitized record structure and local evidence.
It does not authenticate reviewer identities, establish independence, approve a
release, verify a manifest or modify any running capability. Even an imported
`accepted` or `implemented` label remains an unauthenticated claim. Existing G15
manifest and acceptance services remain the only corresponding runtime authorities.
The application imports none of this package.

Pure `validateAuthorityDecision` and `validateProposal` return the shared CoreResult
contract. Objects have exact own data keys; version is exactly1; arrays have at most
128 unique entries. IDs, reviewer slugs and exact version identifiers are ASCII
up to64 characters (letters/digits plus `.`, `_`, `:`, `-`; no ranges or wildcards).
Artifact digests are lowercase SHA256hex. Paths are bounded512-character POSIX
repo-relative names: no URL, absolute path, dot traversal, backslash, encoded path
or control character. No path, link or proposal content is executed.

`evaluateCompatibility(readerVersion, writerVersion, proposal)` diagnoses exact
reader/writer set membership. Both listed: compatible/EXACT_MATCH; only reader
listed: read-only/WRITER_UNSUPPORTED; reader absent: unsupported/READER_UNSUPPORTED.
Rejected, retired and historical records return unsupported/PROPOSAL_INACTIVE. Draft/review records
may be analyzed without approving them. Every result is inert-record-only with
`economicPreparationAllowed:false`. No semver inference or second release evaluator
exists here.

Run the local checker from the repository root:

```sh
node scripts/governance/check.mjs . docs/governance/g16-acceptance.decision.json
node packages/governance/test/records.test.mjs
```

The checker reads a bounded record and requires referenced evidence/spec/threat
paths to resolve to regular files inside the actual repository root. Symlink escapes
and missing/directories are refused. Evidence uses bounded descriptor reads with no-follow/nonblocking open, regular-file and root/path identity checks before and after reading, and stable device/inode/size/mtime/ctime checks. Evidence is read only for SHA256 linkage,
limited16MiB/file and64MiB total; the record is limited128KiB. Every declared artifact
hash must match a referenced file. This verifies local bytes, not approval, intended
artifact semantics or G15 signatures. An empty recovery hash list explicitly means
no recovery artifact is qualified by this record. No network request, upload,
installation, shell evaluation, on-chain action or imported code execution occurs.

Every record in `docs/governance/*.proposal.json` and `*.decision.json` is **historical**: it
was prepared before the owner accepted D1, D4, D5, D6, D7, D8 and D9 on 2026-11-04. Its `status` is
`historical` and `supersededBy` points at
[the accepted-decision index](../adr/ACCEPTED-DECISIONS-2026-11-04.md), which now governs. The
schema accepts `historical` only together with that pointer (and refuses the pointer on any live
status), `evaluateCompatibility` treats a historical proposal as inactive, and the checker reports
`historical:true, pending:false`, so none of these files can be read as an open decision. D2 remains
proposed; D3 Option A was implemented and merged under the 2026-11-18 approval recorded in that
index. A new open question needs a new live record, not an edit of these.

The decision packets below were preparation only: reviewers are empty and status was
proposed. Their paired proposals are drafts, with no compatible readers/writers or
recovery artifacts asserted. Those human/security questions were pending when prepared; the accepted-decision index now governs. Names in a
future file cannot substitute for the existing signed review and release process.
See [pending decisions](PENDING-DECISIONS.md) for concrete questions and preserved
recovery constraints.
