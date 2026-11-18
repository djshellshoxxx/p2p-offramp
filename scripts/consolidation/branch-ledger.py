"""Living branch ledger for docs/consolidation/LEDGER.md.

Computes, for every remote branch: exact head, open PR(s), ancestry vs main and vs the integration candidate,
patch equivalence (`git cherry`) and the files whose blob differs from the candidate. Dispositions are recorded in
DISPOSITIONS below (evidence-backed, edited by hand) and emitted next to the computed facts.

Usage: python3 scripts/consolidation/branch-ledger.py <candidate-ref> <out.json> [out.md]
Requires a full (unshallowed) fetch of every origin branch. Read-only: never pushes, tags or deletes.
"""
import json, subprocess, sys
from collections import Counter
import os
REPO = os.environ.get('LEDGER_REPO', '.')
CAND = sys.argv[1]
OUT = sys.argv[2]
def g(*a, ok=False):
    r = subprocess.run(['git', '-C', REPO, *a], capture_output=True, text=True)
    if r.returncode and not ok: raise SystemExit(f'git {a}: {r.stderr}')
    return r
M0 = 'claude/loving-einstein-xgzvdy-m0-'
PRS = {133:('nodata/epic-goldberg-sg8n96','nodata/affectionate-ritchie-xq4bon'),132:('nodata/affectionate-ritchie-xq4bon','main'),
131:('chatgpt/zero-codex/docs-collaboration-20261117','main'),129:('chatgpt/zero-codex/docs-python-baseline-20261116','main'),
128:('claude/confident-fermi-g6wjp3','integration/p2p-consolidated-20261109'),127:('codex/review-consolidate-20261116','claude/confident-fermi-g6wjp3'),
102:('parallel/cli-argument-regression-20261113','chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111'),
100:('parallel/localization-blank-warning-20261113',M0+'s05-web-locale-leaf'),
93:('chatgpt/zero-codex/d9-restored-race-20261111','chatgpt/zero-codex/d9-restored-account-isolation-20261111'),
92:('chatgpt/zero-codex/d9-restored-account-isolation-20261111','chatgpt/zero-codex/d9-restored-cross-network-nonce-20261111'),
91:('chatgpt/zero-codex/d9-restored-cross-network-nonce-20261111','chatgpt/zero-codex/d9-restored-casefold-20261110'),
84:('claude/p2p-offramp-evm-escrow-vc7stk','main'),81:('claude/vibrant-cray-ny4gum','integration/p2p-consolidated-20261109'),
75:('chatgpt/zero-codex/d9-restored-casefold-20261110','chatgpt/zero-codex/d9-restored-hash-conflict-20261110'),
74:('chatgpt/zero-codex/d9-restored-hash-conflict-20261110','chatgpt/zero-codex/d9-restored-pending-20261110'),
73:('chatgpt/zero-codex/d9-restored-pending-20261110','chatgpt/zero-codex/d9-restored-prepared-20261110'),
72:('chatgpt/zero-codex/d9-restored-prepared-20261110','chatgpt/zero-codex/d9-restored-terminal-20261110'),
71:('chatgpt/zero-codex/d9-restored-terminal-20261110','chatgpt/zero-codex/d9-restore-regression-20261110'),
70:('chatgpt/zero-codex/d9-restore-regression-20261110','chatgpt/zero-codex/d9-marker-failure-20261110'),
69:('chatgpt/zero-codex/d9-marker-failure-20261110','integration/p2p-consolidated-20261109'),
68:('chatgpt/zero-codex/docs-wiki-20261110','main'),67:('chatgpt/zero-codex/audit-evm-schema-20261110','main'),
66:('chatgpt/zero-codex/qualify-pr61-20261110','main'),65:('claude/friendly-dijkstra-nsi310','main'),64:('claude/p2p-offramp-prompt-lqcgno','main'),
63:('chatgpt/zero-codex-continuation-spec-20261109','main'),61:('integration/p2p-consolidated-20261109','main'),
60:('gpt/p2p-beta-spec-20261109','codex/rq00-evidence-20261109'),57:('codex/solana-payout-docs-20261109','claude/sleepy-fermat-4s6ocx'),
56:('claude/vibrant-cray-ny4gum','codex/core-continuation-20261104'),54:('codex/core-continuation-20261104','main'),
53:('codex/foundation-gates-20261104','main'),50:('claude/sleepy-fermat-4s6ocx','main'),
48:(M0+'s12-evidence',M0+'s11-governance-ci'),47:(M0+'s11-governance-ci',M0+'s10-optional-packages'),46:(M0+'s10-optional-packages',M0+'s09-intake'),
45:(M0+'s09-intake',M0+'s08-portal-lab-docs'),44:(M0+'s08-portal-lab-docs',M0+'s07-native-journey'),43:(M0+'s07-native-journey',M0+'s06-web-runtime-ui'),
42:(M0+'s06-web-runtime-ui',M0+'s05-web-locale-leaf'),41:(M0+'s05-web-locale-leaf',M0+'s04-wallet-release'),40:(M0+'s04-wallet-release',M0+'s03-core-messaging'),
39:(M0+'s03-core-messaging',M0+'s02-core-contracts-storage'),38:(M0+'s02-core-contracts-storage',M0+'s01-tooling'),37:(M0+'s01-tooling','main'),
35:('claude/loving-einstein-xgzvdy-journey','claude/loving-einstein-xgzvdy'),31:('review/codebase-security-20261104-94554ec','main'),
29:('claude/loving-einstein-xgzvdy-decisions','main'),28:('claude/loving-einstein-xgzvdy','autonomous/completion-20261102'),
27:('claude/quirky-knuth-3s6ysy','main'),26:('autonomous/completion-20261102','main')}
by_head = {}
for n,(h,b) in PRS.items(): by_head.setdefault(h, []).append((n,b))
branches = [l.strip()[len('origin/'):] for l in g('branch','-r','--format=%(refname:short)').stdout.split() if l.startswith('origin/') and l != 'origin/HEAD' and l!='origin']
cand = g('rev-parse', CAND).stdout.strip(); main = g('rev-parse','origin/main').stdout.strip()
rows = []
for b in sorted(branches):
    ref = f'origin/{b}'; head = g('rev-parse', ref).stdout.strip()
    ahead, behind = g('rev-list','--left-right','--count',f'{ref}...origin/main').stdout.split()
    in_main = g('merge-base','--is-ancestor',ref,'origin/main',ok=True).returncode == 0
    in_cand = g('merge-base','--is-ancestor',ref,cand,ok=True).returncode == 0
    row = dict(branch=b, head=head, prs=[f'#{n}->{base}' for n,base in by_head.get(b,[])], ahead_main=int(ahead), behind_main=int(behind),
               in_main=in_main, in_candidate=in_cand)
    if not in_cand:
        cherry = g('cherry', cand, ref, ok=True).stdout.split('\n')
        row['unique_commits'] = sum(1 for l in cherry if l.startswith('+'))
        row['equivalent_commits'] = sum(1 for l in cherry if l.startswith('-'))
        base = g('merge-base', ref, 'origin/main').stdout.strip()
        files = [f for f in g('diff','--name-only',base,ref).stdout.split('\n') if f]
        absent = []
        for f in files:
            a = g('rev-parse', f'{ref}:{f}', ok=True); c = g('rev-parse', f'{cand}:{f}', ok=True)
            av = a.stdout.strip() if a.returncode == 0 else None; cv = c.stdout.strip() if c.returncode == 0 else None
            if av != cv: absent.append((f, 'deleted-on-branch' if av is None else ('missing-in-candidate' if cv is None else 'differs')))
        row['branch_files'] = len(files); row['files_not_matching_candidate'] = len(absent)
        row['absent_by_area'] = dict(Counter('/'.join(f.split('/')[:2]) for f,_ in absent).most_common(8))
        row['missing_in_candidate'] = sum(1 for _,k in absent if k == 'missing-in-candidate')
    rows.append(row)
