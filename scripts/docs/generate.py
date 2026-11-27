from pathlib import Path
import argparse,json,hashlib,subprocess,re,sys

root = Path(__file__).resolve().parents[2]
sha = lambda b: hashlib.sha256(b).hexdigest()
MAIN_REF = 'refs/remotes/origin/main'


def refuse(code, detail):
    sys.exit(f'refused {code}: {detail}')


def run_git(*args):
    try:
        return subprocess.run(['git', *args], cwd=root, text=True, capture_output=True)
    except OSError:
        refuse('MAIN_ANCESTRY_UNAVAILABLE', 'could not execute git')


def git_output(code, *args):
    result = run_git(*args)
    if result.returncode != 0:
        refuse(code, 'git could not establish the requested source binding')
    return result.stdout.strip()


def require_main_ancestor(commit):
    top = git_output('MAIN_ANCESTRY_UNAVAILABLE', 'rev-parse', '--show-toplevel')
    if Path(top).resolve() != root:
        refuse('MAIN_ANCESTRY_UNAVAILABLE', 'root is not the repository top level')
    if git_output('MAIN_ANCESTRY_UNAVAILABLE', 'rev-parse', '--is-shallow-repository') != 'false':
        refuse('SHALLOW_HISTORY', 'fetch the complete main history before generating records')
    symbolic = run_git('symbolic-ref', '--quiet', MAIN_REF)
    if symbolic.returncode != 1:
        refuse('MAIN_REF_UNAVAILABLE', f'{MAIN_REF} must be a direct reference')
    # Even a full-name revision lookup can fall back to a similarly named local tag or branch.
    # Read only this exact ref, then compare immutable commit IDs rather than resolving its name again.
    main = git_output('MAIN_REF_UNAVAILABLE', 'show-ref', '--verify', '--hash', MAIN_REF)
    if not re.fullmatch(r'[0-9a-f]{40}', main) or git_output('MAIN_REF_UNAVAILABLE', 'cat-file', '-t', main) != 'commit':
        refuse('MAIN_REF_UNAVAILABLE', f'{MAIN_REF} must name a commit')
    ancestry = run_git('merge-base', '--is-ancestor', commit, main)
    if ancestry.returncode == 1:
        refuse('COMMIT_NOT_ON_MAIN', f'sourceCommit is not reachable from {MAIN_REF}; pass a main commit or --allow-local for fixtures')
    if ancestry.returncode != 0:
        refuse('MAIN_ANCESTRY_UNAVAILABLE', 'git could not establish main ancestry')


# Records bind immutable source bytes; the validator reports later working-tree drift as stale.
parser = argparse.ArgumentParser(description='Generate unapproved documentation records bound to a main commit.', allow_abbrev=False)
parser.add_argument('--allow-local', action='store_true', help='skip main ancestry checks for local fixtures only')
parser.add_argument('commit', nargs='?', default='HEAD', help='source revision (default: HEAD)')
args = parser.parse_args()
baseline = git_output('INVALID_COMMIT', 'rev-parse', '--verify', '--end-of-options', f'{args.commit}^{{commit}}')
if not re.fullmatch(r'[0-9a-f]{40}', baseline):
    refuse('INVALID_COMMIT', 'source revision must resolve to one commit')
if args.allow_local:
    print(f'warning: --allow-local skips the {MAIN_REF} ancestry check; use it only for fixtures', file=sys.stderr)
else:
    require_main_ancestor(baseline)

data=[('vault-at-rest','vault','Selected local records use authenticated encryption at rest.','packages/storage/src/vault-crypto.ts','packages/storage/test/vault-crypto.test.mjs',['Unlocked origin, weak passphrases, backups and OS compromise remain risks.']),('message-content','messaging','Local test messaging encrypts selected message content.','packages/nostr-crypto/src/nip44.ts','packages/nostr-crypto/test/nip44.test.mjs',['Relay metadata and recipient copies remain visible; no forward secrecy claim.']),('selected-route','routing','Only explicitly verified selected channels may show private routing.','packages/transport/src/policy.ts','packages/transport/test/policy.test.mjs',['Wallet routing, DNS, OS, extensions and timing correlation remain separate.'])]
claims=[];evidence=[]
for cid,cap,copy,src,test,ex in data:
 claims.append(dict(version=1,id=cid,capability=cap,exactCopy=copy,preconditions=['Matching current configuration and maintained scope review required.'],exclusions=ex,evidencePaths=[src,test],status='proposed',reviewedAt=None))
 for path in [src,test]:
  committed=subprocess.check_output(['git','show',f'{baseline}:{path}'],cwd=root)
  evidence.append(dict(path=path,sha256=sha(committed)))
