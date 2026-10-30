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
    for path in sorted((root / 'src').rglob('*.ts')) + [root / 'LICENSE']:
        name = str(path.relative_to(root))
        data = path.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if remote.get(name) != blob:
            raise ValueError('Packaged source differs from recorded upstream commit: ' + name)
        files.append({'path': name, 'gitBlobSha1': blob, 'sha256': hashlib.sha256(data).hexdigest()})
    if not files:
        raise ValueError('No source files checked')
    results.append({'package': source['package'], 'commit': source['commit'], 'source': source['source'],
                    'allIncludedTypeScriptAndLicenseMatch': True, 'files': files})
print(json.dumps(results, indent=2))
