import importlib.util
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'spec_audit.py'
spec = importlib.util.spec_from_file_location('spec_audit', MODULE)
audit = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = audit
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / '00_PLANNING/f/m/spec-example.md'
        self.path.parent.mkdir(parents=True)

    def inspect(self, text):
        self.path.write_text(text)
        return audit.audit(self.root)[0]

    def test_placeholder_with_all_headings_is_not_complete(self):
        result = self.inspect('- **Status:** Placeholder — awaiting Iteration 3\n' +
                              '\n'.join(f'## {n}. Section' for n in range(1, 8)))
        self.assertEqual(result.category, 'scaffold')
        self.assertEqual(result.missing_sections, [])

    def test_missing_status_and_code_examples_do_not_claim_readiness(self):
        result = self.inspect('```md\nStatus: Expanded baseline\n## 1. Example\n```\n')
        self.assertEqual(result.category, 'manual-review-needed')
        self.assertEqual(result.missing_sections, list(range(1, 8)))

    def test_plain_status_and_missing_sections(self):
        result = self.inspect('Status: planning, not implemented.\n## 2. Objective\n')
        self.assertEqual(result.category, 'planning')
        self.assertNotIn(2, result.missing_sections)

    def test_links_ignore_remote_and_fragment_but_check_files(self):
        (self.path.parent / 'other file.md').touch()
        result = self.inspect('[ok](other%20file.md#section) [bad](missing.md) '
                              '[remote](https://example.com/no.md) [anchor](#here)')
        self.assertEqual(result.broken_links, ['missing.md'])

    def test_links_cannot_escape_repository(self):
        result = self.inspect('[escape](../../../../outside.md)')
        self.assertEqual(len(result.broken_links), 1)

    def test_design_baseline_still_requires_review(self):
        result = self.inspect('- **Status:** Expanded technical baseline — review required\n')
        self.assertEqual(result.category, 'design-review-pending')
        self.assertEqual(len(result.missing_sections), 7)

    def test_report_is_deterministic_and_links_from_docs(self):
        self.inspect('Status: Placeholder\n')
        specs = audit.audit(self.root)
        self.assertEqual(audit.render(specs), audit.render(specs))
        self.assertIn('../00_PLANNING/f/m/spec-example.md', audit.render(specs))

    def test_catalog_coverage_detects_missing_specs(self):
        self.inspect('Status: Placeholder\n')
        self.assertEqual(audit.unindexed(self.root, audit.audit(self.root)),
                         ['00_PLANNING/f/m/spec-example.md'])
        catalog = self.path.parent / 'spec-master-specification-index.md'
        catalog.write_text('Status: Navigation catalog\n[Example](spec-example.md)\n')
        self.assertEqual(audit.unindexed(self.root, audit.audit(self.root)), [])

    def test_cli_readiness_fails_even_when_links_pass(self):
        self.inspect('Status: Placeholder\n')
        catalog = self.path.parent / 'spec-master-specification-index.md'
        catalog.write_text('[Example](spec-example.md)\n')
        for flag, expected in [('--check', 1), ('--check-links', 0)]:
            result = subprocess.run([sys.executable, str(MODULE), '--root', str(self.root), flag],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, expected, result.stderr)

    def test_shorter_fence_does_not_end_example(self):
        result = self.inspect('````md\n```\nStatus: Expanded baseline\n## 1. Example\n````\n')
        self.assertEqual(result.category, 'manual-review-needed')
        self.assertEqual(result.missing_sections, list(range(1, 8)))

    def test_table_metadata_is_read_as_pending_design(self):
        result = self.inspect('| Status | Detailed engineering specification; implementation and independent review pending |\n')
        self.assertEqual(result.category, 'design-review-pending')
        self.assertIn('implementation and independent review pending', result.status)


if __name__ == '__main__':
    unittest.main()
