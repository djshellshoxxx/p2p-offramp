# Owner runbook: Sepolia testnet release and recovery packages

Status: PROPOSED. This runbook implements D3 Option A
(`docs/adr/proposed/D3-maintained-recovery-manifest.md`) on top of D2 Option A
(`docs/adr/proposed/D2-testnet-trust-root-and-sepolia-record.md`). Neither decision
is accepted yet, so nothing here is approved, and no step below has been run with
a real key. The source pin `SEPOLIA_RELEASE_KEY_ID` is still `null`, production
trust is still null and `ReleaseEnabled` stays `0`. Testnet only: no real funds.

Every command below exists in this repository at the commit that adds this file.
Run owner steps on your own machine, in a clean clone at a commit you reviewed,
with Node 24. Never paste a private key, a deployer key or a keyed RPC URL into a
session, chat, issue, commit, command argument or log.

## What one release is

One release is one G15 manifest signed by the owner's testnet key. It covers
exactly two assets, and every verifier supplies exactly these two:

- `contracts/evm/abi/BasicEscrow.json` (the canonical escrow ABI);
- `registry/testnet/sepolia.registry.json` (the registry: Sepolia only, with
  every deployment ever signed).

`sign` writes three files, and you commit all three together:

- `registry/testnet/sepolia.release.json` (the manifest);
- `registry/testnet/sepolia.release.sig.json` (the ES256 envelope);
- `registry/testnet/sepolia.signed-deployments.json` (the signer's ledger of
  every deployment id signed on this channel).

The testnet build embeds the registry and the ABI in a bundle named
`p2p-offramp/testnet-trust/v2`. That name is a proposal for you to confirm.
Registry-only manifests and `v1` bundles are refused everywhere.

A manifest is valid for at most 30 days. After `expiresAt`, the testnet build
stops with `MANIFEST_EXPIRED`, the app shows a failed registry, and no recovery
package can be built from that release again. Packages built earlier keep working.

## 1. Create the release key (owner, once)

On your own machine:

```sh
node scripts/sepolia/owner-release.mjs keygen --out ~/p2p-sepolia-release-key
```

It writes `~/p2p-sepolia-release-key/sepolia-release-key.private.jwk` (mode
0600, never overwritten) and prints only `{ keyId, publicKey }`. Keep `--out`
outside the checkout. Make an offline encrypted backup of the private JWK.

## 2. Pin the key (owner, once per key)

1. Save the printed JSON exactly as
   `security/testnet-trust/sepolia-release-key.pub.json`. Check that it has no
   `d` member.
2. In `apps/web/src/testnet/sepolia-network.ts`, replace `null` in
   `SEPOLIA_RELEASE_KEY_ID: string | null = null` with the printed `keyId`.
3. In the same commit, update the tests that assert the null pin. They fail on
   purpose once a pin exists. List them with
   `grep -rn "KEY_UNPINNED\|SEPOLIA_RELEASE_KEY_ID, null" apps scripts`.
   The test-only pin harness (`scripts/test-support/with-test-sepolia-pin.mjs`)
   keeps working with a committed pin.
4. Commit the key file and the pin together. After this commit,
   `npm run build:testnet` stops with `TESTNET_TRUST_MISSING` instead of
   `TESTNET_TRUST_INVALID: KEY_UNPINNED`.

## 3. Deploy and record (session)

The first deployment uses the CLI default id `escrow-sepolia-v1`. Every later
deployment needs a new id, for example `escrow-sepolia-v2`. The naming rule is
yours to decide; the tools only require `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`.

```sh
npm run sepolia:deploy -- --public-endpoint https://<public sepolia rpc>/ --deployment-id escrow-sepolia-v1
```

About 15 minutes later, once the block is finalized:

```sh
node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/record-deployment.mjs \
  --tx <deploy tx hash> --public-endpoint https://<public sepolia rpc>/ --deployment-id escrow-sepolia-v1 --deployer <deployer address>
```

Commit `docs/deployments/sepolia/BasicEscrow-<address>.json` and
`registry/testnet/sepolia.registry.json`. Recording keeps every deployment the
registry already lists. It refuses an id that already names another address
(`DEPLOYMENT_ID_REBOUND`) and an address already listed under another id
(`DEPLOYMENT_ADDRESS_REUSED`). `sepolia:deploy` refuses a listed id before it
sends anything.

## 4. Sign (owner, every release)

Pull, then check the record (`sourceTreeClean: true`, `finalizedAtRecording:
true`, `releaseEnabled: 0`, `reviewEvidence: null`, empty allowlist) and the
registry (one network, a keyless endpoint, the recorded addresses and runtime
hashes). Then:

```sh
node scripts/sepolia/owner-release.mjs sign --key ~/p2p-sepolia-release-key/sepolia-release-key.private.jwk --sequence <n> --days 30
```

