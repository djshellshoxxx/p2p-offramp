# Public Node receiver evaluation

This opt-in research project evaluates `ws 8.22.1` under the exact
[T50 receiver source](../../../docs/execution/profiles/03-relay-allocation.md).
Its published receiver matches that source byte for byte. Registry signatures
bind package name/version/integrity; the registry's `gitHead` is unsigned metadata.
This project adds no browser companion, endpoint, G05 path or application adapter.
Trading remains disabled.

The actual Node 24.19.0 network-none lab run passed 6/6 cases with no skips:

- Real local WebSocket peers preserve unchanged NIP01 EOSE/NOTICE bytes,
  including a 65536-byte message. A finite 65537-byte send is refused without a
  complete-message event.
- Explicit fragment and buffered-chunk limits refuse bounded ordinary fixtures;
  compression is disabled. Policy refusal reports local close 1006 and peer
  close 1009 for payload /1008 for fragments, with the matching SDK error codes.
- Closing an incomplete message drains the owned sockets/server and prevents
  late complete delivery. No third-party relay, flood or exploit is exercised.

These are receiver/message and owned cleanup results. They do not bound every
native TCP/TLS buffer, establish whole-process memory safety, or change the
direct browser API's complete-message allocation limitation. Production companion
packaging, authentication/current scope, G05 routing, targets and failure policy
remain unselected.

[Pins](pins.json) bind the manifest/lock, all installed files, official SRI and
registry assertion, source bytes, license intake and whole-lock audit 0 observation.
The sole dependency declares MIT. No override, omitted package or audit exclusion
was used. Audit0 is an observation, not a future advisory guarantee or adoption.

To reproduce, prepare a fresh public-only directory outside the checkout from
the exact manifest/lock. Verify the pinned registry/SRI/source/license evidence
and unsuppressed whole-lock audit before `npm ci --ignore-scripts --no-audit
--no-fund`. Preserve the managed proxy/CA and TLS verification. The installed tree
must match `pins.json`; a mismatch requires investigation, not rewritten pins.
Mount only that directory's verified manifest, lock and packages, excluding npm
cache/configuration and credentials. Make only these public inputs/probe files
readable by UID 65534, respecting internal package links.

The root review uses the existing [bounded lab helper](../../../scripts/lab/command.mjs)
with a 30-second parent deadline, 64KiB output cap and removal/absence checks for a
fresh owned container name. Its fixed inner invocation is:

```sh
docker --host=unix:///var/run/docker.sock run --rm --pull=never \
  --network=none --read-only --cpus=1 --memory=268435456 \
  --memory-swap=268435456 --pids-limit=64 --ulimit=cpu=20:20 \
  --cap-drop=ALL --security-opt=no-new-privileges --user=65534:65534 \
  --tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864 \
  --mount type=bind,src=/workspace/work/t75-relay-transport-runtime,dst=/evaluation,readonly \
  --mount "type=bind,src=$PWD/security/intake/relay-transport,dst=/probe,readonly" \
  --entrypoint=/usr/bin/env \
  sha256:1729a8a1af2bf2312a8227ce7eb01469e44195701dad39cc1aca2a20c23e3283 \
  -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production TZ=UTC LANG=C.UTF-8 \
  node --max-old-space-size=128 --test --test-timeout=20000 /probe/evaluation.test.mjs
```

The [test](evaluation.test.mjs) checks the actual unprivileged/cgroup/loopback-only
environment and exact input tree before importing the real package. This command
does not run in product CI, install a provider, authenticate a remote peer or grant
release/privacy authority.

Container startup-timeout limitation: an auxiliary Docker version check timed out
before daemon creation completed. Immediate removal/absence preceded a late
`created` container (never running, PID0); that exact owned container was then
removed and absence rechecked. Killing the CLI process group does not cancel an
in-flight daemon create. The three completed evaluation runs did not time out.
Future timed-out starts require resolving that create/start outcome before
claiming durable cleanup; a single immediate absence check is insufficient.
