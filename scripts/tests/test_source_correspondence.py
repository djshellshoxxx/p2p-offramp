import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CHECK = Path(__file__).resolve().parents[1] / 'check-upstream-source-correspondence.py'


class SourceCorrespondenceTests(unittest.TestCase):
    def test_all_recorded_sources_must_be_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / 'node_modules/example'
            (package / 'src').mkdir(parents=True)
            evidence = root / 'docs/evidence/g06-official-source-tree-20261026.json'
            evidence.parent.mkdir(parents=True)
            files = {'LICENSE': b'fixture license', 'src/index.ts': b'export {};\n'}
            tree = []
            for name, content in files.items():
                (package / name).write_bytes(content)
                header = f'blob {len(content)}\0'.encode()
                tree.append({'path': name, 'gitBlobSha1': hashlib.sha1(header + content).hexdigest()})
            evidence.write_text(json.dumps([{
                'package': 'example', 'commit': 'fixture', 'source': 'fixture', 'tree': tree
            }]))

            command = [sys.executable, str(CHECK)]
            matched = subprocess.run(command, cwd=root, text=True, capture_output=True)
            self.assertEqual(matched.returncode, 0, matched.stderr)
            report, = json.loads(matched.stdout)
            self.assertEqual({entry['path'] for entry in report['files']}, set(files))

            (package / 'src/index.ts').unlink()
            missing = subprocess.run(command, cwd=root, text=True, capture_output=True)
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn('src/index.ts', missing.stderr)
            self.assertEqual(missing.stdout, '')
