# Semaphore V4 public Node feasibility

The runnable candidate is explicitly **experimental**:
`semaphore-4.14.5-maintained-transitives-20261102`. It evaluates the unchanged
Semaphore SDK4.14.5 source with five documented dependency overrides and supplied
4.13.0 depth2 artifacts. It is not the vendor's declared dependency graph, an
application reputation provider, issuer policy, score proof, global nullifier
consumer or release approval. Trading remains disabled.

## Exact scope and dependency disposition

The original published SDK graph generated and verified the public fixture, but
its unsuppressed audit reported17 affected packages:9 high and8 moderate, arising
from5 distinct advisories. The full original manifest, lock, audit, pins, proof,
signature and hash receipts remain byte-exact passive data in
[SEMAPHORE-V4-ORIGINAL-OBSERVATION.json](SEMAPHORE-V4-ORIGINAL-OBSERVATION.json).
That graph is BLOCKED and has no executable dependency project in the repository.
The current runner refuses its old manifest/lock before starting Docker.

At intake the latest SDK/group were still4.14.5, with no clean closure inside all
their exact/old dependency constraints. The separately named candidate changes:

| Dependency | Original constraint/path | Explicit candidate | Reason and measured limit |
| --- | --- | --- | --- |
| ethers | SDK exact6.13.4; nested utils exact6.13.5 | 6.17.0 | Official package uses patched ws8.21.0; numeric Keccak/encoding exercised |
| snarkjs | SDK exact0.7.5 | 0.7.6 | Maintained0.7 patch; actual generation/verification exercised against identical artifacts |
| bfj | snarkjs `^7.0.2` | 9.1.4 | Removes jsonpath/underscore chain; public JSON read/write exercised |
| ejs | snarkjs `^3.1.6` | 7.0.2 | Removes jake/filelist/minimatch chain; actual SnarkJS public-template render call exercised |
| circom_tester | circomkit `^0.0.19` | 0.0.24 | Removes nested legacy snarkjs0.5.0; circuit compiler/tester methods remain untested |

These are intentional deviations outside at least one original constraint, not a
claim of vendor support or broad CLI compatibility. No `npm audit fix`, scanner
exclusion or gate change was used. The final isolated override graph's
unsuppressed audit reports zero findings at this observation. This does not
guarantee future advisory absence or qualify production adoption.

The [pins](../../scripts/reputation/semaphore-v4.pins.json) bind the explicit
[manifest/lock](../../scripts/reputation/evaluation-remediated/package.json),
installed graph, primary source snapshots, official registry integrity assertions,
licenses, tools, image and artifact bytes. SDK packages declare MIT; snarkjs and
ffjavascript declare GPL-3.0; patched ejs declares Apache-2.0. Nine retained license
files are hashed; this is finite provenance intake, not legal approval. Registry
signatures authenticate `name@version:integrity`, not unsigned `gitHead` metadata,
source/bundle correspondence, provider safety or this application's trust policy.
The unchanged `@zk-kit/artifacts@2.0.1` assertion uses a recorded legacy key that
expired2025-01-29. Its signature verifies mathematically as historical evidence;
that is not a currently valid signing key or an exception to a trust policy.
The other nine retained candidate assertions use nonexpiring recorded keys.
Vendor republishing or a separately reviewed source/artifact trust profile is
still needed before adoption; the probe supplies explicit local artifacts and
never invokes that loader's downloader.

## Actual finite evidence

The fixed probe uses five explicitly public seed strings to create a four-member
synthetic group and an out-of-group member. It supplies local WASM/zkey paths to
`generateProof` and checks the exported depth2 verification key against the
published SDK key. Message123 and scope456 are literal numeric examples. No
application tuple-to-field mapping is selected.

The actual network-disabled, unprivileged Docker run passed24 checks, including
real generation/verification, exact root/message/scope, wrong root/scope/message/
nullifier/points/depth/key, a nonmember, identity export/import, the patched API
calls and observed resource caps. A genuine proof for a different synthetic root
also verifies, and repeating a proof still verifies: the mathematical verifier
does not authenticate an issuer or consume a nullifier. The public fixtures
provide no anonymity or human-uniqueness evidence.

| Resource | Enforced/observed local value |
| --- | --- |
| CPU | Docker quota1;90 CPU-second limit;120-second parent deadline |
| Memory | Docker1,073,741,824-byte hard cap; observed cgroup peak214,159,360 bytes |
| PIDs / output | 128 /65,536 bytes |
| Filesystem | Read-only image and verified packages/artifacts; bounded private tmpfs |
| Runtime | Node24.19.0; pinned local lab image; Linux/x64 |
| Network | Docker `none`, sanitized environment, explicit artifacts, zero fetch attempts |

Native cancellation testing observes the actual owned container, refuses overlap,
aborts, waits for physical removal and verifies absence before releasing the
single in-process admission. Uncertain cleanup permanently retires that runner;
there is no automatic retry. Eight native-free unit cases additionally check
pin/authority/budget refusal, retained history, exact graph digests, symlinks,
FIFOs, excessive nesting, malformed signals and admission cleanup, and independently
verify all ten retained registry signature inputs with tamper controls.

