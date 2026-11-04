"""Independent test-only grid-index oracle. No midpoint bisection and no imported geohash library."""
import hashlib,json,platform,sys
from fractions import Fraction
from pathlib import Path
ALPHABET='0123456789bcdefghjkmnpqrstuvwxyz'
def grid_hash(lat,lon,precision):
    total=5*precision
    lonbits=(total+1)//2; latbits=total//2
    # Exact decimal rational arithmetic avoids assigning floating near-boundary values to a cell by accident.
    longitude=Fraction(str(lon)); latitude=Fraction(str(lat))
    assert -85<=latitude<=85 and -180<=longitude<180
    x=int(((longitude+180)*(1<<lonbits))//360)
    y=int(((latitude+90)*(1<<latbits))//180)
    bits=[]
    for j in range(total):
        if j%2==0: bits.append((x>>(lonbits-1-j//2))&1)
        else: bits.append((y>>(latbits-1-j//2))&1)
    return ''.join(ALPHABET[sum(bits[i+k]<<(4-k) for k in range(5))] for i in range(0,total,5))
assert grid_hash(42.6,-5.6,5)=='ezs42'
assert grid_hash(57.64911,10.40744,11)=='u4pruydqqvj'
points=[];seen=set()
def add(lat,lon,label):
    if (lat,lon) not in seen:points.append((lat,lon,label));seen.add((lat,lon))
for lat,lon,label in [(42.6,-5.6,'familiar-ezs42'),(57.64911,10.40744,'familiar-u4pruydqqvj'),(0,0,'equator-midpoint'),(0,-180,'west-dateline'),(0,179.999999,'east-dateline'),(60,-180,'north60-west'),(60,179.999999,'north60-east'),(-60,-180,'south60-west'),(-60,179.999999,'south60-east'),(84.9,179.999999,'north84.9-east'),(-84.9,-180,'south84.9-west'),(85,0,'north-supported-boundary'),(-85,0,'south-supported-boundary'),(45,90,'dyadic-cell-corner'),(-45,-90,'dyadic-cell-corner'),(84.375,0,'high-lat-dyadic-boundary')]:add(lat,lon,label)
# Deterministic unsigned LCG supplies decimal microdegree locations, not randomness/privacy claims.
seed=0x41_47454f
while len(points)<1024:
    seed=(1664525*seed+1013904223)&0xffffffff;lat=(seed%170000001-85000000)/1000000
    seed=(1664525*seed+1013904223)&0xffffffff;lon=(seed%360000000-180000000)/1000000
    add(lat,lon,'fixed-lcg-microdegree')
vectors=[{'lat':lat,'lon':lon,'label':label,'hashes':{str(p):grid_hash(lat,lon,p) for p in [4,5,6,7]}} for lat,lon,label in points]
source=Path(__file__).read_bytes()
output={'format':'p2p-offramp/independent-grid-geohash-fixtures/v1','provenance':'Independently implemented test-only oracle from integer grid quantization and longitude-first bit interleaving, not midpoint bisection. Familiar examples are conventional public geohash examples, not claimed as newly fetched official vectors.','algorithm':'Exact decimal Fraction input -> floor longitude/latitude grid indices -> most significant bits interleaved longitude first -> standard geohash base32. Coordinate half-open boundary belongs to upper cell.','python':platform.python_version(),'generatorSha256':hashlib.sha256(source).hexdigest(),'points':len(vectors),'comparisons':len(vectors)*4,'vectors':vectors}
path=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).with_name('geohash-oracle.json');path.write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'path':str(path),'points':len(vectors),'comparisons':len(vectors)*4,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'generatorSha256':hashlib.sha256(source).hexdigest(),'python':platform.python_version()}))
