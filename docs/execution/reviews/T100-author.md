# T100 missing relay acknowledgement

**Ready for root independent review.** Added exactly one test in `packages/relay/test/pool.test.mjs`; all original bytes/assertions are preserved. The file now passes **28/28** with Node 24.22.1, registered TSX, normal test isolation and managed local TCP/IPC.

The owned HTTP/WebSocket peer receives one explicit EVENT and suppresses its OK. Publication resolves `unknown` at the existing 800 ms timeout. A further 800 ms observation sees no EVENT replay or new connection. Subscription and publication use separate sockets: 1 before publish, 2 after EVENT, 2 after observation. Existing failover/refused-socket and drop/REQ-reconnect cases were retained, reused from root/fresh-lab 1,712-case logs, and pass again in this affected-file run.

The first run is preserved: 27 pass/1 fail caused by my new assertion incorrectly assuming a shared subscription/publication socket. Only that new assertion was corrected to compare post-EVENT connection count; production/helpers and all old assertions remain unchanged.

Original SHA256: `2cef27ebe9312b054c0cc133f25d1ec8e9310a4b067490c8511afacbf2a56f60`.

Frozen SHA256: `74753b038c41acd3187b2f52948b974d7f59ace19ff8791aba5ca50814b50b09`.

Existing fixture cleanup is awaited by withRelays. This is owned plain loopback WS behind an explicit logical WSS mapping, with injected crypto-double signedAd; no TLS/private-route/provider/cryptographic certification or production relay approval. The observation is finite, not an indefinite replay theorem. No full suite or commit. Ownership is returned to root.
