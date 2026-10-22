# External wallet provider boundary

## 1. Metadata

- **Specification ID:** G10
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Provide explicit wallet discovery, connection, signing and submission while keeping spending keys outside the app. Wallet branding, installed extension presence and a successful callback are not proof of trustworthy provider behavior or finalized transactions.

## 3. Architecture and interface types

```typescript
interface WalletSession {
  providerId: string;
  chain: "evm" | "solana";
  networkId: string; // approved G11 registry ID
  account: string; // validated chain-specific canonical account
  generation: number; // nonnegative safe integer
  capabilities: Readonly<{ signTerms: boolean; sendTransaction: boolean;
    signTransaction: boolean }>;
}
type WalletEvent = { kind: "invalidated"; generation: number;
  reason: "accounts-changed" | "chain-changed" | "disconnected" | "provider-lost" };
interface WalletAdapter {
  connect(providerId: string, networkId: string, signal?: AbortSignal): Promise<CoreResult<WalletSession>>;
  inspect(): Readonly<WalletSession> | null;
  signTerms(session: WalletSession, encodedTerms: Uint8Array,
    signal?: AbortSignal): Promise<CoreResult<Uint8Array>>;
  submit(session: WalletSession, intentId: string,
    signal?: AbortSignal): Promise<CoreResult<{transactionId: string}>>;
  subscribe(listener: (event: WalletEvent) => void): () => void;
  disconnect(): Promise<void>;
  dispose(): void;
}
```

Family-specific adapters implement native requests. EVM uses EIP-1193 request/events, with EIP-6963 discovery on explicit user interaction; typed terms use the separately approved EIP-712 terms schema. Solana uses a selected reviewed Wallet Standard adapter with declared transaction/message features and exact supported transaction versions. EVM transaction objects are never passed into Solana APIs or vice versa. Core does not request seed phrases, private keys, generic arbitrary-message signing, wallet export or an unrestricted provider method from UI.

## 4. Discovery and signing algorithms

No wallet discovery broadcast, connect prompt, account request or session restoration occurs on initial page load. On explicit Connect action collect at most 16 announced providers during a 3-second discovery window, validate bounded metadata and display choices. Repeated discovery is explicit and deduplicated by provider identity in this document; identity/brand is not cryptographic authentication. Ignore provider-supplied SVG/HTML/icon URLs and use bundled neutral/local icons. Do not render provider metadata as active content.

Connect validates the approved registry network, actual provider chain/account and supported capabilities. Register account/chain/disconnect listeners and increment generation on any relevant change. A newly connected account requires new consent; there is no automatic retry of a signing request. Disconnect clears app handles/subscriptions; remote permission revocation is provider-specific and must not be promised if unsupported.

Before terms signing or submit, require the exact current session identity/generation, requery account/network, pass G05 wallet routing policy and G11 live deployment preflight, and show exact chain/asset/address/amount/expiry/allowance/fee intent. EVM terms require typed-data signing support; never downgrade to personal_sign/eth_sign or an unstructured hash when unsupported. Solana terms use the approved domain-separated terms encoding; generic message signatures cannot be accepted as equivalent EVM typed data. Unsupported features fail closed.

Submit accepts only a durable G12 intentId. It loads/validates the stored exact prepared request, reserves the pre-send state through G12 and invokes a send-capable method once. This adapter/coordinator boundary owns markSending; callers must not mark/send twice. Validate the returned ID, then reconcile independently on-chain. UI cancellation or disconnect cannot retract a transaction already sent. No raw signed payload is logged or placed in a URL.

## 5. Errors, cancellation and lifecycle

EIP-1193 user rejection 4001 maps to USER_REJECTED only when the request is known not to have submitted. Unauthorized/disconnected/chain errors map to UNAUTHORIZED, UNAVAILABLE or WRONG_CHAIN at preparation; errors after a send-capable call begins are assessed conservatively as BROADCAST_UNKNOWN unless a verified no-send rejection applies. Solana native errors follow the same outcome rule, not an invented EIP code mapping.

Wallet prompts have no automated timeout/resubmission loop. User cancellation stops app progression and invalidates late outputs, but an external wallet may still complete its action. G12 remains unresolved if submission could have happened. Generation changes invalidate pending terms signatures/preparations; already submitted records remain under original account/network. `dispose` removes every listener and revokes handles synchronously. A wallet with unknown routing is ordinary-mode only and cannot be self-declared private by provider metadata.

## 6. Threat assessment

Injected provider imitation, misleading metadata, malicious callbacks, account switching during prompts, replayable signatures and mobile deep-link hijacking can compromise consent. Treat providers as adversarial interfaces, validate results and show full immutable terms. Return/deep-link handlers may resolve only existing opaque session IDs and cannot execute a transaction from URL data. Origin binding and mobile transport details require the separate compatibility spec and device tests before those providers are enabled. External wallet UI/OS compromise remains outside this adapter's protection.

## 7. Verification and references

Fake EVM/Solana providers test discovery storms, duplicate/malformed announcements, malicious icon/metadata content, account and chain changes at each async boundary, unsupported typed signing, provider loss, malformed signatures/transaction IDs and forged success. Assert one send call per intent, pre-send journal durability, no personal_sign downgrade and zero wallet prompt on startup. Test late wallet response after app cancel and actual chain reconciliation after callback. Browser/mobile/hardware providers require a recorded compatibility matrix; this spec does not approve any provider yet. Sources: [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [Wallet Standard](https://github.com/wallet-standard/wallet-standard), [Solana transactions](https://solana.com/docs/core/transactions). Pin SDK/provider revisions under G06.
