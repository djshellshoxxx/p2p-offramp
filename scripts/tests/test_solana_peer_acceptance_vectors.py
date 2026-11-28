"""Solana peer-acceptance vectors: the independent Python implementation must reproduce the frozen fixture."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "contracts/solana/vectors/acceptance.py"
FIXTURE = ROOT / "contracts/solana/vectors/peer-acceptance-v1.json"
README = ROOT / "contracts/solana/vectors/README.md"


class SolanaPeerAcceptanceVectors(unittest.TestCase):
    def check(self, *extra):
        return subprocess.run([sys.executable, "-I", str(SCRIPT), "--check", *extra], cwd=ROOT,
                              capture_output=True, text=True, timeout=120)

    def test_committed_fixture_matches_independent_generator(self):
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr or "regenerate: python -I " + str(SCRIPT) + " --write")
        self.assertIn("matches the independent generator", result.stdout)

    def test_readme_records_fixture_sha256(self):
        digest = hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
        self.assertIn(digest, README.read_text(encoding="utf-8"))

    def test_a_tampered_fixture_is_refused(self):
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        signature = data["positive"][0]["proof"]["acceptanceSignatureHex"]
        data["positive"][0]["proof"]["acceptanceSignatureHex"] = ("1" if signature[0] != "1" else "2") + signature[1:]
        with tempfile.TemporaryDirectory(prefix="p2p-solana-acceptance-") as directory:
            path = pathlib.Path(directory) / "tampered.json"
            path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            result = self.check(str(path))
        self.assertNotEqual(result.returncode, 0)

    def test_fixture_covers_the_required_cases(self):
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertIn("TEST-ONLY", data["warning"])
        negative = {item["id"] for item in data["negative"]}
        for required in ("acceptance-signed-v2-domain", "wrong-cluster-signed", "wrong-program-signed",
                         "flipped-bit-acceptance-s", "wrong-role-context", "expired-not-after",
                         "evm-peer-acceptance-digest", "legacy-transaction-message", "raw-g16-terms-signature",
                         "offchain-v0-agave-cli", "mixed-order-wallet-key", "bare-terms-signature",
                         # Each differs from a valid seller acceptance in one field, so it alone reaches one check.
                         "role-field-only-mismatch", "wrong-counterparty-messaging-key",
                         "terms-hash-field-only-mismatch", "identity-r"):
            self.assertIn(required, negative)
        steps = [step for scenario in data["ledger"] for step in scenario["steps"]]
        self.assertTrue(any(step["op"] == "tombstone" for step in steps))
        self.assertTrue(any(step["expect"] == "CONFLICT" for step in steps))
        self.assertEqual(len(data["positive"]), 4)


if __name__ == "__main__":
    unittest.main()
