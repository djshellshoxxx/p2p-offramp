# Inert governance records and pending decisions

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
Rejected/retired records return unsupported/PROPOSAL_INACTIVE. Draft/review records
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

The decision packets below are preparation only: reviewers are empty and status is
proposed. Their paired proposals are drafts, with no compatible readers/writers or
recovery artifacts asserted. The maintained pairs are `g14-terms-binding`,
`g15-release-policy`, `g16-acceptance`, `peer-acceptance-carrier`, `qr-profile` and
`solana-profile`. `npm run check:governance` requires exactly these
`<name>.decision.json`/`<name>.proposal.json` pairs: a missing member or pair fails, and
so does an unlisted packet. Adding or retiring a packet means updating
`MAINTAINED_PACKETS` in `scripts/governance/check-all.mjs`. Human/security decisions
remain pending. Names in a future file cannot substitute for the existing signed
review and release process.
See [pending decisions](PENDING-DECISIONS.md) for concrete questions and preserved
recovery constraints.
