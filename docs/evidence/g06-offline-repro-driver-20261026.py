from datetime import datetime,timezone
from pathlib import Path
import hashlib,io,json,os,subprocess,tarfile,tempfile
repo=Path('/workspace/p2p-offramp-pr5-validation');out=Path('/workspace/checkpoints/2026-10-26-p2p-g06-repro');out.mkdir(parents=True,exist_ok=True)
tree=subprocess.check_output(['git','write-tree'],cwd=repo,text=True).strip()
archive=subprocess.check_output(['git','archive',tree],cwd=repo)
result={'sourceTree':tree,'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'platform':'linux-x64-glibc','cacheVerification':json.load(open('/workspace/p2p-g06-cache-platform.json')),'runs':[]}
def save():
 with tempfile.NamedTemporaryFile('w',dir=out,delete=False) as f:
  json.dump(result,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno());name=f.name
 os.replace(name,out/'result.json')
for name in ['a','b']:
 root=out/('source-'+name)
 root.mkdir()
 with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(root,filter='data')
 record={'id':name,'commands':[]};result['runs'].append(record);save()
 for label,cmd in [('offline-install',['npm','ci','--offline','--ignore-scripts','--cache','/workspace/.npm-cache','--no-audit','--no-fund']),('build',['npm','run','build'])]:
  log=out/(name+'-'+label+'.log');start=datetime.now(timezone.utc).isoformat()
  print(json.dumps({'run':name,'step':label,'started':start}),flush=True)
  with log.open('wb') as stream:r=subprocess.run(cmd,cwd=root,stdout=stream,stderr=subprocess.STDOUT)
  entry={'command':cmd,'exit':r.returncode,'started':start,'finished':datetime.now(timezone.utc).isoformat(),'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()};record['commands'].append(entry);save()
  if r.returncode:
   print(log.read_text()[-4000:],flush=True);raise SystemExit(r.returncode)
 dist=root/'apps/web/dist';record['artifacts']=[{'path':str(p.relative_to(dist)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(dist.rglob('*')) if p.is_file()];save()
result['identicalArtifacts']=result['runs'][0]['artifacts']==result['runs'][1]['artifacts'];save()
print(json.dumps({'sourceTree':tree,'identicalArtifacts':result['identicalArtifacts'],'files':len(result['runs'][0]['artifacts'])}),flush=True)
if not result['identicalArtifacts']:raise SystemExit(1)
