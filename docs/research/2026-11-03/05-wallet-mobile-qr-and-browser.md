# Wallet handoff, QR interchange, and browser qualification

Research date: **2026-11-03 (America/Vancouver)**. Sources retrieved **2026-11-04 UTC**. Scope: `P-MOBILE-HANDOFF`, `P-QR-PROFILE`, `P-QR-ENGINEERING`, `Q-PHYSICAL-LOCALE`. This is a research recommendation, not an approved profile, implementation, compatibility result, or release authorization.

## Findings and immediate decision

**Concurrent proposal:** PR #29's D6 offers a different Base45/M QR candidate. The [coordination note](CONCURRENT-WORK.md) compares it with this report's raw-UTF-8/Q candidate and identifies the unresolved scope of wallet-pairing QR. Carry both sets of evidence into the existing D6 review.

Qualify **one EVM wallet and one external transport first**, preserving the existing wallet, journal, and recovery boundaries. Start QR work with small public references and fingerprints, followed by explicitly authenticated trade invitations. Keep wallet-pairing QR in its own connector flow and keep encrypted backups on file transport. Existing generic discovery and lifecycle work should be reused; the outstanding problem is specifying and demonstrating the actual producer, consumer, session, and physical-device behavior. [MOB-R1] [MOB-R2] [MOB-R3]

Two findings materially narrow the design:

- WalletConnect's current iOS documentation says automatic return to **browser-based dapps on iOS 17 onward is unavailable** and requires a manual-return experience. Treat that as the vendor's documented constraint; no physical reproduction was performed here. [MOB-03]
- A 2,048-byte envelope does **not** fit QR byte-mode error-correction levels Q or H at any version: the version-40 maxima are 1,663 and 1,273 bytes. It fits M only at very dense sizes—version 38 holds 2,099 bytes. The existing envelope ceiling therefore cannot imply comfortable camera readability or maximum error correction. [MOB-10]

## 1. What the repository actually establishes

