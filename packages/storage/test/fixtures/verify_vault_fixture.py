"""Independently verify committed fixture; requires Python cryptography, never rewrites expected bytes."""
import base64
import json
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

fixture = json.loads(Path(__file__).with_name('vault-python-v1.json').read_text())
snapshot = fixture['snapshot']
dek, salt, wrapping_nonce, snapshot_nonce = map(bytes.fromhex, fixture['randomChunksHex'])
canonical = lambda value: json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
b64 = lambda value: base64.urlsafe_b64encode(value).decode().rstrip('=')
kek = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000).derive(fixture['passphrase'].encode())
wrap_aad = canonical(['p2p-offramp', 'vault-key', 1, snapshot['profileId'], snapshot['keyId'], 'PBKDF2-SHA256', 600000, b64(salt)])
snapshot_aad = canonical(['p2p-offramp', 'vault-snapshot', 1, snapshot['profileId'], snapshot['keyId'], snapshot['revision']])
serialized = canonical(snapshot)
padded = len(serialized).to_bytes(4, 'big') + serialized
padded += bytes((-len(padded)) % 4096)
expected = fixture['envelope']
assert b64(AESGCM(kek).encrypt(wrapping_nonce, dek, wrap_aad)) == expected['wrappedKey']['ciphertext']
assert b64(AESGCM(dek).encrypt(snapshot_nonce, padded, snapshot_aad)) == expected['snapshot']['ciphertext']
print('Independent Python fixture verification passed.')
