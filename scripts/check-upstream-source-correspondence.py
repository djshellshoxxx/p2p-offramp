"""Offline comparison to retained GitHub source-tree metadata; never fetches or executes provider source."""
from pathlib import Path
import hashlib
import json

sources = json.load(open('docs/evidence/g06-official-source-tree-20261026.json'))
results = []
for source in sources:
    root = Path('node_modules') / source['package']
    remote = {entry['path']: entry['gitBlobSha1'] for entry in source['tree']}
    files = []
    checked = set()
    for path in sorted((root / 'src').rglob('*.ts')) + [root / 'LICENSE']:
        name = path.relative_to(root).as_posix()
        data = path.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if remote.get(name) != blob:
            raise ValueError('Packaged source differs from recorded upstream commit: ' + name)
        checked.add(name)
        files.append({'path': name, 'gitBlobSha1': blob, 'sha256': hashlib.sha256(data).hexdigest()})
    missing = remote.keys() - checked
    if missing:
        raise ValueError(f"Missing recorded source files in {source['package']}: {', '.join(sorted(missing))}")
    results.append({'package': source['package'], 'commit': source['commit'], 'source': source['source'],
                    'allIncludedTypeScriptAndLicenseMatch': True, 'files': files})
print(json.dumps(results, indent=2))