The reviewed implementation baseline is unmerged PR26 at `94554ecf9854e4604f9f56afe5bebedeee931994`; main is separately pinned at `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. Do not describe PR26 work as merged or shipped.

`05-mobile.md` selects **WalletConnect EthereumProvider 2.26.0 as a research candidate**, with upstream commit `63094dcb6fded05dcbc2b08b8895ada75a31dcb5`, AppKit 1.8.19 and UniversalProvider 2.26.0. It does not select a production connector, wallet URI, return origin, project, or live session. Existing injected EIP-1193/EIP-6963 work and local emulation are explicitly insufficient for mobile-handoff support. [MOB-R1]

T75's isolated evaluation exercised public `@walletconnect/utils` helpers, not EthereumProvider/SignClient or a physical wallet. Four of five cases passed; its stronger complete-URI roundtrip expectation failed because `parseUri` returned an empty `protocol`. The record distinguishes that application expectation from an unproven upstream-contract bug. Namespace compatibility and topic presence did not establish account ownership, live-session validity, controller authority, or expiry. Preserve this finding; do not make it disappear by injecting a default protocol into a passing fixture. [MOB-R2]

The QR baseline already prohibits scan-triggered navigation, connection, signing, and import; caps a single envelope at 2,048 UTF-8 bytes; defers animation; and routes encrypted G03 backups through files. `qr-profile` is still proposed/draft with no selected readers or writers. The existing recovery-reference export is expressly `unverified-offline-reference`, limited to inspection, with its own 128-KiB export ceiling. That ceiling is not the QR specification's separate 64-KiB public-envelope file limit. [MOB-R3] [MOB-R4] [MOB-R5]

The browser support records establish particular **Chromium/Linux local automation** scopes. They leave Firefox, WebKit, mobile and physical-device support unassessed. T73's desktop keyboard-zoom result and T99's browser-tooling policy record cannot substitute for Safari/iOS, physical cameras, VoiceOver/TalkBack, or reviewed translated safety copy. No browser or device tests were run for this note. [MOB-R6] [MOB-R7] [MOB-R8]

## 2. First wallet and transport: a bounded pilot

Recommended candidate: **MetaMask Mobile 8.18.0 + the already researched WalletConnect EthereumProvider 2.26.0**, EVM EOA only, one approved chain, one selected account. The official MetaMask release record identifies 8.18.0, published November 2, 2026; this identifies a reproducible candidate, not an installed binary or demonstrated WalletConnect compatibility. Capture actual store/build identifiers, OS/browser versions and provenance before any compatibility claim. If this tuple cannot negotiate the required methods, record rejection and choose a separately documented replacement. [MOB-17] [MOB-R1]

| Option | Disposition and reason |
| --- | --- |
| Existing injected EIP-1193 adapter in MetaMask's mobile browser | Useful separate qualification row; reuses existing boundaries. Passing it does not close external browser-to-wallet switching. |
| WalletConnect 2.26.0 with MetaMask Mobile 8.18.0 | First external-handoff candidate. Requires explicit relay/project/G05 policy, session storage and return contract before integration; the T75 helper findings remain open evidence. |
| MetaMask Connect | Evaluate only if the first candidate fails requirements. Current official docs describe a replacement for legacy MetaMask SDK using CAIP-25 and a new relay architecture. It is a separate dependency/session/egress intake, not a drop-in assumption. [MOB-18] |
| WalletConnect Link Mode | Defer. Its published purpose is native-dapp/native-wallet transport over Universal Links; it does not establish support for this static browser app or remove its network-policy decisions. [MOB-04] |
| Solana and hardware-wallet variants | Separate profiles. See the companion Solana research note (report 06) for raw G16 signing versus off-chain-message formats. No support inferred from an EVM result. |

EIP-1193 defines transport-independent requests and provider events; “connected” means RPC connectivity, not account authorization or transaction finality. Require fresh account/chain checks and generation invalidation across `accountsChanged`, `chainChanged` and disconnect. Handle rejection, unauthorized, unsupported-method and disconnection distinctly. EIP-6963 provides discovery; its `rdns` and branding are not identity attestations. Preserve the repository's explicit provider selection and unverified branding. [MOB-01] [MOB-02]

### Contract to freeze before a mobile adapter

Record these fields in the existing profile, not a new generic facade:

1. **Transport and authority:** exact package graph/source/artifact pins; selected wallet/build; allowed chain/account; required signing method `eth_signTypedData_v4`; `eth_sendTransaction` only for an admitted, explicit transaction flow. No `eth_sign`, `personal_sign`, raw-transaction-signing fallback, social login or embedded custody merely because an SDK example enables it.
2. **Session:** bind the approved session topic/controller and negotiated CAIP account/chain/method/event set to the selected account generation and local operation. Track pairing, session and request expiry separately, in their documented units. A compatible namespace is a capability agreement, not proof of the selected account. Refuse excess or changed authority under an explicit policy rather than silently using it. The pinned Sign specification distinguishes approved sessions from proposals/pairing and describes controller updates and seconds-based expiry; evaluate it against the actual SDK version. [MOB-05] [MOB-06]
3. **Navigation:** freeze the wallet's actual launch scheme/host/path and exact permitted browser return origin/path. Permit no arbitrary callback navigation, raw transaction bytes, signature claims or finality in URL parameters. A public browser return route carries no secret or session capability. Correlate it to an outstanding local operation; even a matching token only triggers reconciliation.
4. **Recovery:** persist the encrypted pending intent and journal checkpoint **before** a launch/send can occur. Bind operation ID, signed terms hash, account, chain, provider/session generation and available transaction reference. If persistence fails, do not launch the sensitive operation. Missing local state requires explicit reconnect/review and independent chain reconciliation; restored ciphertext retains G03 fresh-key recovery and cannot restore a spending key.
5. **Return:** treat return, visibility and `pageshow` events as possibly duplicated or absent. Re-read current wallet/session authority, expiry and chain state; classify an interrupted submit as unknown until reconciled. No automatic signing, submission or resend. A late success after local cancellation cannot authorize another send.

WalletConnect warns against using session-proposal redirect metadata after QR scans, where the user may have scanned on a different device. Its iOS guidance also requires wallet launch directly from user interaction; intermediate asynchronous work can disrupt universal-link behavior. Resolve that tension by preparing/checkpointing first, then showing a separate, explicit **Open wallet** action. Provide persistent “Return to the browser” instructions and a manual resume action. Cross-device QR and same-device linking need separate recorded launch contexts. [MOB-03]

Chrome's lifecycle guidance says frozen pages suspend timers/callbacks and discarded pages may receive no event. Hidden is the last reliably observable opportunity to save, but it is not a guaranteed durable-write completion point. Checkpoint earlier; use lifecycle events to revoke stale in-memory authority, stop camera tracks and reconcile on return. Do not depend on `unload`, a running Worker, a heartbeat, or a timeout firing while suspended. [MOB-07]

## 3. QR profile decisions

### Per-type meaning comes before scanner implementation

| Payload type | Recommended first contract | What successful decoding cannot establish |
| --- | --- | --- |
| Public address | Explicit chain and full address; unsigned/unverified label; preserve exact atomic-unit semantics where amounts exist. | Ownership, intended recipient, payment authorization. |
| Recovery fingerprint | Artifact format/version, byte length, SHA-256 of the **original file bytes**; no backup ciphertext, key, mnemonic or download capability. | Backup decryptability, authentic origin, transaction state or recovery authority. |
| Release fingerprint | Reference a particular manifest/artifact identity; run ordinary G15 trust verification separately. | Trust merely because a displayed digest matches. |
| Trade invite | Compact reference to already authenticated, current G16 terms, chain and identity; separately authorize G05 retrieval and revalidate before funding. | Current agreement, accepted terms, identity or permission to fetch/fund from an unsigned wrapper. |
| Payment request | Separate explicit chain/asset/recipient/base-unit amount review. ERC-681 may be an optional compatibility parser after a strict subset is specified. | Escrow funding equivalence, trade acceptance or authority to invoke arbitrary contract functions. |
| Wallet pairing | Connector-owned `wc:` flow, short-lived sensitive pairing material, explicit connect permission. Never process it as an ordinary public-share envelope. | Session approval or signing authority from possessing/scanning the URI. |

ERC-681 allows an omitted chain, ENS names, scientific notation and ABI function calls. Those are unsuitable as implicit defaults for immutable trade terms: require explicit chain, resolved full address and exact integer base-unit amount in the admitted subset; reject arbitrary functions/duplicate or unknown parameters. An ERC-681 request is a proposed payment, not a signed P2P agreement. [MOB-08]

Keep RFC 8785 canonical JSON for the public envelope. Reject duplicate keys **before** a parser collapses them, invalid Unicode, unsafe numeric values and unknown fields. Represent token amounts as canonical decimal integer strings; safe integer UTC seconds are appropriate for timestamps. The payload hash covers only the payload: it cannot authenticate `type`, chain, request ID, expiry or origin metadata. Freeze which fields the type-specific signed domain binds; otherwise those wrapper fields remain untrusted hints. Do not introduce a universal QR signing key or reuse release-signing authority for trade messages. [MOB-09] [MOB-R3]

For the first profile, propose **single-frame UTF-8 canonical JSON, 1,024 bytes maximum including the envelope, fixed Q error correction, no compression, no multipart, and a four-module quiet zone**. This is a proposed tightening of the existing 2,048-byte ceiling, not an adopted change. A 1,024-byte payload fits Q at version 31; it is still dense. The generator should select the smallest fitting version, keep modules crisp, and refuse a display size that cannot preserve its tested module pitch. Larger content takes the file/manual route. Neither capacity mathematics nor error correction proves physical scan performance. [MOB-10] [MOB-11]

**Codec candidates:** Nayuki's TypeScript encoder exposes segment input, version limits, mask selection and fixed error-correction control; jsQR exposes raw image decoding and leaves camera lifecycle to the application. This pairing gives separate encoder and decoder implementations and explicit camera ownership. Read source rather than adopting a remote image service. Before selection, pin source/package/build/license/provenance under G06, constrain image dimensions/pixel count and worker execution, and compare independently generated fixtures. Their documentation is capability evidence, not a security or performance assessment. [MOB-15] [MOB-16]

Keep UR/BCUR deferred. Blockchain Commons UR specifies typed CBOR/Bytewords and multipart reconstruction, adding format, type registry, fragment-mixing, memory and timeout decisions. Its current document reserves `ur:bytes` for testing/validation; “just wrap the backup as bytes” is not a justified production profile. QR transport also does not provide message authentication. A future need for hardware-wallet interoperability would require the exact device-supported UR type and independent vectors. [MOB-14]

The cited Media Capture and Streams **Candidate Recommendation Draft (2025-10-09)** requires a secure context and permission for camera access; a `getUserMedia` call from a document that is not fully active rejects with `InvalidStateError`. Separately, the proposed application policy is to start capture only from the explicit scan action; stop all tracks on accept, cancel, background or disposal, discard late decode results after cancellation, and require a new action before restart. Use one reviewed candidate per scan. Supply paste, local image/file and manual entry flows with the same validation and review; camera refusal or same-device use must not block recovery. [MOB-12] [MOB-R3]

## 4. Exact acceptance matrix and evidence threshold

Every row below is **proposed work**, not a newly measured pass. Each receipt must identify app commit/build hash, wallet+connector+OS+browser versions, physical model where applicable, locale, assistive technology, fixture/hash, network policy, actual observation, expected result and reviewer. Mark blocked and unsupported distinctly from failed.

| Qualification | Required cases | Acceptance condition |
| --- | --- | --- |
| Session contract, local | Wrong topic/controller/account/chain/method; extra permissions; revoked/expired session; seconds/milliseconds mismatch; stale generation; malformed/duplicate URI fields; T75 protocol result | No active authority from compatibility predicates or callback metadata; precise refusal; original T75 finding retained. |
| Ambiguous operation, local then physical | Reject, cancel, network loss, late response, duplicate return, wallet/chain change before and after prompt, process kill after submission | Durable journal; at most one explicitly authorized send; unknown outcome reconciled; no automatic replay. |
| Android external switch | Exact Android/Chrome + MetaMask 8.18.0 + pinned connector; app installed/missing/locked; manual return; network change; background/low-memory eviction | Observed correct wallet launch and recoverable return, with account/session revalidation. Emulator pass does not qualify this row. |
| iOS external switch | Exact iPhone/iOS/Safari + same wallet/connector; manual return, tab switch, lock, wallet refusal, eviction | Full recovery through manual return; no dependence on automatic browser redirection. |
| Browser lifecycle/storage | BFCache back/forward, duplicated `pageshow`, reload, hidden/frozen/discarded page, IDB abort/storage pressure, missing vault, fresh-origin restore | No stale authority or resumed signing; recovery preserves fresh keys; unavailable storage prevents unsafe progress. |
| QR byte semantics | All admitted types; exact capacity boundary; Unicode/duplicate keys; hash mismatch; expired/repeated invite; wrong chain; URI masquerading; overlarge file/image | Byte-exact independent roundtrip; bounded refusal before state mutation; scan makes no network/sign/send request. |
| Physical optical matrix | Each admitted type on Android/iOS cameras and desktop webcam; screen/print, low light, glare, rotation, partial damage, inverted image, maximum-size payload | Normal supported cases decode exact bytes; difficult cases fail safely with useful fallback. Record dimensions/distance/light and outcomes; do not invent universal scan-rate thresholds. |
| Accessibility/locale | Keyboard-only, desktop zoom, VoiceOver/Safari, TalkBack/Chrome; 200% text, 320-CSS-pixel reflow, focus visibility, target size, status/error announcements, RTL and long translated strings | Independent completion of review/cancel/fallback/recovery, without truncated recipient/amount/chain or inaccessible confirmation. Record reviewed safety-copy version. |

WCAG 2.2 supplies testable criteria, including 200% text resizing, 320-CSS-pixel reflow, focus not obscured, 24×24-CSS-pixel minimum targets subject to its exceptions, accessible authentication and financial/data error prevention. Assess complete flows rather than treating an automated rule score as conformance. Translation review must preserve the difference among “wallet returned,” “submitted,” “confirmed” and “finalized,” and keep base-unit and fiat displays unambiguous. [MOB-13]

The remaining external evidence is concrete: actual wallet/OS/browser tuples, verified launch handling, physical optical results, assistive-technology task completion and reviewed safety copy. No additional generic wrapper or literature search can supply those observations. The next engineering artifact is a selected profile with golden vectors and bounded failure expectations; qualification closes only the rows actually observed.

## References and source limitations

All sources below were opened/read during this research. Upstream documentation is mutable unless a revision or content blob is recorded. Machine-readable bibliography entries record supported claims and limitations; repository references remain pinned to the reviewed PR head. Library source intake and wallet binary provenance remain future work.

[MOB-01]: https://eips.ethereum.org/EIPS/eip-1193 "EIP-1193: Ethereum Provider JavaScript API"
[MOB-02]: https://eips.ethereum.org/EIPS/eip-6963 "EIP-6963: Multi Injected Provider Discovery"
[MOB-03]: https://docs.walletconnect.com/wallets/ios/mobile-linking "WalletConnect: iOS Mobile Linking"
[MOB-04]: https://docs.walletconnect.com/wallets/features/link-mode "WalletConnect: Link Mode"
[MOB-05]: https://github.com/WalletConnect/walletconnect-specs/blob/ecbbf6e114687812fd0366fb59dff8c0a8e3c9ec/docs/specs/clients/sign/data-structures.md "Pinned Sign session data structures"
[MOB-06]: https://github.com/WalletConnect/walletconnect-specs/blob/ecbbf6e114687812fd0366fb59dff8c0a8e3c9ec/docs/specs/clients/sign/namespaces.md "Pinned Sign namespaces"
[MOB-07]: https://developer.chrome.com/docs/web-platform/page-lifecycle-api "Chrome: Page Lifecycle API"
[MOB-08]: https://eips.ethereum.org/EIPS/eip-681 "ERC-681: URL Format for Transaction Requests"
[MOB-09]: https://www.rfc-editor.org/rfc/rfc8785 "RFC 8785: JSON Canonicalization Scheme"
[MOB-10]: https://www.qrcode.com/en/about/versionPage/versionPage31_40.html "DENSO WAVE: QR versions 31-40 capacity table"
[MOB-11]: https://www.qrcode.com/en/howto/code.html "DENSO WAVE: QR code area and quiet zone"
[MOB-12]: https://www.w3.org/TR/2025/CRD-mediacapture-streams-20251009/ "W3C Media Capture and Streams, Candidate Recommendation Draft 2025-10-09"
[MOB-13]: https://www.w3.org/TR/2024/REC-WCAG22-20241212/ "WCAG 2.2 Recommendation, 12 December 2024"
[MOB-14]: https://github.com/BlockchainCommons/Research/blob/e4a4fbb186e2e7625ccdf7149aec4f0a5adaf850/papers/bcr-2020-005-ur.md "Blockchain Commons Uniform Resources; content blob 84e2651ad248466a47ebdbf913be74726e15301f"
[MOB-15]: https://github.com/nayuki/QR-Code-generator/blob/bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d/Readme.markdown "Nayuki encoder README; content blob f603cbe26f1cbb90d6c704e748030a772e0fd8e7"
[MOB-16]: https://github.com/cozmo/jsQR/blob/8e6a036beafa7053dd44b1b76ac578d22b1b3311/README.md "jsQR README; content blob d1932735ca0277294a6016b52df106e6d67f3a94"
[MOB-17]: https://github.com/MetaMask/metamask-mobile/releases/tag/v8.18.0 "MetaMask Mobile release 8.18.0"
[MOB-18]: https://docs.metamask.io/metamask-connect/ "MetaMask Connect overview"
[MOB-R1]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/05-mobile.md "Repository mobile profile"
[MOB-R2]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/mobile-wallet/README.md "T75 wallet-helper evaluation and limitations"
[MOB-R3]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.4_qr_interchange/spec-qr-everywhere-secure-sharing-and-import-export.md "Repository QR design baseline"
[MOB-R4]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/qr-profile.proposal.json "Draft QR profile proposal"
[MOB-R5]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/recovery-reference.ts "Offline recovery-reference contract"
[MOB-R6]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/browser-support.json "Recorded browser-support scope"
[MOB-R7]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json "Canonical remaining-work records"
[MOB-R8]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/qualification/browser-tooling-policy.json "T99 browser-tooling policy qualification limits"
