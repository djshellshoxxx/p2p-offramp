# Transport policy enforcement

## 1. Metadata

- **Specification ID:** G05
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Provide one policy boundary for app-owned RPC, relay, map, proof, and update traffic. Prevent silent direct fallback when private routing is required. Ordinary browsers do not expose app-controlled Tor routing; a routing label MUST describe enforceable evidence for a channel, not the entire device.

## 3. Architecture and data flow

The application constructs a session-scoped policy broker. Adapters receive broker capabilities rather than global fetch/WebSocket references. Every request is authorized before adapter invocation. Wallet-extension traffic is a separate channel because the app does not own it. Optional map/proof/update adapters remain disabled unless their channel policies are satisfied.

```typescript
type Channel = "rpc" | "relay" | "map" | "proof" | "update" | "wallet";
type Mode = "ordinary" | "strict";
type Coverage = "direct" | "verified-private" | "unknown" | "unsupported";
interface RouteEvidence {
  channel: Channel;
  coverage: Coverage;
  adapterId: string; // reviewed registry ID, <=64 ASCII characters
  generation: number; // nonnegative safe integer
}
interface RequestPolicy {
  channel: Exclude<Channel, "wallet">;
  endpointId: string; // validated endpoint registry key
  method: "read" | "publish";
}
```

Evidence is issued by a reviewed adapter registry, never accepted from a relay response, query parameter, arbitrary plugin, or user-supplied JSON. `verified-private` requires an enforced private transport and recorded integration tests; merely configuring a proxy is `unknown`.

## 4. Policy algorithm and limits

1. Broker starts with all evidence `unknown`. Ordinary mode may authorize explicitly configured direct endpoints after visibility notice. Strict mode authorizes only `verified-private` evidence for the requested channel.
2. An endpoint MUST use a registered HTTPS/WSS origin. User custom endpoints require explicit configuration and validation; URL userinfo and fragments are rejected. No automatic endpoint discovery from advertisements. Disable redirects for HTTP requests; redirects require a separately registered request. WebSocket server redirects and upgrade behavior require adapter-specific tests.
3. Each policy/mode/evidence change increments broker generation, closes active relay sockets, aborts in-flight requests, and invalidates previously issued permits. Queued work reauthorizes under the new generation. No switch can retract bytes already sent; the UI must say so.
4. A private adapter failure revokes evidence and returns `ROUTE_UNAVAILABLE`; it never invokes direct transport. Ordinary fallback also requires an explicit new user choice and generation change.
5. HTTP response bodies are streamed with a 1 MiB cap; relay messages have a 64 KiB cap; connection attempts time out after 15 seconds; a request lasts at most 30 seconds. Specialized proof downloads must have their own explicit bounded spec, never bypass the broker through this default.
6. A wallet with unknown/direct routing cannot sign in strict mode. Watch-only local views remain available. Strict mode unavailable is a valid state, not a reason to relabel unknown coverage as protected.

These are project limits. No new cryptographic primitive or browser-wide proxy enforcement is specified.

## 5. Complete interface and lifecycle

```typescript
type RouteError = "INVALID_ENDPOINT" | "ROUTE_UNAVAILABLE" |
  "POLICY_BLOCKED" | "CANCELLED" | "LIMIT_EXCEEDED" | "TIMEOUT";
interface Permit { readonly generation: number; readonly endpointId: string; }
interface TransportPolicy {
  setMode(mode: Mode): void;
  inspect(channel: Channel): Readonly<RouteEvidence>;
  authorize(request: RequestPolicy): Permit | RouteError;
  isCurrent(permit: Permit): boolean;
  revoke(adapterId: string): void;
  dispose(): void;
}
```

Permits are opaque broker-issued capabilities; the shown fields are inspection only and callers cannot construct a valid one. Adapters check permit identity and generation immediately before I/O and before returning results. The broker owns cancellation controllers and socket handles so `dispose` and revocation close them. The UI displays mode, each active channel's coverage, and unavailable reason. Never persist or export an old private-route permit as reusable evidence.

## 6. Threat assessment

A malicious adapter can bypass injected dependencies; therefore adapters are reviewed bundled code, not an untrusted plugin sandbox. Static import rules and browser network recording MUST test broker coverage. CSP restricts origins as defense in depth but does not prove private routing. Timing, IP visibility at endpoints, wallet routing, DNS, remote redirects, browser extensions, and OS compromise remain separate risks. Diagnostics include fixed codes and adapter IDs only, never full RPC query URLs, signed payloads, wallet accounts, or private route credentials.

## 7. Verification and references

Use spy adapters to test the full mode-by-coverage matrix for every channel. In strict mode, direct/unknown/unsupported evidence MUST produce zero network calls. Revoke a private route during queued requests, streaming HTTP, active WebSocket, wallet preparation, and mode switching: no new direct call may occur and stale results must not publish. Test already-aborted signals, timeout, redirects, oversized chunks, forged permits, stale generations, and disposal. Browser integration must capture fetch, XHR, WebSocket, image, worker, form, and beacon requests; fail if sensitive app traffic bypasses the approved path. Real Tor/I2P validation is required before registering any such adapter as private.

Primary references: [Fetch standard](https://fetch.spec.whatwg.org/), [DOM abort algorithms](https://dom.spec.whatwg.org/#abortsignal), [CSP3](https://www.w3.org/TR/2026/WD-CSP3-20260916/). CSP3 is a Working Draft; browser behavior requires tests.
