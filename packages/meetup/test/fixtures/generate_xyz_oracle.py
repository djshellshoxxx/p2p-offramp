"""Independent XYZ display oracle: Python stdlib log/tan; TypeScript uses asinh/tan."""
import json
import math
from pathlib import Path
import random

rng = random.Random(41)
inputs = [(0, 0, z) for z in (0, 1, 10, 14)]
inputs += [(lat, lon, z) for lat in (-90, -85.05112878, 85.05112878, 90)
           for lon in (-180, 180, 540) for z in (0, 14)]
inputs += [(rng.uniform(-85, 85), rng.uniform(-540, 540), rng.randrange(15)) for _ in range(64)]
vectors = []
for lat, lon, z in inputs:
    n = 2 ** z
    clipped = max(-85.05112878, min(85.05112878, lat))
    wrapped = ((lon + 180) % 360) - 180
    x = max(0, min(n - 1, math.floor((wrapped + 180) / 360 * n)))
    y = max(0, min(n - 1, math.floor((1 - math.log(math.tan(math.pi / 4 + math.radians(clipped) / 2)) / math.pi) / 2 * n)))
    vectors.append(dict(lat=lat, lon=lon, z=z, x=x, y=y, latitudeClipped=clipped != lat))
result = dict(provenance='Python stdlib math; XYZ log(tan(pi/4+latitude/2)), explicit display-only clipping/wrapping; fixed seed41', vectors=vectors)
Path(__file__).with_name('xyz-python-v1.json').write_text(json.dumps(result, indent=2))
