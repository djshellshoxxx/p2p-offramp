# ISP and access-network observation

## 1. Metadata

- **Specification ID:** TH01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Model an observer that controls or monitors the trader's access network but cannot break properly authenticated TLS or compromise endpoints. The goal is bounded disclosure and honest routing labels, not guaranteed anonymity against global correlation.

## 3. Architecture and observation matrix

| Observer sees or controls | App protection | Remaining exposure |
|---|---|---|
| Destination IP, packet sizes and timing | G05 enforced private route where supported | First hop and traffic correlation remain |
| DNS queries | Route-specific resolver configuration and tests | Browser/OS/extension lookups may be outside app control |
| HTTP content without TLS | HTTPS/WSS-only endpoint registry | Malicious endpoint still sees application data |
| Connection failure or censorship | Bounded failure with explicit status | Availability cannot be guaranteed |
| Wallet-extension traffic | Independent routing evidence | Unknown wallet coverage blocks strict signing |

RPC, relays, maps, update checks, proof services and wallet traffic are separate channels. A Tor browser session does not prove a wallet extension's traffic follows the same route.

## 4. Required algorithms and invariants

Before opening a network connection, the broker must evaluate channel, endpoint and current generation under G05. Ordinary direct mode requires a visible direct-connection label. Strict mode requires verified private coverage per channel. Mixed direct/private traffic cannot receive an aggregate protected badge. A route failure invalidates permits and closes sockets; never retry directly. Do not send diagnostics, connectivity probes, external fonts, avatars, or explorer previews outside policy. A privacy-mode change takes effect for future I/O and cannot hide earlier traffic. The client does not implement packet padding or global traffic mixing in v1 and MUST NOT claim resistance to a global timing observer.

No new cryptographic primitive or ZK circuit is defined in this threat model.

## 5. Interfaces and failure recovery

Use the G05 `RouteEvidence` and `TransportPolicy` interfaces. UI state is a projection of actual broker evidence: `direct`, `verified-private`, `unknown`, `unsupported`. Persist user preferences only; evidence and permits are recreated every session. Endpoint health checks are ordinary policy-authorized reads and cannot bootstrap trust in a routing path merely by succeeding. Fixed error codes distinguish policy refusal from remote timeout without recording destination paths or payloads.

## 6. Threat assessment

Network MITM may replace unprotected downloads or downgrade HTTP: reject insecure endpoint schemes and verify versioned release artifacts. A valid TLS certificate authenticates an endpoint, not its honesty. Private routing shifts trust to route infrastructure and may reveal the destination to the exit or service. No UI may present a VPN/Tor checkbox as a proof that browser, wallet, DNS, OS, and all extensions are hidden.

## 7. Verification and references

Capture browser and test-device network traffic for ordinary mode, strict mode, private-route outage, reconnect, page load and wallet signing. Test DNS and wallet traffic separately and record the capture boundary; a page-only trace is insufficient to prove OS-wide coverage. Spy tests assert zero direct requests after strict-route loss. Simulate captive portal, TLS failure, redirect and endpoint censorship. Expected result is refusal or explicit degraded state, never hidden fallback.

Normative project dependency: [development roadmap](../../../DEVELOPMENT_ROADMAP.md). See G01–G06 for key, vault, backup, content, transport and dependency enforcement. Threat models define required properties; passing fixtures is not a whole-product security certification.
