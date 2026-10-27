"""Optional offline cross-check using installed cryptography/OpenSSL, never an app dependency."""
import json
import sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils

data = json.load(open(sys.argv[1], encoding="utf-8"))
checked = 0
for vector in data["vectors"]:
    for index, acceptance in enumerate(vector.get("acceptances", []), 1):
        public = ec.derive_private_key(index, ec.SECP256K1()).public_key()
        encoded = public.public_numbers()
        assert "04" + f"{encoded.x:064x}{encoded.y:064x}" == acceptance["publicKey"]
        raw = bytes.fromhex(acceptance["signature"])
        der = utils.encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:64], "big"))
        # Prehashed SHA256 specifies only the 32-byte digest size: OpenSSL does NOT hash again.
        public.verify(der, bytes.fromhex(vector["termsHash"]), ec.ECDSA(utils.Prehashed(hashes.SHA256())))
        checked += 1
print(f"OpenSSL secp256k1: {checked} independently verified G16 fixture signatures")
