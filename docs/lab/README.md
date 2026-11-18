# Local fake-funds development lab

The optional devcontainer pins the official Node24.19.0 linux/amd64 image by
manifest digest (including npm11.17.0), Foundry1.5.1 archive checksum and solc0.8.30 checksum. Its source
is `.devcontainer/Dockerfile`. It installs no user dotfiles, production keys or
signing credentials. The checksums identify downloaded bytes; they are not an
independent software audit. Other architectures and Solana validators are
unsupported by this recipe. No Solana interoperability profile is defined yet.

Open a clean checkout with its pinned submodules in a local development-container
client. Creating a Codespace may consume paid resources and is a separate user
action. The post-create command installs the exact npm lockfile with lifecycle
scripts disabled and runs the foundation suite. Reproduce manually:

```sh
npm ci --ignore-scripts
node --import ./scripts/test-support/register-tsx.mjs scripts/lab/run.mjs foundation
node --import ./scripts/test-support/register-tsx.mjs scripts/lab/run.mjs journey
```

Each invocation writes to a new, exclusively created
`dist-lab/<mode>-<UTC timestamp>-<random>/` directory, printed as `output` on
success. Its `recipe.json` binds the source commit/dirty state, actual
runtime/compiler versions, recipe, lockfile and synthetic fixture hashes. Its
`run.json` records every command outcome and the hash of its local
`command-N.log`. A failed check stops the run and keeps the evidence. Earlier
runs, including failed ones, are never overwritten; the newest run of a mode
sorts last. Reports are local development evidence, not release approval.
The chain harnesses start their own ephemeral loopback chains, conspicuously
synthetic identities and fake funds, then stop only their owned processes.

Only frontend port3000 is eligible for forwarding and must remain private. Wallet/RPC ports must
remain unforwarded. In Codespaces verify the Ports panel still shows **Private**:
repository configuration cannot attest the hosting service's actual access
policy; reports record actual host visibility as unknown until measured. To inspect a default static build, use an existing local static host on
port3000; do not make RPC endpoints public. No production seeds, cloud credentials,
real payment transcripts or wallet sessions belong in this environment. A cloud
operator can read workspace data. Camera/clipboard/mobile/assistive-device and
independent fresh-Codespace qualification remain unperformed until recorded.

Close owned preview processes and remove `dist-lab` reports when finished. Remove
the owned container using the development-container client's normal removal flow;
never prune unrelated Docker resources. This lab does not publish Pages or sign
artifacts. Pages still requires the separately approved complete signed manifest,
recovery assets and release gates.
