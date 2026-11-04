# D2 - Testnet signing trust root and Sepolia deployment record (decision packet)

Status: PROPOSED. This packet is for the owner. It does not decide anything. No key, trust root, manifest or trust transition in it is approved, and nothing here changes running behavior. Production trust stays null and `ReleaseEnabled` stays `0` under every option.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch (45630ba).

## The question

How should the owner create and hold the Sepolia testnet release-signing key, and in what order should the owner pin it, deploy, record and sign, so that `npm run build:testnet` can verify a real Sepolia registry?

Today it cannot. `npm run build:testnet` passes typecheck and then stops with `Error: TESTNET_TRUST_INVALID: KEY_UNPINNED`, thrown at `apps/web/scripts/testnet-trust.mjs:73` (main). This was run on 45630ba while preparing this packet.

## Current source behavior

- The pin is `SEPOLIA_RELEASE_KEY_ID: string | null = null` in `apps/web/src/testnet/sepolia-network.ts:18` (main). `isPinnedReleaseKey` (`:21-23`) is true only for a 64-character lowercase hex value equal to that pin.
- `loadTestnetTrust` (`apps/web/scripts/testnet-trust.mjs:71-79`, main) calls `verifyTestnetTrust` (`:43-69`). With a null pin it returns `KEY_UNPINNED` at `:45`, before reading any file. With a pin it reads four files (`TESTNET_TRUST_FILES`, `:16-21`):
  - `security/testnet-trust/sepolia-release-key.pub.json`: `{ keyId, publicKey }`, where `publicKey` is a P-256 JWK with exactly `kty`, `crv`, `x`, `y`, `key_ops: ["verify"]` and `ext: true`;
  - `registry/testnet/sepolia.registry.json`;
  - `registry/testnet/sepolia.release.json` (the canonical G15 manifest);
  - `registry/testnet/sepolia.release.sig.json` (the detached ES256 envelope).

  None of these files or directories exists at 45630ba. A missing file gives `TESTNET_TRUST_MISSING`. It then runs the G15 verifier over the registry asset only (`:55-57`), checks that the file's `keyId` matches the key that signed and equals the pin (`:60-61`), binds the registry (`:62`), and applies the Sepolia-only rule (`:67`). An optional `registry/testnet/sepolia.accepted.json` (`:23`) sets a rollback floor.
