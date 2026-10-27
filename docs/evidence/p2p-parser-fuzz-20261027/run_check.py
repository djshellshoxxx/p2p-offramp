from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, subprocess, sys

repo = Path('/workspace/p2p-offramp-pr5-validation')
out = Path(__file__).resolve().parent
name, *command = sys.argv[1:]
paths = ['scripts/fuzz-evm-agreement-input.mjs','scripts/tests/evm-agreement-fuzz.test.mjs','packages/wallet/src/evm-agreement-host.ts','packages/wallet/test/evm-agreement-host.test.mjs','packages/schemas/src/evm-agreement-protocol.ts','packages/schemas/test/evm-agreement-protocol.test.mjs','apps/web/src/runtime/app-runtime.ts', 'apps/web/src/runtime/pending-metadata.ts', 'apps/web/test/pending-metadata.test.mjs', 'apps/web/test/app-runtime.test.mjs', 'apps/web/test/worker-endpoint.test.mjs', 'apps/web/test/app-services.test.mjs', 'apps/web/src/runtime/worker-endpoint.ts', 'apps/web/src/app-services.ts', 'packages/schemas/src/runtime.ts', 'packages/schemas/index.ts', 'packages/schemas/src/evm-agreement-input.ts', 'packages/schemas/test/evm-agreement-input.test.mjs', 'scripts/fixtures/g16-browser.mjs', 'packages/domain/src/read-retry.ts', 'packages/domain/test/read-retry.test.mjs', 'packages/domain/src/errors.ts', 'packages/schemas/src/core.ts', 'packages/domain/src/trade-terms.ts', 'packages/domain/test/trade-terms.test.mjs', 'packages/wallet/src/evm-terms.ts', 'packages/wallet/src/evm-agreement.ts', 'packages/domain/test/fixtures/g16-vectors.json', 'packages/wallet/test/fixtures/g16-evm-independent.json', 'packages/wallet/test/fixtures/eip712-keccak-vectors.json', 'package-lock.json', 'security/crypto-inventory.json']
def hashes():
    return {p: (hashlib.sha256((repo / p).read_bytes()).hexdigest() if (repo / p).exists() else None) for p in paths}
before = hashes()
record = {'command': command, 'base': subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo).decode().strip(),
          'startedAtUtc': datetime.now(timezone.utc).isoformat(), 'sourceFiles': before,
          'processLocalEnvironment': {'P2P_CHROMIUM': '/usr/bin/chromium', 'npm_config_offline': 'true', 'npm_config_update_notifier': 'false'}}
with (out / (name + '.log')).open('wb') as log:
    child = subprocess.Popen(command, cwd=repo, env={**os.environ, 'P2P_CHROMIUM': '/usr/bin/chromium', 'npm_config_offline': 'true', 'npm_config_update_notifier': 'false'}, stdout=log, stderr=subprocess.STDOUT)
    code = child.wait()
record.update({'finishedAtUtc': datetime.now(timezone.utc).isoformat(), 'exitCode': code, 'sourceFilesUnchangedDuringRun': hashes() == before})
temporary = out / (name + '.exit.tmp')
temporary.write_text(json.dumps(record, indent=2) + '\n')
temporary.replace(out / (name + '.exit.json'))
print(json.dumps({'name':name,'exitCode':code,'sourceFilesUnchangedDuringRun':record['sourceFilesUnchangedDuringRun']}),flush=True)
sys.exit(code)
