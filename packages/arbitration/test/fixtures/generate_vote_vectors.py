"""Independent ABI/Keccak fixtures through pinned official Foundry cast. Public synthetic salts only."""
import hashlib,json,subprocess,sys
from pathlib import Path
cast=sys.argv[1] if len(sys.argv)>1 else 'cast'
def run(*args):return subprocess.check_output([cast,*args],text=True).strip()
type_string='Vote(uint256 chainId,address tribunal,bytes32 policyHash,bytes32 caseId,uint8 round,bytes32 jurorId,bytes32 evidenceRoot,uint8 choice,bytes32 salt)'
type_hash=run('keccak',type_string)
inputs=[
 {'chainId':'1','tribunal':'0x'+'11'*20,'policyHash':'0x'+'22'*32,'caseId':'0x'+'33'*32,'round':0,'jurorId':'0x'+'44'*32,'evidenceRoot':'0x'+'55'*32,'choice':0,'salt':'0x'+'66'*32},
 {'chainId':'31337','tribunal':'0x'+'ab'*20,'policyHash':'0x'+'cd'*32,'caseId':'0x'+'ef'*32,'round':1,'jurorId':'0x'+'12'*32,'evidenceRoot':'0x'+'34'*32,'choice':2,'salt':'0x'+'00'*32},
 {'chainId':str(2**256-1),'tribunal':'0x'+'fe'*20,'policyHash':'0x'+'ff'*32,'caseId':'0x'+'00'*32,'round':1,'jurorId':'0x'+'ff'*32,'evidenceRoot':'0x'+'00'*32,'choice':1,'salt':'0x'+'ff'*32},
]
rows=[]
for item in inputs:
 encoded=run('abi-encode','f(bytes32,uint256,address,bytes32,bytes32,uint8,bytes32,bytes32,uint8,bytes32)',type_hash,item['chainId'],item['tribunal'],item['policyHash'],item['caseId'],str(item['round']),item['jurorId'],item['evidenceRoot'],str(item['choice']),item['salt'])
 assert len(encoded)==642
 words=['0x'+encoded[i:i+64] for i in range(2,len(encoded),64)]
 rows.append({'input':item,'typeHash':type_hash,'words':words,'preimage':encoded,'digest':run('keccak',encoded)})
source=Path(__file__).read_bytes()
output={'format':'p2p-offramp/cast-vote-vectors/v1','provenance':'Independent official Foundry cast ABI encoder and Keccak implementation, not the TypeScript word encoder or Noble hash. All salts are fixed public test material, never production randomness.','toolchain':run('--version'),'generatorSha256':hashlib.sha256(source).hexdigest(),'type':type_string,'vectors':rows}
path=Path(__file__).with_name('vote-cast-vectors.json');path.write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'vectors':len(rows),'typeHash':type_hash}))