- The G15 verifier refuses a manifest valid for more than 30 days (`packages/security/src/release-manifest.ts:189`, main), refuses an older sequence or a different manifest at the same sequence (`:281`), and requires the manifest's asset list to equal the supplied assets exactly (`:293`). The built app repeats the check at runtime (`apps/web/src/testnet/sepolia-source.ts:43-57`, main). **So the testnet build and the testnet app stop working when the signed manifest expires, at most 30 days after signing.**
- The owner tool `scripts/sepolia/owner-release.mjs` (main) does `keygen` (`:45-49`, writing the private JWK with mode 0600 and `flag: 'wx'` at `:112`, printing only `{ keyId, publicKey }`) and `sign` (`:82-104`). `sign` refuses a registry that is not exactly Sepolia (`:88`) and any deployment whose committed record is missing, mismatched, not from clean sources or not finalized (`:89-96`). Its manifest names only the registry asset (`:63`) and always sets `predecessorDigest: null`. `keygen` ran with plain `node` (Node 24) during preparation of this packet, into a scratch folder that was then deleted.
- The deployment kit: `scripts/sepolia/deploy.mjs` broadcasts, refusing a public endpoint that leaks a private RPC credential (`:80`). `scripts/sepolia/record-deployment.mjs` writes the record `p2p-offramp/deployment-record/v1` (`:154-166`, with `releaseEnabled: 0, reviewEvidence: null` at `:165`) and a single-deployment registry naming `escrow-sepolia-v1` (`:167-177`). `scripts/sepolia/verify-release.mjs` exposes `sepolia:verify` and `--accept` (`:42-45`). `scripts/sepolia/trade.mjs` runs the two-party trade. `scripts/sepolia/lib.mjs` holds the Sepolia identity and the RPC client. All of these are on main.
- Secrets are read from the environment only: `SEPOLIA_DEPLOYER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, optional `SEPOLIA_CROSSCHECK_RPC_URL`, plus `SEPOLIA_SELLER_PRIVATE_KEY` and `SEPOLIA_BUYER_PRIVATE_KEY` for the trade tool. `scripts/tests/sepolia-hygiene.test.mjs` (main) checks that Forge children never receive the other keys (`:13`) and that a public endpoint cannot copy a private RPC credential (`:35-68`). `scripts/tests/deployment-record.test.mjs` (main) checks that a record binds the receipt, CREATE address and canonical inclusion (`:26`) and never records finality on a wrong or orphaned answer (`:31`). Both files pass at 45630ba (18 tests).
- The build writes `ReleaseEnabled: 0`, `signedRelease: false` and `releaseAcceptance: false` into `local-build-evidence.json` (`apps/web/scripts/build.mjs:47`, main). A test-only pin seam exists (`:59-64`) and is not reachable from the command line. On the ordinary path the evidence records `ownerApproved: true` (`:69`), which only means "the pin came from source".
- `docs/deployments/sepolia/README.md` (main) holds the step list. Two sentences are stale: line 34 says an unpinned build "records `keyPinned: false`", and line 77 says the pin applies "once that is set". The code refuses instead (`testnet-trust.mjs:45`).

## Options

All three keep production trust null, keep `ReleaseEnabled` at `0`, and keep the Sepolia-only rule.

**Option A - one owner-held P-256 key, made with the existing tool.** The owner runs `keygen` on their own machine, keeps the private JWK in a file outside the repository with an offline encrypted backup, and pins its `keyId` in source. No code change. Security: the key is as safe as that machine. A thief could sign registries that the verifiers accept until the owner moves the pin, but only registries that name Sepolia alone. The damage is limited because signing also needs a finalized deployment record that matches a clean build of committed sources, and the network rule rejects every chain except Sepolia. Compatibility: matches the verifier, the build, the app and the recovery builder as they are.

**Option B - a hardware-held key.** The verifier accepts only ES256 on P-256 (`release-manifest.ts:257` and `:283-287`). Ethereum hardware wallets sign secp256k1, so they cannot be used without a verifier change. A P-256 smart-card or PIV token could work in principle, but `owner-release.mjs` has no hardware path, and the token would have to produce a 64-byte IEEE-P1363 signature over `"p2p-offramp/release/v1\n"` plus the manifest bytes. Unverified: no hardware flow has been tried. Security: the key cannot be copied. Cost: new tooling and new test vectors, and it delays the testnet.

**Option C - a pinned offline root that certifies short-lived per-release keys.** This needs a certificate format, chain checks and revocation rules that do not exist. The verifier takes a flat list of trusted keys and one pinned `keyId` (`testnet-trust.mjs:55`, `:61`). `docs/governance/PENDING-DECISIONS.md` (PR #26 only, "G15 trust rotation") says rotation and threshold policy must not be invented without review. Security: the strongest separation. Cost: the largest change and a new review, with little benefit for a no-funds testnet.

## Recommendation

Option A, proposed for owner decision, for the Sepolia testnet only. It needs no code change, and the key cannot certify any other chain. Option B or C belongs in the separate production trust-root decision. Choosing Option A here does not make it the production model.

Proposed rules that go with it:

- The private JWK never enters a cloud session, chat, commit, issue, command argument or log. `--out` points outside the checkout, because `.gitignore` does not exclude `*.jwk`.
- Rotation: generate a new key, commit the new public file and pin together, then re-sign with a higher sequence. After the pin moves, manifests signed by the old key fail with `KEY_ID`. A key replacement is accepted only through a commit the owner reviews, never because a session or host proposed it.
- Re-signing: sign with `--days` at most 30, and re-sign with a higher sequence before expiry. Otherwise `build:testnet` and the testnet app fail closed with `MANIFEST_EXPIRED`.

## Owner-run steps (proposed, not approved)

Ten steps; five are owner-run on the owner's own machine or settings. Never paste a secret value anywhere in these steps.

1. **Owner, cloud environment settings.** Create a fresh testnet-only deployer account with a small Sepolia ETH balance. Add `SEPOLIA_DEPLOYER_PRIVATE_KEY`, `SEPOLIA_RPC_URL` and, if wanted, `SEPOLIA_CROSSCHECK_RPC_URL` as environment secrets. Allow the RPC host under network access, then start a new session.
2. **Owner, own machine.** In a clean clone at the reviewed commit, with Node 24, run `node scripts/sepolia/owner-release.mjs keygen --out ~/p2p-sepolia-release-key`. It prints `{ keyId, publicKey }` and nothing secret. Make an offline encrypted backup of `sepolia-release-key.private.jwk`.
3. **Owner, own machine.** Save the printed JSON exactly as `security/testnet-trust/sepolia-release-key.pub.json`. Replace `null` with the printed `keyId` string in `apps/web/src/testnet/sepolia-network.ts:18`. Check that `git status` shows only these two files and that the public file has no `d` member. Commit them together. After this, `npm run build:testnet` changes from `KEY_UNPINNED` to `TESTNET_TRUST_MISSING`.
4. **Session.** `npm run sepolia:deploy -- --public-endpoint https://<public sepolia rpc>/`, with a keyless endpoint.
5. **Session, about 15 minutes later.** Re-run `record-deployment.mjs` with `--tx`, `--public-endpoint` and `--deployer`, as in the README's step 4, so that `finalizedAtRecording` is `true`. Commit `docs/deployments/sepolia/BasicEscrow-<address>.json` and `registry/testnet/sepolia.registry.json`.
6. **Session, recommended.** `npm run sepolia:trade -- --run exercise-1 --unsigned-registry --wait`.
7. **Owner, own machine.** Pull. Check the record (`sourceTreeClean: true`, `finalizedAtRecording: true`, `releaseEnabled: 0`, `reviewEvidence: null`, empty allowlist) and the registry (one network, a keyless endpoint, the recorded address and runtime keccak). Run `node scripts/sepolia/owner-release.mjs sign --key ~/p2p-sepolia-release-key/sepolia-release-key.private.jwk --sequence 1 --days 30`. Check the printed summary, then commit `registry/testnet/sepolia.release.json` and `sepolia.release.sig.json`.
8. **Anyone.** `npm run sepolia:verify -- --accept`, then commit `registry/testnet/sepolia.accepted.json`.
9. **Anyone.** `npm run build:testnet`, then check the evidence (see below).
10. **Owner, recurring.** Before expiry, re-sign with the next sequence (step 7), then repeat steps 8 and 9.