for cid,cap,copy,ex in [('stealth-local','stealth','Local stealth reduces casual discovery only.','No protection against OS, origin or forensic inspection.'),('location-scope','location','Location privacy is unsupported without a separately reviewed route.','DNS, wallet, OS and timing correlation remain outside this scope.'),('logical-removal','deletion','Selected local records can be logically removed.','Backups, other profiles, browser remnants and physical erasure remain outside scope.')]:
 claims.append(dict(version=1,id=cid,capability=cap,exactCopy=copy,preconditions=['No approved runtime claim.'],exclusions=[ex],evidencePaths=[],status='unsupported',reviewedAt=None))
copy_path='apps/web/src/ui/locale/en.ts'
# Derive strings from the same immutable bytes as copySource, without executing historical source.
copy_bytes=subprocess.check_output(['git','show',f'{baseline}:{copy_path}'],cwd=root)
copy_rows=json.loads(subprocess.check_output(['node','--import','./scripts/test-support/register-tsx.mjs','--input-type=module','-e',"import{readFileSync}from'node:fs';import{claimCopyTextsFromSource}from'./scripts/docs/copy-source.mjs';import{CLAIM_COPY_BINDINGS}from'./packages/claims/index.ts';const texts=claimCopyTextsFromSource(readFileSync(0));console.log(JSON.stringify(Object.entries(CLAIM_COPY_BINDINGS).map(([key,claimId])=>({key,claimId,text:texts[key]}))))"],cwd=root,input=copy_bytes))
reg=dict(version=1,sourceCommit=baseline,reviewers=[],approvedRelease=None,claims=claims,evidence=evidence,copySource=dict(path=copy_path,sha256=sha(copy_bytes)),copyKeys=[dict(key=row['key'],claimId=row['claimId'],sourceTextSha256=sha(row['text'].encode())) for row in copy_rows]);(root/'docs/wiki-source/claims-register.json').write_text(json.dumps(reg,indent=2)+'\n')
# Pages are maintained by hand; the generator binds their current bytes and never rewrites them.
page_names=['Home','Getting-Started','Privacy-and-Recovery','Wallet-and-QR-Safety','Architecture-and-Development','Codespaces-Test-Lab','Security-and-Release']
pages={name:(root/f'docs/wiki-source/{name}.md').read_text(encoding='utf-8') for name in page_names}
docs=[];reports=[]
for name,text in pages.items():
 path=f'docs/wiki-source/{name}.md';docs.append(dict(locale='en',topic=name,sourcePath=path,sha256=sha(text.encode()),implementedCapabilities={'Getting-Started':['vault'],'Privacy-and-Recovery':['vault','messaging','routing'],'Architecture-and-Development':['vault','messaging','routing']}.get(name,[]),lastVerifiedRelease=None))
 for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',text):
  if target.startswith('https://'):reports.append(dict(source=path,target=target,status='remote-unverified'))
  else:reports.append(dict(source=path,target=target,status='local-valid',sha256=sha((root/path).parent.joinpath(target.split('#')[0]).read_bytes())))
# ASCII deterministic comparator matches JS report below.
reports.sort(key=lambda x:json.dumps(x,separators=(',',':')))
manifest=dict(version=1,releaseId='local-unapproved-draft',sourceCommit=baseline,dirtyDraft=True,reviewers=[],approvedRelease=None,documents=docs,linkReportDigest=sha(json.dumps(reports,separators=(',',':')).encode()))
(root/'docs/wiki-source/docs-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