The384MiB input-tree bound and1GiB Node sandbox are explicit evaluation limits.
They do not establish the browser256MiB proof budget. Default browser CSP still
blocks WASM. No browser/mobile performance, random identity generation, G02
reputation identity storage/recovery, real issuer/root/revocation source,
creditworthiness, score circuit or deployed nullifier consumer is qualified.

## Reproduce the isolated input

Use Node24.19.0 and npm11.9.0 on Linux/x64. Create a fresh directory outside the
checkout; never use a private wallet/account or place credentials there. The
commands below install the **experimental** graph with lifecycle scripts disabled.
Preserve the managed proxy/CA configuration and TLS verification for downloads.

```sh
SEMAPHORE_EVAL_DIR=/workspace/work/semaphore-v4-public-remediated
mkdir -m 700 "$SEMAPHORE_EVAL_DIR"
cp scripts/reputation/evaluation-remediated/package.json scripts/reputation/evaluation-remediated/package-lock.json "$SEMAPHORE_EVAL_DIR/"
: > "$SEMAPHORE_EVAL_DIR/empty-global.npmrc"
env -u NODE_OPTIONS NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$SEMAPHORE_EVAL_DIR/empty-global.npmrc" npm ci --ignore-scripts --no-audit --no-fund --prefix "$SEMAPHORE_EVAL_DIR"
env -u NODE_OPTIONS NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$SEMAPHORE_EVAL_DIR/empty-global.npmrc" npm audit --json --prefix "$SEMAPHORE_EVAL_DIR"
curl -fsSL --max-time 90 --max-filesize 201326592 -o "$SEMAPHORE_EVAL_DIR/artifacts.tgz" https://registry.npmjs.org/@zk-kit/semaphore-artifacts/-/semaphore-artifacts-4.13.0.tgz
```

Verify the entire official tarball SRI **before** opening the archive. Validate
entry type/path/count/size and extract only the two exact depth2 files:

```sh
python - "$SEMAPHORE_EVAL_DIR" <<'PY'
import base64, hashlib, json, os, stat, sys, tarfile
from pathlib import Path, PurePosixPath
root = Path(sys.argv[1]).resolve()
pins = json.load(open('scripts/reputation/semaphore-v4.pins.json'))
bundle = root / 'artifacts.tgz'
assert bundle.stat().st_size <= pins['limits']['compressedArtifactBytes']
digest = hashlib.file_digest(bundle.open('rb'), 'sha512').digest()
assert 'sha512-' + base64.b64encode(digest).decode() == pins['artifact']['integrity']
with tarfile.open(bundle) as archive:
    entries = archive.getmembers()
    assert len(entries) <= 128 and sum(e.size for e in entries) <= 201326592
    for entry in entries:
        parts = PurePosixPath(entry.name).parts
        assert parts and parts[0] == 'package' and '..' not in parts
        assert not entry.name.startswith('/') and '\\' not in entry.name
        assert (entry.isfile() or entry.isdir()) and entry.size <= 16777216
    target = root / 'artifacts'
    target.mkdir()
    for name, expected in pins['artifact']['selected'].items():
        data = archive.extractfile('package/' + name).read()
        assert len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256']
        (target / name).write_bytes(data)
# These two trees contain only the verified public packages/artifacts.
# Explicit modes permit the unprivileged container despite a restrictive umask.
for start in [root / 'node_modules', root / 'artifacts']:
    for path in [start, *start.rglob('*')]:
        item = path.lstat()
        if stat.S_ISLNK(item.st_mode):
            continue
        assert stat.S_ISDIR(item.st_mode) or stat.S_ISREG(item.st_mode)
        os.chmod(path, 0o755 if stat.S_ISDIR(item.st_mode) else 0o555 if item.st_mode & 0o111 else 0o444, follow_symlinks=False)
PY
node --import ./scripts/test-support/register-tsx.mjs --test scripts/reputation/semaphore-v4-evaluation.test.mjs
node --import ./scripts/test-support/register-tsx.mjs scripts/reputation/semaphore-v4-evaluation.mjs --directory "$SEMAPHORE_EVAL_DIR"
```

Build the existing [lab image](../lab/README.md) if its exact pinned image ID is
absent. The probe never pulls another image or fetches SDK/artifacts implicitly.
It refuses mismatched lock, package, complete installed graph or artifact hashes;
do not rewrite pins merely to obtain a passing result. The retained original
observation is not read by an installer or imported as runtime authority.

Real adoption still needs a reviewed provider/depth and identity recovery profile,
issuer key/admission/root/epoch/revocation policy, purpose/message mapping,
score-specific circuit where relevant, actual consumer/reorg rules, browser
isolation/performance and independent specialist review. None can authorize an
existing basic trade's release/refund or block its recovery.
