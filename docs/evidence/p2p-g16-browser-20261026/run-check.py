from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, subprocess, sys

repo = Path('/workspace/p2p-offramp-pr5-validation')
out = Path(__file__).resolve().parent
name, *command = sys.argv[1:]
paths = ['scripts/test-g16-browser.mjs', 'scripts/fixtures/g16-browser.mjs', 'packages/wallet/test/lib/g16-bundle-fixture.mjs', 'packages/wallet/test/evm-agreement.test.mjs', 'packages/wallet/src/evm-terms.ts', 'packages/wallet/src/evm-agreement.ts', 'packages/domain/src/trade-terms.ts', 'package-lock.json', 'security/crypto-inventory.json', 'packages/wallet/test/fixtures/eip712-keccak-vectors.json', 'packages/wallet/test/fixtures/g16-evm-independent.json', 'packages/domain/test/fixtures/g16-vectors.json']
def hashes():
    return {p: hashlib.sha256((repo / p).read_bytes()).hexdigest() for p in paths}
before = hashes()
record = {'command': command, 'base': subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo).decode().strip(),
          'startedAtUtc': datetime.now(timezone.utc).isoformat(), 'sourceFiles': before,
          'processLocalEnvironment': {'P2P_CHROMIUM': '/usr/bin/chromium'}}
with (out / (name + '.log')).open('wb') as log:
    child = subprocess.Popen(command, cwd=repo, env={**os.environ, 'P2P_CHROMIUM': '/usr/bin/chromium'}, stdout=log, stderr=subprocess.STDOUT)
    code = child.wait()
record.update({'finishedAtUtc': datetime.now(timezone.utc).isoformat(), 'exitCode': code, 'sourceFilesUnchangedDuringRun': hashes() == before})
temporary = out / (name + '.exit.tmp')
temporary.write_text(json.dumps(record, indent=2) + '\n')
temporary.replace(out / (name + '.exit.json'))
print(json.dumps({'name':name,'exitCode':code,'sourceFilesUnchangedDuringRun':record['sourceFilesUnchangedDuringRun']}),flush=True)
sys.exit(code)
