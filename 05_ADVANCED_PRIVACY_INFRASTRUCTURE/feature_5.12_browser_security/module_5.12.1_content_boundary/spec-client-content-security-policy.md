# Client content security and rendering boundary

## 1. Metadata

- **Specification ID:** G04
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Prevent untrusted order/chat/QR/receipt data from becoming active content and restrict outbound resources in the static client. CSP is defense in depth and does not establish private transport, wallet correctness, or protection against a compromised build.

## 3. Architecture and data flow

All imported content passes bounded schema validation before state reducers and text rendering. React components render strings as text; HTML/Markdown rendering, SVG imports, embedded remote images, user CSS, scripts, and arbitrary link previews are disabled in the core client. Public order text is capped at 4096 UTF-8 bytes; private chat at 16384 bytes before encryption; these do not override smaller protocol limits. QR input follows its own bounded importer and cannot directly invoke wallet actions.

Build output contains local scripts/styles/fonts only. No CDN script, third-party analytics, remote fonts, inline event attributes, `eval`, `new Function`, or HTML sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML`, `document.write`) are allowed in core code. Tests may include malicious strings as inert fixtures.

## 4. Policy construction algorithm

The deployment pipeline emits a per-release CSP from the validated endpoint registry. Minimum directives:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
font-src 'self'; connect-src <explicit HTTPS/WSS origins from registry>;
worker-src 'self'; manifest-src 'self'; base-uri 'none';
object-src 'none'; form-action 'none'; frame-src 'none';
frame-ancestors 'none'
```

`<explicit ...>` is generated deployment data, never shipped literally. No wildcard host, `data:` script, `blob:` script/worker, `unsafe-inline`, or `unsafe-eval` is permitted. External wallets requiring frames or additional connections need a reviewed capability-specific policy and tests before enablement; core has no embedded wallet frame. WASM proof providers remain disabled in core; do not loosen all script execution to enable a future provider.

Prefer HTTP CSP headers with `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Static hosts that cannot set headers use a CSP meta tag before all resource tags and `<meta name="referrer" content="no-referrer">`. `frame-ancestors` cannot be enforced by CSP meta, so such deployment MUST display that clickjacking protection is unverified, not claim equivalent header protection. Link navigation always uses an explicit UI action, exact validated HTTPS URL, `rel="noopener noreferrer"`, and no private query data. Host CSP limitations remain a release-profile capability.

Custom endpoint changes outside the build allowlist require a rebuilt policy; never silently broaden `connect-src` at runtime. CSP does not prevent every same-origin exfiltration mechanism.

## 5. Interfaces and failure behavior

```typescript
interface ContentPolicyManifest {
  version: 1;
  releaseId: string;
  connectOrigins: readonly string[]; // exact normalized HTTPS/WSS origins
  delivery: "header" | "meta";
  framingProtected: boolean;
}
interface SafeExternalLink { href: string; label: string; }
```

A build validator accepts only registry-owned origin entries, rejects credentials/path/query/fragment/wildcards, and emits deterministic sorted directives. `framingProtected` is true only when deployed header behavior is verified. Runtime content validators reject invalid UTF-8, disallowed controls, and oversized input before rendering. Dangerous URIs (`javascript:`, `data:`, `file:`, `intent:` and malformed URLs) produce `INVALID_INPUT` without rendering clickable links. CSP violations become fixed local diagnostic counters; do not upload original blocked URI or document URL. Build validation failure blocks release output.

## 6. Threat assessment

HTML/script injection through chats or QR codes stays text. Homoglyph and bidirectional address confusion requires full canonical address display and chain-specific confirmation; CSP cannot solve it. Remote image tracking is blocked by disallowing user images and external image origins. Malicious dependencies and same-origin scripts still have app privileges: G06 provenance and static build review remain necessary. Meta-only hosting cannot promise anti-framing. Browser extensions, wallet UI, OS/browser bugs, and compromised DNS/TLS or host build delivery remain outside CSP's guarantee.

## 7. Verification and references

Test HTML, SVG, event attributes, script tags, bidi address samples, Markdown image links, embedded nulls, malformed Unicode, oversized bytes, and all dangerous URI schemes in every user-controlled field. Browser integration MUST attempt external script/font/image/iframe, inline script/event/style, eval, form submit, worker and WebSocket connections; assert the applicable policy blocks each and required local resources still load. Test header and meta deployment profiles separately. Test actual deployed responses, not configuration files alone. Audit production bundles for banned sinks and unapproved external origins; no source-only grep may be called complete XSS testing.

Sources: [CSP3 2026-09-16 Working Draft](https://www.w3.org/TR/2026/WD-CSP3-20260916/), [HTML CSP meta processing](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-content-security-policy), [Fetch referrer policy](https://w3c.github.io/webappsec-referrer-policy/).
