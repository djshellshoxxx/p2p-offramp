# Native Nostr relay interoperability

## Scope and result

The development command `npm run test:relay:native` exercises the canonical
`createRelayPool`, actual Nostr event signatures and project NIP-17/NIP-59 chat
against an unmodified, independently maintained `nak serve` process. The process
uses Khatru's real protocol handlers and in-memory event store. It listens only
on a newly allocated `127.0.0.1` port and is terminated after each scenario.
No public relay is contacted, no application server is introduced, and no wallet
or transaction is involved.

Local execution on 2026-11-19, Node 24.22.3, Linux x64: **3 scenarios passed,
0 failed, 0 skipped**. The actual upstream binary was verified against the
published release digest before execution. This is new independent relay
transport evidence; earlier `nostr-tools` differential tests remain separate
crypto/filter oracles and the existing localnet/browser runners retain their
repository-owned fake relay.

An additional local rerun was much slower and cancelled the private-message case
at its original 25-second overall test allowance; the other two cases passed.
The fixture now allows 120 seconds per scenario while retaining the original
bounded startup, socket, acknowledgement and condition waits. No protocol check
or product timeout was relaxed. This intermediate cancellation is not recorded
as a passing run.

The new `native-nostr-relay` hosted job is additive. A local pass does not claim
that the exact PR's hosted job or independent review has passed. This test does
not qualify another Nostr client implementation, TLS, a public deployment,
recipient-only storage, anonymity, wallet consent, fiat receipt or release.

## Immutable upstream identity

The machine-readable pin is
[`scripts/fixtures/nostr-relay/nak.json`](../../scripts/fixtures/nostr-relay/nak.json).

| Input | Pin |
| --- | --- |
| Upstream release | [`fiatjaf/nak` v0.22.3](https://github.com/fiatjaf/nak/releases/tag/v0.22.3), published 2026-11-07 |
| Source commit / tag target | [`a3b1237bb5325a21a01c132fb53bb615789c4242`](https://github.com/fiatjaf/nak/commit/a3b1237bb5325a21a01c132fb53bb615789c4242) |
| Linux x64 binary | `nak-v0.22.3-linux-amd64` |
| Binary SHA-256 | `2eb9a16f86c865275983459b2c705d22d5dfbcf527026a279449cbf204d164fe` |
| Relay dependency | `fiatjaf.com/nostr v0.0.0-20261101164043-96f89895a4b2` |
| Relay dependency commit | `96f89895a4b2285e2e09364ee2225cb61196a325` |
| Relay dependency Go checksum | `h1:8RKyuRnEaX5C/QFTrDkdsKPsdy2OdZm4L4kzHZY3K7o=` |

The upstream [`serve.go`](https://github.com/fiatjaf/nak/blob/a3b1237bb5325a21a01c132fb53bb615789c4242/serve.go)
selects Khatru and `slicestore`, with explicit `--auth` and `--eager-auth` flags.
Its [`go.mod`](https://github.com/fiatjaf/nak/blob/a3b1237bb5325a21a01c132fb53bb615789c4242/go.mod)
and [`go.sum`](https://github.com/fiatjaf/nak/blob/a3b1237bb5325a21a01c132fb53bb615789c4242/go.sum)
pin the module above. The downloaded module's file-tree checksum was independently
recomputed and matched that `go.sum` entry. The pin also records SHA-256 values
for `serve.go`, `go.mod`, `go.sum` and the upstream Unlicense. No upstream binary
or source is vendored into the application.

## Tested behavior

| Scenario | Native evidence and acceptance condition |
| --- | --- |
| Permissive relay | Actual relay accepts valid signed events and returns their unchanged signed fields in live and stored delivery. Native author/tag filters exclude an outside author. |
| Delayed, duplicated and reordered delivery | A test connector holds two actual incoming EVENT frames, delivers them in reverse order and repeats each exact frame. Each event reaches the existing subscription once. A successful relay ACK while frames are held does not count as peer delivery. |
| Read reconnect | Closing the actual read socket reconnects and reissues REQ. Stored replay remains deduplicated for that subscription. A new subscription independently receives history. No EVENT is resent. |
| Missing acknowledgement | The connector drops the actual relay's successful OK after the relay stored the event. The explicit publication returns `unknown`; native live/history delivery proves the event exists. Reconnect sends no second EVENT. |
| Project private message | A native stored gift wrap decrypts and authenticates through the real project chat implementation. Duplicate outer delivery and a fresh outer wrap of the same inner rumor do not add a second message. Another deployment binding is refused. |
| Required AUTH | `nak serve --auth --eager-auth` emits real challenges and rejects product REQ/EVENT with `auth-required`. Product signing count stays unchanged, AUTH frame count remains zero, and no EVENT/EOSE is delivered to the refused subscription. |
| Explicit fixture AUTH control | A separate disposable identity proves the upstream configuration works. Wrong relay, challenge, old timestamp and an old connection's proof are refused. The valid connection proof permits that fixture connection to publish/query, while the product connection remains refused before and after reconnect. |

Fault injection is confined to delivery of frames actually emitted by the native
relay. It does not manufacture a successful acknowledgement, signature or event.
All keys and content are synthetic and disposable; the relay-authentication
control identity is separate from the message/event author. Owned secret buffers
are cleared after each case. Upstream event diagnostics are drained without
retaining plaintext or payload logs.

## Production policy remains unchanged

The canonical pool still requires a broker-authorized, exactly bound WSS URL.
The test reuses the existing `loopbackRelayFixture` connector: a registered
logical WSS fixture URL maps only to its owned plain-WS loopback process. The
native TLS/WebSocket connector and production endpoint rules are unchanged.
The broker fixture uses ordinary/direct coverage and makes no private-routing
claim. This mapping cannot be used as TLS or public endpoint acceptance evidence.

Product AUTH is deliberately unsupported by `parseRelayFrame`. The
[accepted D1 integration contract](D1-peer-acceptance.md) still leaves inbox
discovery and relay AUTH policy open. The separate fixture control implements
only a test client operation; it adds no product signing API, approval policy or
inbox discovery behavior. NIP-42 defines a relay-session proof, independently of
the NIP-59 seal author and economic wallet authority; see
[`NIP-42`](https://github.com/nostr-protocol/nips/blob/bec0fc89e75645e77a06d145598246efca844457/42.md).

Further product AUTH work needs an accepted identity/consent and recipient-inbox
policy, exact endpoint/challenge/session binding, revocation behavior and its own
review. The current result establishes supported permissive-relay transport and
correct refusal of an AUTH-required profile. It does not turn relay acceptance
into peer agreement or evidence of custody.

## Reproduce

Obtain the exact Linux x64 asset from the release link, verify the binary SHA-256
above, and make that verified file executable. Then, from the repository root:

```sh
npm ci --ignore-scripts
P2P_NAK=/absolute/path/to/nak-v0.22.3-linux-amd64 npm run test:relay:native
```

The fixture verifies the digest and reported version again before starting the
process. Missing or changed tools fail this command; there is no fake-relay
fallback or passing skip. Each process uses an available loopback port, readiness
checks require the owned child to remain alive and return the pinned NIP-11
identity, and cleanup waits for its exit. The command downloads nothing. The
dedicated hosted workflow downloads and verifies the same immutable asset before
running it; existing required jobs and tests remain intact.
