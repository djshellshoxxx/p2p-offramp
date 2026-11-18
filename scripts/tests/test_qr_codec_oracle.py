import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
ORACLE = ROOT / "scripts/vectors/check_qr_codec.py"
VECTORS = ROOT / "packages/qr/test/fixtures/vectors.json"
SPEC = importlib.util.spec_from_file_location("check_qr_codec", ORACLE)
oracle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(oracle)
REGENERATE = "node --import ./scripts/test-support/register-tsx.mjs packages/qr/test/fixtures/generate-vectors.mjs"


def run(*args):
    return subprocess.run([sys.executable, "-I", str(ORACLE), *args], cwd=ROOT, capture_output=True, text=True)


class QrCodecOracle(unittest.TestCase):
    def test_committed_vectors_agree_with_independent_oracle(self):
        result = run()
        self.assertEqual(result.returncode, 0, f"{result.stderr}\nregenerate with: {REGENERATE}")
        self.assertIn("PASS", result.stdout)

    def _tampered(self, mutate, refresh_digest=True):
        """Writes a mutated copy; by default the content digest is refreshed so only the targeted check can fail."""
        document = json.loads(VECTORS.read_text(encoding="utf-8"))
        mutate(document)
        if refresh_digest:
            document["meta"]["contentSha256"] = hashlib.sha256(oracle.jcs_bytes(document["vectors"])).hexdigest()
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "vectors.json"
            body = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
            path.write_text(body, encoding="utf-8")
            (pathlib.Path(folder) / "vectors.json.sha256").write_text(hashlib.sha256(body.encode()).hexdigest() + "  vectors.json\n")
            return run("--vectors", str(path))

    def test_untampered_copy_passes(self):
        result = self._tampered(lambda document: None)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_oracle_detects_a_changed_base45_vector(self):
        def mutate(document):
            vector = document["vectors"]["base45"][0]
            vector["base45"] = vector["base45"][::-1]
        result = self._tampered(mutate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("RFC 9285 example", result.stderr)

    def test_oracle_detects_a_wrong_refusal_code(self):
        def mutate(document):
            document["vectors"]["rejections"][0]["expectedCode"] = "FORMAT_UNSUPPORTED"
        result = self._tampered(mutate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rejection ", result.stderr)

    def test_oracle_detects_a_changed_payload_hash(self):
        def mutate(document):
            envelope = document["vectors"]["envelopes"][0]
            envelope["payloadSha256"] = "0" * 64
        result = self._tampered(mutate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("payload hash", result.stderr)

    def test_oracle_detects_a_stale_content_digest(self):
        def mutate(document):
            document["vectors"]["jcs"][0]["canonical"] += " "
        result = self._tampered(mutate, refresh_digest=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("contentSha256", result.stderr)


if __name__ == "__main__":
    unittest.main()
