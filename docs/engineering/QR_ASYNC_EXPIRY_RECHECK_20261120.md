# QR asynchronous-expiry acceptance boundary — isolated continuation

## Source and ownership

- Base: corrected-core draft PR #207 at `df10fe26a308407237f9ccbc636c8bb61f55b84f`, tree `4b694124197ae8ce271f14307d12abc43c719406`.
- Regression-only commit: `84ae862381446e60cdf33da58aadb277321c5f7c`.
- Production repair commit: `3afe1504556466d9a22ad4f2d69826b6d68a78bf`.
- Reviewed source paths: `packages/qr/src/text-codec.ts`, new `packages/qr/test/async-expiry.test.mjs`. All other source files are preserved from #207.
- Scope: dependency-free QR review/decoding, not financial execution, signing, import consent, transport, the Solana native harness, paid-agent work, or release activation.

## Concrete source defect

The existing `readContext` sampled `nowSeconds()` once before parsing, payload hashing, and optional asynchronous invite-signature verification. `reviewBytes` checked expiry using that original time and built the import review using it after the awaits. An envelope could become expired (including its 60-second safety margin) during a pending hash or verifier callback and still produce an `ok` review with stale `secondsUntilExpiry`.

The patch preserves the initial time sample and the initial clock validation, samples again **after the payload hash and immediately after signature verification**, rejects invalid/throwing clock observations with `UNAVAILABLE`, and rejects newly expired envelopes with `EXPIRED`. The review receives the most recent nondecreasing sample. A backward second sample never extends the displayed remaining lifetime. No signature verification decision or cryptographic bytes change.

This is a review-boundary correctness issue. The QR review explicitly grants `authority: none`; no payment, transaction replay, key leak or authentication bypass is established. Commit-time replay-ledger checks already have separate expiry protection and remain unchanged.

## Focused regression specification

The new test exercises a genuine generated trade-invite envelope:
1. A hash provider advances the clock from one second outside the expiry margin to the margin boundary. Expected: `EXPIRED`, rather than a formerly accepted review.
2. A valid synthetic HMAC test verifier advances the clock at completion. Expected: `EXPIRED` after verification, not a signed review.
3. The clock becomes nonfinite, negative, fractional or throws after the initial valid sample. Expected: `UNAVAILABLE` with no review.
4. Steady clocks preserve the original review timing; a backward sample cannot inflate remaining lifetime.

The synthetic test signer is the repository's existing test-only fixture, not a proposed production invite-signing profile.

## Verification and limitations

- GitHub source inspection established the stale single-sample path on the exact #207 text-codec blob `1d61d537d6ae5e10bddb3aa4fc88bbd80edbe9b2`.
- The patch was constructed with four precise, uniquely matching source replacements; the original type/format/signature structure was retained.
- **The QR tests, complete package suite, TypeScript and hosted/browser checks have not yet been executed for this isolated source.** The test-first commit is not represented as an executed RED result, and code inspection is not independent review.
- After publication, run `node --test packages/qr/test/async-expiry.test.mjs` and the original QR/whole applicable source checks on the exact PR merge checkout. Preserve all failure results; no gate or assertion may be weakened.
- PR #207's preceding Vault foundation browser failure and PR #210's separate transport-fixture remediation require their own exact-source hosted results. No previous pass or failed ancestor is reclassified.

The integration owner should review this patch independently, recheck changed-file overlap, and merge it only through the existing qualified source sequence. Source PR #210, #206, #208, #209, coordination PR #200 and all optional #191–#199 are unchanged. `ReleaseEnabled=0`; no deployment, release, funds, keys, settings or default activation.
