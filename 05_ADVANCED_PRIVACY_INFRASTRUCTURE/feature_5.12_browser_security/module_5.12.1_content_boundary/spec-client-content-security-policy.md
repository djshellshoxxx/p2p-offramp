# Client content security policy

- **Specification ID:** G04
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.12_browser_security
- **Module:** module_5.12.1_content_boundary
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 0

## Scope

Define browser execution and rendering boundaries for the static client. Treat relay messages, wallet responses, maps, and remote configuration as untrusted input.

## Required behavior

1. Bundle dependencies locally; prohibit remote executable scripts and rendering message HTML.
2. Specify CSP for HTTPS hosting and gateway deployment, approved connect destinations, worker restrictions, and a policy for user-added relays.
3. Separate transport confidentiality from trusted-client integrity; no CSP claim may imply protection from a malicious host replacing the entire application.

## Dependencies

- [G01: Client key lifecycle](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.11_key_management/module_5.11.1_key_lifecycle/spec-client-key-lifecycle.md)

## Acceptance evidence

- XSS payloads in all external text render inertly.
- Production build runs under the intended CSP with no unexpected outbound destinations.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