Use a sequence higher than the last signed one (`SEQUENCE_NOT_INCREASING`
otherwise). Read the printed summary before you commit:

- `assets` lists both paths above;
- each deployment shows `previouslySigned`: `true` for every id from earlier
  releases, `false` only for the new ones you meant to add.

`sign` also refuses:

- an ABI that differs from the committed file (`ABI_NOT_CANONICAL`);
- a release that changes the address, runtime hash or artifact hash of a signed
  id (`DEPLOYMENT_ID_REBOUND`), or that leaves a signed id out
  (`DEPLOYMENT_ID_DROPPED`);
- a ledger that does not belong to the committed manifest
  (`SIGNED_DEPLOYMENTS_MISSING`, `SIGNED_DEPLOYMENTS_STALE`).

These are checks in your signing tool only. The manifest keeps
`predecessorDigest: null`, so no verifier can enforce them, and a stolen key
could sign a rebinding release. Verifiers still accept only a registry that names
Sepolia alone.

To redo a signing before you commit it, first restore the three files with
`git checkout -- registry/testnet/sepolia.release.json registry/testnet/sepolia.release.sig.json registry/testnet/sepolia.signed-deployments.json`,
or sign with the next sequence. Commit the three files together.

## 5. Verify and accept (anyone)

```sh
npm run sepolia:verify -- --accept
```

It lists every signed deployment and checks that `--deployment-id` (default
`escrow-sepolia-v1`) is one of them. Commit
`registry/testnet/sepolia.accepted.json`. From then on, an older release or a
different manifest at the same sequence is `RELEASE_ROLLBACK` in the build,
`sepolia:verify`, the trade tool and the recovery builder.

## 6. Build the testnet app (anyone)

```sh
npm run build:testnet
```

Check `apps/web/dist-testnet/local-build-evidence.json`: `ReleaseEnabled: 0`,
`signedRelease: false`, `releaseAcceptance: false`, `testnetTrust.keyPinned:
true`, `testnetTrust.localProof: false`, `testnetTrust.keyId` equal to the pin,
and `testnetTrust.abiSha256` equal to the ABI digest in the manifest.

## 7. Build and archive the recovery packages (before `expiresAt`)

Do this for every release, before that release's `expiresAt`, and for every
deployment id it signs. A package can only be built while its release is current.

```sh
node --import ./scripts/test-support/register-tsx.mjs scripts/recovery/build-evm.mjs --out <new-directory> --deployment-id escrow-sepolia-v1
```

The output directory must not exist yet. Then:

1. Archive the whole directory under the release's `manifestSha256` and the
   deployment id, for example `<manifestSha256>/escrow-sepolia-v1/`. Never
   rebuild or replace an archived package; a later package does not replace an
   earlier one.
2. Publish the package and, through an independent channel, its
   `checksums.json` (see the start of `docs/recovery/CANONICAL-EVM.md`). Where
   both are published is still your decision (D3 open question).
3. Recover an escrow with the package of the release under which it was funded,
   or with a later package whose deployment id still has the same signed address
   and runtime hash.

## 8. Re-sign before expiry (owner, at most every 30 days)

Repeat step 4 with the next sequence, then steps 5, 6 and 7. Each release gets
its own archived packages.

## 9. Rotate the key

1. Run step 1 with a new `--out` directory.
2. Commit the new public key file and the new pin together (step 2). A manifest
   signed by the old key then fails with `KEY_UNTRUSTED`.
3. Sign the next sequence with the new key (step 4), then steps 5 to 7.

The ledger continues across keys: ids signed under the old key keep their
identity. Packages built before the rotation keep working, because a package
never rechecks the key or the expiry when it runs.

## 10. Revoke a key

Moving the pin (step 9) stops new builds and packages signed by the old key: the
recovery builder refuses `KEY_UNTRUSTED`, `sepolia:verify` and the testnet build
refuse with `KEY_UNTRUSTED` or `KEY_ID`, and the app shows a failed registry. It
does not disable packages already handed out, and must not, because they protect
funded exits.

If you suspect the old key was compromised, publish through an independent
channel which archived package digests remain good (built before the suspected
compromise) and which were built after it. Whatever a compromised testnet key
signs, the verifiers accept only a registry that names Sepolia alone.

## Still to be decided by the owner

- Accept or reject D3 Option A and its rules, and D2 Option A (the key model).
- The bundle format name (`p2p-offramp/testnet-trust/v2` is proposed).
- The naming rule for new deployment ids.
- Where archived packages and their `checksums.json` are published.
- Whether to schedule per-reference ABI and manifest digests (D3 Option C).
  Until then, `contracts/evm/abi/BasicEscrow.json` must not change, or packages
  for older escrows can no longer be built.
