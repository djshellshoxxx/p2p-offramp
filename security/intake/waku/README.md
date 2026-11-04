# Public Waku codec evaluation

This opt-in project evaluates `@waku/proto 0.0.15` with its exact six-package lock,
including `protons-runtime 5.6.0`. Published message/Store generated sources match
the [T50 snapshot](../../../docs/execution/profiles/04-optional-messaging.md).
It imports real public codecs; no Waku node, peer, gateway or application adapter
is constructed. Trading remains disabled.

The actual isolated Node run reports 13/14 cases passing and one **preserved
conformance failure**. A valid bigint `sint64` minimum, `-9223372036854775808`, is
encoded incorrectly by this resolved encoding path. A separate Python arbitrary
integer ZigZag/base128 oracle gives field10 bytes `50ffffffffffffffffff01`;
the SDK emits `5080808080e0ffffffff01`. The SDK decoder reads the independent
oracle correctly, while its own encoding decodes to `9223372032559808512`.
The fixture supplies payload/content topic and uses the declared bigint API.
Positive maximum, realistic positive/negative nanosecond values, -1/0/1 and
uint64 maximum pass. No SDK/dependency replacement or weakened expectation masks
the failing case. This candidate is unsupported for complete sint64 encoding.

Other measured cases preserve independent literal message bytes/optional presence,
StoreV3 fields and exact bigints, reject small truncated input, and exercise both
published LightPush response codecs. Actual Store decode options reject 101
messages when `limits.messages` is 100. Default wire pagination 101 remains an
integer; it grants no application history consent. Empty protobuf defaults,
ephemeral flags and encoded success/status fields authenticate no sender and
establish no delivery, retention/deletion or economic fact.

The import/codec run observed zero intercepted socket/fetch/WebSocket/Worker
construction attempts. The sandbox has no external network interface. Pure codecs
have no node close API; no successful SDK close or G05-routing result is invented.
Exact full SDK 0.0.37/core 0.0.41 registry version queries returned404 at intake.
Their source snapshot versions are not runtime artifact/lifecycle qualification.
Network/cluster/shards, peers/discovery, topics/codec selection, envelope/encryption,
replay/history/retention/RLN and G05 paths remain unselected. The separate XMTP
generation/inbox/consent/recovery/Worker profile is also unselected; its client
init/register convenience flow is not an offline probe.

[Pins](pins.json) bind the manifest/lock/tree, all six official SRI/signature
assertions, exact source bytes, licensing and an unsuppressed whole-lock audit 0.
Registry signatures bind integrity, not unsigned `gitHead` or source/bundle
equivalence. The graph declares MIT/Apache licensing; archive omissions have exact
upstream license texts retained separately. This is no legal, vendor, privacy or
production approval. No override, package omission or scanner exclusion was used.

Prepare a fresh external public-only runtime from the exact manifest/lock. Before
`npm ci --ignore-scripts --no-audit --no-fund`, verify pinned provenance/license
evidence and a fresh whole-lock audit. Keep managed proxy/CA and strict TLS.
Verify every installed file/tree and make only the verified public inputs readable
by UID 65534. Exclude npm caches, configuration and credentials from mounts.
Use the existing bounded lab helper with 30-second deadline, 64KiB output and owned
container cleanup/absence checks. The fixed inner command is:

```sh
docker --host=unix:///var/run/docker.sock run --rm --pull=never \
  --network=none --read-only --cpus=1 --memory=268435456 \
  --memory-swap=268435456 --pids-limit=64 --ulimit=cpu=20:20 \
  --cap-drop=ALL --security-opt=no-new-privileges --user=65534:65534 \
  --tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864 \
  --mount type=bind,src=/workspace/work/t75-waku-runtime,dst=/evaluation,readonly \
  --mount "type=bind,src=$PWD/security/intake/waku,dst=/probe,readonly" \
  --entrypoint=/usr/bin/env \
  sha256:1729a8a1af2bf2312a8227ce7eb01469e44195701dad39cc1aca2a20c23e3283 \
  -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production TZ=UTC LANG=C.UTF-8 \
  node --max-old-space-size=128 --test --test-timeout=20000 /probe/evaluation.test.mjs
```

The current [test](evaluation.test.mjs) exits 1 for the strict signed-minimum
failure. Preserve that result. Research conformance is separate from product CI;
no Waku provider or application protocol is selected by this evaluation.

Container startup-timeout limitation: an auxiliary Docker version check timed out
before daemon creation completed. Immediate removal/absence preceded a late
`created` container (never running, PID0); that exact owned container was then
removed and absence rechecked. Killing the CLI process group does not cancel an
in-flight daemon create. The three completed evaluation runs did not time out.
Future timed-out starts require resolving that create/start outcome before
claiming durable cleanup; a single immediate absence check is insufficient.
