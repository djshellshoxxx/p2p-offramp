# Blue-team top-down architectural security audit — 2026-11-15

## Executive disposition

Repository: `djshellshoxxx/p2p-offramp`  
Reviewed branch: `integration/p2p-consolidated-20261109`

This fourth pass reviewed the repository as a system: product boundary, trust architecture, browser composition, worker isolation, trade authority, transaction journal, relay/exchange, escrow, release verification, CI automation and project acceptance evidence.

**New finding: BT-15 (P1), autonomous CI agent secret exposure through generated patch.**

No application code was modified. This report is a source/configuration review, not a runtime penetration test. No workflow was dispatched, no secret was accessed, no patch was generated, and no CI job was executed during this audit.

The product's own documentation is clear that this is still a development build: `ReleaseEnabled=0`, `connectOrigins=[]`, no approved default registry, no production release, and no real-funds readiness claim. Those are important controls. Keep them.

## BT-15 — P1: Autonomous development workflow can disclose its API secret through agent-authored changes

**Affected files**
- `.github/workflows/openai-agents.yml`
- `.github/agent-prompts/autonomous-development.md`
- `.github/agent-prompts/repository-scope.md`

**Observed design**
1. The workflow is manually dispatched and checks out the selected repository ref.
2. It passes `secrets.OPENAI_API_KEY` into the environment of the `codex exec --full-auto` process.
3. The agent reads repository-controlled prompt files and the repository's source/docs while operating with the secret in its process environment.
4. The agent stages all changes and exports a binary patch artifact.
5. The separate publish job applies that patch and blocks changes under `.github/`, `.env`, and files ending in `.pem` or `.key`.
6. The publish job does not scan the patch or resulting diff for secret values, credential-shaped strings, or secret-bearing generated files before creating a draft PR.
7. The prompt says not to expose API keys, but repository instructions are not a security boundary and cannot replace process isolation.

**Security consequence**
A malicious or compromised repository instruction, source file, dependency behavior, or agent action could cause the agent to copy the API key into an otherwise permitted source or documentation file. The patch artifact and draft PR are separate output channels; ordinary GitHub log masking does not protect an artifact or diff containing a secret. The write-capable publish job would then make the patch visible to PR readers.

The workflow is manually triggered, so this is not an unauthenticated remote exploit. It is a high-impact secret-handling weakness in the automation trust boundary, especially if a maintainer dispatches the workflow on a contributor-controlled or otherwise unreviewed ref.

**Recommended remediation**
1. Do not expose the long-lived API key to a repository-reading autonomous coding process if the CLI supports a safer short-lived credential broker or narrowly scoped token exchange.
2. Prefer a short-lived, quota-limited, revocable credential restricted to the required API operation and budget. Rotate/revoke immediately if an agent run is suspected to have exposed it.
3. Separate trusted orchestration instructions from repository-controlled content. Treat all repository text as untrusted data, not policy.
4. Run the agent in a network-restricted sandbox with only the minimum filesystem and process capabilities needed. Explicitly verify the sandbox's network behavior; do not assume `--full-auto` provides it.
5. Before artifact upload and again before PR publication, scan the complete patch for known secret values and common credential patterns. Fail closed on matches. A pattern scanner is defense in depth, not a substitute for preventing access.
6. Do not publish any patch generated from an untrusted ref without a maintainer-controlled review step. Consider restricting dispatch to the protected default branch and pinning trusted workflow/prompt content from that branch.
7. Ensure the publish job never receives the API key and that artifacts have minimal retention/access.
8. Add a regression test that plants a harmless sentinel secret in the agent environment and verifies the pipeline refuses to publish a patch containing it.

**Confidence:** High that the current workflow passes the secret to the agent and lacks a patch secret scan. The exact exploitability depends on the runner/CLI sandbox and dispatch permissions; those were not executed or independently verified here. P1 reflects the potential impact if an untrusted instruction influences the agent.

## Top-down architecture map and assessment

### 1. Product and release boundary

The README, operator guide and build configuration consistently describe a static client-side development product. The default app starts an encrypted local vault and offers read-only trade-terms review. The default build has no approved registry. Demo data is compile-time gated. Testnet registry trust is separately signed and verified. Wallet execution, relay, and other sensitive modules are excluded from the core application graph.

This is a coherent fail-closed posture. It also means the current shipped application is not yet the complete peer-to-peer off-ramp described in the roadmap. The project documentation acknowledges that distinction; maintain it in UI, marketing and release notes.

### 2. Browser composition and privilege boundaries

- `main.tsx` composes the vault application and read-only trade-review controller.
- `app-services.ts` hardcodes runtime configuration to `ReleaseEnabled: 0` and `connectOrigins: []`.
- The document Worker owns the vault endpoint; the public service interface returns status/commands rather than vault handles or private records.
- The runtime validates configuration before creating the Worker, tracks generations, times out requests, locks on lifecycle events and revokes stale operations.
- Build graph policy excludes wallet execution/adapter/terms modules and optional transport/relay modules from the shipped core graph.

**Assessment:** good least-authority architecture for the current offline shell. The separation should be preserved when online trading is integrated. Avoid passing raw providers, decrypted vault records, or wallet capabilities into UI components.

### 3. Identity and authorization

The repository separates storage encryption, messaging keys and external wallet spending authority. EIP-712 terms signing and contract-wallet verification are implemented as isolated/test-only components, while the application does not claim those operations are available in the shipped shell.

The previously documented D1 gap remains material: cryptographic bilateral peer acceptance is not yet a completed protocol authority. Relay/chat acceptance must not be confused with on-chain authorization or payment evidence. The escrow's seller-only release model also intentionally leaves fiat-receipt confirmation to the seller; it is not trustless fiat settlement.