D3 dependency: the step 7 manifest covers only the registry. The maintained recovery builder needs the canonical ABI in the same manifest, so it would refuse it with `ASSET_MISMATCH`. Either sign now and accept that there is no testnet recovery package until D3 is implemented, or wait for D3.

## Acceptance checks

- With a null pin: `build:testnet` gives `KEY_UNPINNED` (as today). `apps/web/test/testnet-source.test.mjs` (main) covers this and passes.
- After step 3 only: `TESTNET_TRUST_MISSING`.
- After step 9: `apps/web/dist-testnet/local-build-evidence.json` has `ReleaseEnabled: 0`, `signedRelease: false`, `releaseAcceptance: false`, `testnetTrust.keyPinned: true`, `testnetTrust.localProof: false`, and `testnetTrust.keyId` equal to the pin.
- Negative: an edited registry byte gives `ASSET_MISMATCH`. A public file whose `keyId` does not match its key gives `KEY_ID`. A manifest older than the accepted one gives `RELEASE_ROLLBACK`. A clock past `expiresAt` gives `MANIFEST_EXPIRED`. A registry naming any other chain gives `NETWORK`. A non-testnet build containing trust data gives `TESTNET_DATA_IN_NON_TESTNET_BUILD`.
- Hygiene: `npm run test:sepolia:kit` passes. No committed file contains a private JWK member `d`, a deployer key or an RPC URL from the secrets.

## What this unblocks

A working `build:testnet` against a real signed Sepolia registry, the live two-party Sepolia trade, and the input D3 needs. It does not unblock production trust, `ReleaseEnabled`, wallet funding in the app, or any mainnet path.

Open questions for the owner: whether `ownerApproved: true` should be renamed, because it does not record an approval; whether the stale README lines should be corrected in a separate change; and the re-signing cadence (proposed: every 30 days at most).
