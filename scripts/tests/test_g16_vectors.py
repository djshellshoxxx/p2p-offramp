import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class G16VectorFixture(unittest.TestCase):
    def test_committed_fixture_matches_independent_generator(self):
        result = subprocess.run([sys.executable, "-I", str(ROOT / "scripts/vectors/g16_vectors.py"), "--check"], cwd=ROOT)
        self.assertEqual(result.returncode, 0, "regenerate with: python3 -I scripts/vectors/g16_vectors.py")


class G16OpenSSLFixture(unittest.TestCase):
    def run_oracle(self, data):
        with tempfile.TemporaryDirectory(prefix="p2p-g16-openssl-") as directory:
            fixture = pathlib.Path(directory) / "fixture.json"
            fixture.write_text(json.dumps(data), encoding="utf-8")
            return subprocess.run([sys.executable, "-I", str(ROOT / "scripts/vectors/check_g16_evm_openssl.py"), str(fixture)], cwd=ROOT, capture_output=True, text=True, timeout=10)

    def test_empty_signature_work_cannot_pass(self):
        for data in ({"vectors": []}, {"vectors": [{"id": "unsigned"}]}, {"vectors": [{"acceptances": []}]}):
            with self.subTest(data=data):
                result = self.run_oracle(data)
                self.assertNotEqual(result.returncode, 0, "zero signature verifications must fail")
                self.assertNotIn("independently verified", result.stdout)

    def test_committed_signed_fixture_checks_all_four_signatures(self):
        data = json.loads((ROOT / "packages/wallet/test/fixtures/g16-evm-independent.json").read_text(encoding="utf-8"))
        result = self.run_oracle(data)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("4 independently verified G16 fixture signatures", result.stdout)

    def test_actual_signature_digest_and_public_key_negative_controls(self):
        for mutation in ("signature", "digest", "public-key"):
            with self.subTest(mutation=mutation):
                data = json.loads((ROOT / "packages/wallet/test/fixtures/g16-evm-independent.json").read_text(encoding="utf-8"))
                vector = next(vector for vector in data["vectors"] if vector.get("acceptances"))
                if mutation == "signature":
                    vector["acceptances"][0]["signature"] = "00" * 65
                elif mutation == "digest":
                    vector["termsHash"] = ("1" if vector["termsHash"][0] == "0" else "0") + vector["termsHash"][1:]
                else:
                    vector["acceptances"][0]["publicKey"] = vector["acceptances"][1]["publicKey"]
                result = self.run_oracle(data)
                self.assertNotEqual(result.returncode, 0, mutation + " must fail actual verification")
                self.assertNotIn("independently verified", result.stdout)


if __name__ == "__main__":
    unittest.main()
