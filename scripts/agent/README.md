# Autonomous output quarantine

`check-output.mjs` checks Git's staged objects before patch upload, and runs again
in the separate publication job before a write credential is made available.
It refuses known API-key values (and a few common encodings), common credential
shapes, private-key headers, binary/non-UTF-8 content, oversized output, symlinks,
submodules, control-character paths, workflow/secret paths, lockfiles and changes
to this guard. Deletions and context lines are checked because they also occur in
patch artifacts. Errors are fixed messages, never content or path diagnostics.

The development job can run only on the repository's default ref. Both policy
copies are made before untrusted modifications are applied. Publication does not
receive the OpenAI key. Patch retention is one day. No agent workflow is triggered
by normal pushes or by this implementation's tests.

Run sentinel tests: `node --test scripts/agent/*.test.mjs`.

## BT-15 status: mitigated output channels, not closed

This is defense in depth. The coding process still receives the paid API key;
there is no short-lived credential broker. A same-user malicious process could
modify the development runner, encode a secret differently, or use another output
channel. The development policy copy is not an OS isolation boundary. The clean
publication job gives a stronger boundary but cannot undo an earlier artifact
leak. Do not describe these scans as complete exfiltration prevention. Closing
BT-15 requires isolating credentials from repository-controlled execution and
qualifying network/filesystem/log access with a non-secret sentinel.

The guard intentionally refuses binary output and lockfile changes. Those need a
separate reviewed development PR, not automatic publication from the paid agent.
