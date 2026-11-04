# Public external-wallet helper evaluation

This opt-in project imports real `@walletconnect/utils 2.26.0` helpers from the
[T50 source candidate](../../../docs/execution/profiles/05-mobile.md). It does not
construct EthereumProvider/SignClient, register a project, pair a wallet, launch a
URI or accept a callback. Trading remains disabled.

The actual isolated Node run reports 4/5 cases passing. Public namespace helpers
check synthetic CAIP account/chain/method/event agreement; missing chains/methods
and malformed account syntax refuse. Expiry helpers use seconds, retain supplied
millisecond-clock conversion and enforce explicit synthetic bounds. Topic-presence
and namespace-compatibility predicates establish no account ownership, live session,
controller or expiry authority: another valid account can satisfy the same
namespace, and `isSessionStruct` is only a topic-presence test.

The fifth case **preserves an unmet stronger application expectation**: formatting
then parsing a complete ordinary `wc:` URI returns an empty `protocol` field.
The fixture supplies protocol/topic/version/relay/key and a future expiry. Exact
upstream caller/types and `uri.spec.ts` were checked; upstream's parser tests
compare topic/version/key/relay, not returned protocol, and its implementation
strips `wc`. This is recorded as insufficient full application roundtrip behavior,
not a demonstrated upstream-contract defect. Other serialized fields match.
No replacement protocol/default or URI normalization makes this expectation pass.
No real pairing material enters the fixture or observations.

The import/helper calls observed zero intercepted socket/fetch/WebSocket/Worker
construction attempts in a network-none sandbox. This supplies no actual mobile
provider/Worker-close, relay, encrypted session storage or handoff lifecycle result.
Wallet/connector versions, least-privilege scope, project/relay/G05 policy, allowed
launch/registered return origin/path, session/checkpoint/resume/revocation rules
and physical app-switch qualification remain unselected. A return event never
establishes transaction finality or permission to resend.

The whole 69-package graph reports audit 0 with no overrides, omitted packages or
scanner exclusions. All official SRI inputs and registry assertion mathematics
were checked. **33 legacy assertions use the key expired 2025-01-29**; these are
historical evidence, never current signing validity, a trust waiver or production
approval. Source-map bytes are separately bound to the T50 commit; unsigned
registry `gitHead` does not establish source/bundle correspondence.

The actual WalletConnect Community License Agreement is retained and hashed;
`SEE LICENSE IN LICENSE.md` is not relabeled MIT. Other package license files and
exact upstream texts are recorded. One transitive `uint8arrays 3.1.1` declares MIT
in published and exact-source package metadata but omits a full license file from
both; this limitation remains explicit. No commercial/legal approval is inferred.
See [pins](pins.json) for the complete graph/provenance and license observations.

Prepare a fresh external public-only runtime from the exact manifest/lock. Check
pinned signature/SRI/source/license evidence and a fresh unsuppressed whole-lock
audit before `npm ci --ignore-scripts --no-audit --no-fund`; retain the managed
proxy/CA and strict TLS. Verify the installed tree and make only its verified
public files readable by UID 65534. Mount no cache, credentials or configuration.
The existing bounded lab helper supplies 30-second/64KiB limits and owned cleanup.
Its fixed inner invocation is:

```sh
docker --host=unix:///var/run/docker.sock run --rm --pull=never \
  --network=none --read-only --cpus=1 --memory=268435456 \
  --memory-swap=268435456 --pids-limit=64 --ulimit=cpu=20:20 \
  --cap-drop=ALL --security-opt=no-new-privileges --user=65534:65534 \
  --tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864 \
  --mount type=bind,src=/workspace/work/t75-mobile-wallet-runtime,dst=/evaluation,readonly \
  --mount "type=bind,src=$PWD/security/intake/mobile-wallet,dst=/probe,readonly" \
  --entrypoint=/usr/bin/env \
  sha256:1729a8a1af2bf2312a8227ce7eb01469e44195701dad39cc1aca2a20c23e3283 \
  -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production TZ=UTC LANG=C.UTF-8 \
  node --max-old-space-size=128 --test --test-timeout=20000 /probe/evaluation.test.mjs
```

The current [test](evaluation.test.mjs) exits 1 for the stronger protocol-roundtrip
expectation. Preserve it separately from product CI and adoption decisions. No
helper result authenticates a session/callback or authorizes custody/signing.

Container startup-timeout limitation: an auxiliary Docker version check timed out
before daemon creation completed. Immediate removal/absence preceded a late
`created` container (never running, PID0); that exact owned container was then
removed and absence rechecked. Killing the CLI process group does not cancel an
in-flight daemon create. The three completed evaluation runs did not time out.
Future timed-out starts require resolving that create/start outcome before
claiming durable cleanup; a single immediate absence check is insufficient.
