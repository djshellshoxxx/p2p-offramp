from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, subprocess, sys

repo = Path('/workspace/p2p-offramp-pr5-validation')
out = Path(__file__).resolve().parent
name, *command = sys.argv[1:]
paths = ['apps/web/src/ui/App.tsx', 'apps/web/src/ui/Pages.tsx', 'apps/web/src/ui/VaultForms.tsx',
         'apps/web/src/ui/messages.ts', 'scripts/test-web-build-browser.mjs']
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