**Assessment:** authority is correctly treated as a separate capability, but the product cannot be called a complete adversarially secure trade flow until the acceptance protocol, wallet authority and escrow lifecycle are integrated and independently tested together.

### 4. Trade state and chain truth

The domain authority reducer accepts observations only through an injected native-verifying reader and is explicitly disabled by default. It tracks generations, bounded reconciliation and contradictory chain observations. The transaction lifecycle and execution modules describe conservative single-send behavior, durable send markers and no automatic resend after uncertain outcomes.

These components are explicitly test-only/not wired into the app. The previous BT-01/G3 canonical reader mismatch and D9 durable recovery concerns remain release blockers until corrected and tested at the exact canonical deployment interface.

**Assessment:** the design direction is conservative. The critical risk is integration drift: tests of an injected reader or isolated lifecycle module do not establish that the eventual production composition uses the exact reviewed validator, deployment registry, journal and wallet session.

### 5. Messaging and discovery

Nostr order discovery, encrypted exchange, NIP-17/59 messaging and relay transports are isolated from chain authority. The exchange documentation correctly states that an accepted session is not funding and that relay messages are not chain evidence. The third audit's BT-14 finding remains: the trade-chat library's replay set is in-memory and requires a durable consumer-level dedupe guarantee.

**Assessment:** trust separation is sound on paper. The integrated system must preserve it at every UI event handler and side-effect boundary, including after reload, profile switch, cross-tab races and relay replay.

### 6. Vault and persistence

The vault uses authenticated encryption, version/revision binding, bounded schemas, IndexedDB CAS and recovery coordination. The runtime communicates with a dedicated Worker and exposes a narrow service surface. Prior source inspection found useful cross-tab invalidation and strict write-durability behavior.

The residual high-risk areas are browser/OS memory behavior, crash/restart semantics, physical-device/browser qualification, independent crypto review and backup/restore lifecycle testing. JavaScript buffer wiping is best-effort and cannot guarantee erasure of all engine copies.

**Assessment:** strong defensive engineering, but cryptographic correctness and real-world device qualification remain unproven by source review alone.

### 7. Smart contract and asset risk

The escrow uses immutable terms binding, seller nonce uniqueness, terminal state before payout, reentrancy protection and fixed-beneficiary deferred withdrawals. The constructor-fixed token allowlist is irreversible and cannot guarantee the future behavior of arbitrary allowlisted token contracts. The contract does not independently verify the off-chain buyer-acceptance protocol.

**Assessment:** the contract's local invariants are not a substitute for per-token/per-network review, independent Solidity audit, deployed-bytecode verification and a fully specified counterparty acceptance model. BT-10/BT-11 remain open.

### 8. Release and deployment trust

The offline release verifier deliberately does not provide installation authority, signing, a trust root, or live promotion. Testnet build trust is pinned and fails closed when the owner key pin is absent or the registry is not Sepolia. The operator guide says no production release is currently approved.

**Assessment:** no hidden production enablement was identified in the reviewed app composition. The release pipeline is intentionally incomplete. A future production path needs an independently controlled signing/trust-root lifecycle, reproducible build inputs, deployment verification, rollback policy, signed provenance and exact-host security-header verification.

### 9. CI and repository governance

The ordinary CI workflows use read-only repository permissions, pinned action SHAs, and run unit, browser, local-EVM, schema, crypto, build and contract checks. The manual autonomous-agent workflow uses a separate write-capable publish job and blocks agent patches to workflow/config paths. This separation is positive, but BT-15 shows that patch-path restrictions do not address secret exfiltration through permitted files.

The repository's acceptance-gate library correctly states that a passing local evidence report grants no release, deployment, signing or promotion authority. The spec inventory also labels the technical documents as design-review-pending rather than treating structural completeness as approval.

**Assessment:** the evidence model is unusually explicit. Keep human review and exact-commit CI as mandatory controls; do not treat an agent's self-reported tests or a local acceptance report as independent approval.

## Cumulative release blockers carried forward

The earlier audit reports remain authoritative for their detailed evidence. The main blockers are:
- BT-01: canonical escrow reader ABI mismatch / G3.
- BT-02 and BT-11: incomplete cryptographic bilateral peer acceptance and off-chain acceptance authority.
- BT-03: durable transaction recovery / D9.
- BT-04 and BT-08: full trading journey and integrated security qualification absent.
- BT-07, BT-09: cryptographic dependency and primitive review pending.
- BT-10: immutable ERC-20 allowlist requires token-specific safety qualification.
- BT-12: token behavior monitoring and incident response.
- BT-13: browser/device qualification incomplete.
- BT-14: durable cross-session chat replay deduplication gap.
- **BT-15: autonomous agent API secret exposure through patch output.**

## Recommended order

1. Fix BT-15 before running autonomous development against any untrusted branch or repository content.
2. Resolve G3 and D9, then implement and independently review D1.
3. Add durable, atomic, cross-session/cross-tab messaging deduplication.
4. Integrate the EVM trading path only behind the same validated registry, wallet session, journal and native chain reader contracts used by the reviewed tests.
5. Obtain independent crypto and Solidity reviews, including per-token deployment review.
6. Complete browser/device, testnet, incident-response and exact-host deployment qualification.
7. Keep `ReleaseEnabled=0` until every mandatory M0/M1/M2A gate has evidence on the exact candidate commit. Solana parity remains required for full Phase 2 scope as defined by the roadmap.

## Limits

This was a repository-wide source/configuration inspection using the branch tree and selected first-party files. It did not execute code, CI, agent workflow, browser tests, fuzzers, contract tests, RPC calls or testnet transactions. It does not prove that no other defect exists. The CI secret finding is a design-level risk based on the workflow configuration; actual sandbox/network behavior and exploitability require a controlled, non-secret sentinel test.