json.dump(dict(candidate=cand, main=main, branches=rows), open(OUT,'w'), indent=1)
print(len(rows), 'branches;', sum(r['in_candidate'] for r in rows), 'contained in candidate;', sum(r['in_main'] for r in rows), 'in main')

# ---- dispositions (hand-maintained; evidence in docs/consolidation/LEDGER.md) ----------------------------------
L3 = 'historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome'
DISPOSITIONS = {
    'autonomous/completion-20261102': L3, 'claude/loving-einstein-xgzvdy': L3, 'claude/loving-einstein-xgzvdy-journey': L3 + ' (F01/F03/F06 attempts)',
    'claude/vibrant-cray-ny4gum': L3 + ' (modern extraction of #37/#38/#40-#43; #56 and #81 share this head)',
    'chatgpt/zero-codex-continuation-spec-20261109': 'close as superseded (owner-approved)', 'claude/p2p-offramp-prompt-lqcgno': 'close as superseded (owner-approved)',
    'claude/quirky-knuth-3s6ysy': 'close: stale next-run prompt, not executed', 'chatgpt/zero-codex/audit-evm-schema-20261110': 'integrated: final ledger file imported as one commit',
    'chatgpt/zero-codex/qualify-pr61-20261110': 'integrated: final handoff file imported as one commit',
    'chatgpt/zero-codex/docs-collaboration-20261117': 'integrated: handoff file imported (stale-base deletions dropped)',
    'chatgpt/zero-codex/docs-python-baseline-20261116': 'selectively extracted: one-line OPERATOR.md change (stale-base deletions dropped)',
    'chatgpt/zero-codex/g25-public-endpoint-regression-20261110': 'already integrated (patch-equivalent; PR #79 closed)',
    'chatgpt/zero-codex/http-buffer-lifecycle-20261110': 'already integrated (patch-equivalent; PR #80 closed)',
    'chatgpt/zero-codex/registry-concurrency-20261110': 'already integrated (patch-equivalent; PR #78 closed)',
    'claude/compassionate-gauss-uyhfih': 'preserved: T41-T47 admission appended to tasks/todo.md as history',
    'claude/friendly-dijkstra-nsi310': 'partially integrated: T33-T35 fixes present; T36-T40 open tasks recorded; keep preserved',
    'codex/setup-autonomous-agent-20261104': 'excluded: weaker predecessor of the hardened openai-agents.yml (write token, no default-branch guard); paid-agent automation not revived',
    'codex/solana-payout-docs-20261109': 'already integrated (patch-equivalent; README later extended on trunk)',
    'docs/offramp-research-tools-execution-plan-20261106': 'integrated: research plan imported',
    'feat/custodial-ledger-foundation': 'excluded: custodial ledger contradicts the noncustodial client-side ADR (owner-approved archive/delete)',
    'parallel/localization-blank-warning-20261113': 'contained by content: its blank-warning cases are a strict subset of trunk locale-catalog tests',
    'review/codebase-security-20261104-94554ec': 'preserved historical review: files imported under docs/reviews',
}
for b in [r['branch'] for r in rows]:
    if b.startswith('chatgpt/zero-codex/d9-'):
        DISPOSITIONS.setdefault(b, 'contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied')
    if b.startswith('claude/loving-einstein-xgzvdy-m0-'): DISPOSITIONS.setdefault(b, L3 + ' (reviewed m0 split)')
    elif b.startswith('claude/loving-einstein-xgzvdy-s'): DISPOSITIONS.setdefault(b, 'superseded by the reviewed m0 split (no PR); historical only')
