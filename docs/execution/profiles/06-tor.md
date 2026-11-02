# Tor / browser private-transport profile

Decision: a companion-bound capability/failure model is locally implementable. A generic WASM Tor browser client or whole-browser private route is not selected or demonstrated.

Primary [Tor SOCKS extensions](https://github.com/torproject/torspec/blob/9114eaf35601e3edf7400fbc5d9769a20c9fa950/socks-extensions.txt), commit9114eaf35601e3edf7400fbc5d9769a20c9fa950, specify a native TCP proxy, SOCKS4/4A/5, remote hostname resolution and username/password-based stream isolation. They do not expose SOCKS control to an ordinary page. The [browser WebSocket API](https://github.com/whatwg/websockets/blob/7f25d7dc8c2598ebca795ce4af68909d913a3888/index.bs) is not raw TCP or a SOCKS transport. Wrapping cryptographic code in WASM does not provide missing browser socket capabilities. This source is not an evaluated Arti/I2P build or a claim every native Tor version supports this app.

Distinct options:

- Controlled browser/native Tor environment: enforcing configuration and independent packet/DNS capture may establish scoped app-channel routing. Wallet extension, OS and initial static load remain separate boundaries.
- Authenticated local companion: native component owns Tor sockets/DNS and exposes a minimal bounded app transport; pin its binary/source/compiler/permission/authentication/lifecycle profile. This adds a real trusted local component and cannot be silently assumed installed.
- Remote HTTPS/Tor gateway: a trusted proxy observes endpoints and application metadata. It is not a client-owned anonymous circuit and must not receive a native-route label.

Missing exact profile: chosen enforcing component and version, build/WASM/native artifacts and routing primitive; supported OS/browser installation; authenticated bootstrap/companion channel; channel allowlist and DNS/WebRTC/service-worker/prefetch/static-update paths; isolation credentials/circuit refresh; native transport limits and cancellation; signed/maintained current-scope evidence with TTL/invalidation; failure policy and independent capture method. I2P is separately unsupported until its own concrete profile exists. Do not select a new crypto/transport stack merely from a mutable URL.

Ready local work reuses `packages/transport/src/policy.ts` and its lifecycle tests: a typed no-network companion port, strict-mode rejection of missing/expired/wrong-channel evidence, dropped permit on actual route invalidation, bounded per-origin requests, abort/dispose and no-direct-fallback fixtures. Then qualify an actually pinned local Tor instance against synthetic loopback services and independent network/DNS captures. Connectivity/self-attestation is not route proof. A controlled companion can be prototyped without real trade data; actual platform enforcement remains a separate measurable predecessor.

Any route evidence must identify exact application build, environment, network/channel scope, generation and enforcement component. Unknown external-wallet route blocks strict signing; ordinary mode can remain explicit. Message encryption, vault encryption, Tor connectivity and chain metadata are independent. No blanket anonymity, physical device security or privacy coverage for traffic outside the enforced channels is asserted.
