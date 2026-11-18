from pathlib import Path
import json,hashlib,subprocess,re
root=Path(__file__).resolve().parents[2];sha=lambda b:hashlib.sha256(b).hexdigest();baseline=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
data=[('vault-at-rest','vault','Selected local records use authenticated encryption at rest.','packages/storage/src/vault-crypto.ts','packages/storage/test/vault-crypto.test.mjs',['Unlocked origin, weak passphrases, backups and OS compromise remain risks.']),('message-content','messaging','Local test messaging encrypts selected message content.','packages/nostr-crypto/src/nip44.ts','packages/nostr-crypto/test/nip44.test.mjs',['Relay metadata and recipient copies remain visible; no forward secrecy claim.']),('selected-route','routing','Only explicitly verified selected channels may show private routing.','packages/transport/src/policy.ts','packages/transport/test/policy.test.mjs',['Wallet routing, DNS, OS, extensions and timing correlation remain separate.'])]
claims=[];evidence=[]
for cid,cap,copy,src,test,ex in data:
 claims.append(dict(version=1,id=cid,capability=cap,exactCopy=copy,preconditions=['Matching current configuration and maintained scope review required.'],exclusions=ex,evidencePaths=[src,test],status='proposed',reviewedAt=None))
 for path in [src,test]: evidence.append(dict(path=path,sha256=sha((root/path).read_bytes())))
for cid,cap,copy,ex in [('stealth-local','stealth','Local stealth reduces casual discovery only.','No protection against OS, origin or forensic inspection.'),('location-scope','location','Location privacy is unsupported without a separately reviewed route.','DNS, wallet, OS and timing correlation remain outside this scope.'),('logical-removal','deletion','Selected local records can be logically removed.','Backups, other profiles, browser remnants and physical erasure remain outside scope.')]:
 claims.append(dict(version=1,id=cid,capability=cap,exactCopy=copy,preconditions=['No approved runtime claim.'],exclusions=[ex],evidencePaths=[],status='unsupported',reviewedAt=None))
copy_path='apps/web/src/ui/locale/en.ts'
# Derive mappings and strings from the canonical pure bindings and actual maintained catalog.
copy_rows=json.loads(subprocess.check_output(['node','--import','./scripts/test-support/register-tsx.mjs','--input-type=module','-e',"import{sourceCatalog}from'./apps/web/src/ui/locale/en.ts';import{claimCopyText,CLAIM_COPY_BINDINGS}from'./packages/claims/index.ts';console.log(JSON.stringify(Object.entries(CLAIM_COPY_BINDINGS).map(([key,claimId])=>({key,claimId,text:claimCopyText(sourceCatalog,key)}))))"],cwd=root,text=True))
reg=dict(version=1,sourceCommit=baseline,reviewers=[],approvedRelease=None,claims=claims,evidence=evidence,copySource=dict(path=copy_path,sha256=sha((root/copy_path).read_bytes())),copyKeys=[dict(key=row['key'],claimId=row['claimId'],sourceTextSha256=sha(row['text'].encode())) for row in copy_rows]);(root/'docs/wiki-source/claims-register.json').write_text(json.dumps(reg,indent=2)+'\n')
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
