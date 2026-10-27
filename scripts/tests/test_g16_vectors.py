import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class G16VectorFixture(unittest.TestCase):
    def test_committed_fixture_matches_independent_generator(self):
        result = subprocess.run([sys.executable, "-I", str(ROOT / "scripts/vectors/g16_vectors.py"), "--check"], cwd=ROOT)
        self.assertEqual(result.returncode, 0, "regenerate with: python3 -I scripts/vectors/g16_vectors.py")


if __name__ == "__main__":
    unittest.main()