def disposition(r):
    if r['branch'] in DISPOSITIONS: return DISPOSITIONS[r['branch']]
    if r['in_main']: return 'already integrated (ancestor of main)'
    if r['in_candidate']: return 'integrate: ancestor of the integration candidate'
    return 'UNASSESSED'
if len(sys.argv) > 3:
    out = ['| Branch | Head | Open PR (-> base) | ahead/behind main | In main | In candidate | Unique / equivalent commits | Files differing from candidate | Disposition |',
           '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for r in rows:
        u = '' if r['in_candidate'] else f"{r['unique_commits']} / {r['equivalent_commits']}"
        f = '' if r['in_candidate'] else f"{r['files_not_matching_candidate']}/{r['branch_files']} ({r['missing_in_candidate']} absent)"
        out.append(f"| `{r['branch']}` | `{r['head'][:10]}` | {', '.join(r['prs']) or '-'} | {r['ahead_main']}/{r['behind_main']} | {'yes' if r['in_main'] else 'no'} | {'yes' if r['in_candidate'] else 'no'} | {u} | {f} | {disposition(r)} |")
    open(sys.argv[3], 'w').write('\n'.join(out) + '\n')
    print('unassessed:', [r['branch'] for r in rows if disposition(r) == 'UNASSESSED'])
