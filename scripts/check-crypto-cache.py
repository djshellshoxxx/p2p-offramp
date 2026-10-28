"""Offline correspondence check for the locked G16 npm providers. Never downloads or installs."""
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile

if len(sys.argv) != 2:
    raise SystemExit('Pass an existing npm cache directory.')
cache = Path(sys.argv[1])
lock_bytes = Path('package-lock.json').read_bytes()
lock = json.loads(lock_bytes)
results = []
for name in ['@noble/hashes', '@noble/curves']:
    entry = lock['packages']['node_modules/' + name]
    algorithm, encoded = entry['integrity'].split('-', 1)
    if algorithm != 'sha512':
        raise ValueError('Unexpected locked integrity algorithm')
    expected = base64.b64decode(encoded, validate=True)
    digest = expected.hex()
    archive = cache / '_cacache/content-v2/sha512' / digest[:2] / digest[2:4] / digest[4:]
    data = archive.read_bytes()
    if hashlib.sha512(data).digest() != expected:
        raise ValueError('Cached package does not match locked integrity: ' + name)
    installed = Path('node_modules') / name
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
        for member in tar.getmembers():
            if member.isdir():
                continue
            path = PurePosixPath(member.name)
            if not member.isfile() or path.parts[0] != 'package' or '..' in path.parts or len(path.parts) < 2:
                raise ValueError('Unexpected package archive member')
            relative = str(path.relative_to('package'))
            target = installed / relative
            if relative in files or target.is_symlink() or target.read_bytes() != tar.extractfile(member).read():
                raise ValueError('Installed provider differs from locked package: ' + name + '/' + relative)
            files[relative] = hashlib.sha256(target.read_bytes()).hexdigest()
    actual_files = {str(path.relative_to(installed)) for path in installed.rglob('*') if path.is_file()}
    if actual_files != set(files):
        raise ValueError('Unexpected installed provider files: ' + name)
    results.append({'package': name, 'version': entry['version'], 'lockedIntegrity': entry['integrity'],
                    'cachedArchiveSha256': hashlib.sha256(data).hexdigest(), 'allInstalledFilesMatch': True, 'files': files})
print(json.dumps({'scope': 'Installed files match retained npm archives and lock; not upstream authenticity or security approval',
                  'packageLockSha256': hashlib.sha256(lock_bytes).hexdigest(), 'providers': results}, indent=2, sort_keys=True))
