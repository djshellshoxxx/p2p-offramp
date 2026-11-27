#!/usr/bin/env python3
"""Independent Solana peer-acceptance implementation and frozen vector generator.

Written from packages/chain-solana/docs/acceptance.md and the cited specifications, not from the TypeScript source.
It encodes G16 terms, the Solana off-chain message v1 envelope and both statements, signs with fixed TEST-ONLY seeds
through `cryptography` (OpenSSL Ed25519), and evaluates every vector with its own strict verifier, decoder and replay
ledger model. Edwards arithmetic for the strictness checks is implemented here from RFC 8032 section 5.1.

    /opt/tools/venv-oracle/bin/python -I contracts/solana/vectors/acceptance.py --write   # regenerate
    /opt/tools/venv-oracle/bin/python -I contracts/solana/vectors/acceptance.py --check   # exit 1 if stale

Every key below is derived from a public label. It is synthetic test data: never use it for funds.
"""
import hashlib
import json
import pathlib
import sys

import cryptography
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

HERE = pathlib.Path(__file__).resolve().parent
FIXTURE = HERE / "peer-acceptance-v1.json"
FORMAT = "p2p-offramp/solana/peer-acceptance-vectors/v1"

# ---------------------------------------------------------------- Ed25519 arithmetic (RFC 8032 section 5.1)
P = 2**255 - 19
L = 2**252 + 27742317777372353535851937790883648493
D = -121665 * pow(121666, P - 2, P) % P
SQRT_M1 = pow(2, (P - 1) // 4, P)
IDENTITY = (0, 1, 1, 0)


def point_add(a, b):
    """Extended homogeneous coordinates, a = -1 twisted Edwards addition (RFC 8032 5.1.4)."""
    x1, y1, z1, t1 = a
    x2, y2, z2, t2 = b
    aa = (y1 - x1) * (y2 - x2) % P
    bb = (y1 + x1) * (y2 + x2) % P
    cc = 2 * D * t1 * t2 % P
    dd = 2 * z1 * z2 % P
    e, f, g, h = bb - aa, dd - cc, dd + cc, bb + aa
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def scalar_mult(k, point):
    result = IDENTITY
    while k > 0:
        if k & 1:
            result = point_add(result, point)
        point = point_add(point, point)
        k >>= 1
    return result


def point_equal(a, b):
    return (a[0] * b[2] - b[0] * a[2]) % P == 0 and (a[1] * b[2] - b[1] * a[2]) % P == 0


def encode_point(point):
    zinv = pow(point[2], P - 2, P)
    x, y = point[0] * zinv % P, point[1] * zinv % P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def decode_point(raw: bytes):
    """Strict RFC 8032 5.1.3 decoding: y < p and no negative zero. Returns None when invalid."""
    if len(raw) != 32:
        return None
    value = int.from_bytes(raw, "little")
    sign, y = value >> 255, value & ((1 << 255) - 1)
    if y >= P:
        return None
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P) % P
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P:
        x = x * SQRT_M1 % P
    if (x * x - x2) % P:
        return None
    if x == 0 and sign:
        return None
    if x & 1 != sign:
        x = P - x
    return (x, y, 1, x * y % P)


BASE = decode_point((4 * pow(5, P - 2, P) % P).to_bytes(32, "little"))


def prime_order(point):
    return point is not None and not point_equal(scalar_mult(8, point), IDENTITY) and \
        point_equal(scalar_mult(L, point), IDENTITY)


def strict_verify(signature: bytes, message: bytes, public_key: bytes) -> bool:
    """Accept only RFC 8032 signer output: S < L, canonical prime-order A and R, cofactorless equation,
    and OpenSSL's own Ed25519 verification of the same bytes."""
    if len(signature) != 64 or len(public_key) != 32:
        return False
    s = int.from_bytes(signature[32:], "little")
    a_point, r_point = decode_point(public_key), decode_point(signature[:32])
    if s >= L or not prime_order(a_point) or not prime_order(r_point):
        return False
    k = int.from_bytes(hashlib.sha512(signature[:32] + public_key + message).digest(), "little") % L
    if not point_equal(scalar_mult(s, BASE), point_add(r_point, scalar_mult(k, a_point))):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, message)
    except InvalidSignature:
        return False
    return True


def cofactored_verify(signature: bytes, message: bytes, public_key: bytes) -> bool:
    """[8][S]B = [8]R + [8][k]A with strict decoding only; used to show what the strict policy adds."""
    s = int.from_bytes(signature[32:], "little")
    a_point, r_point = decode_point(public_key), decode_point(signature[:32])
    if s >= L or a_point is None or r_point is None:
        return False
    k = int.from_bytes(hashlib.sha512(signature[:32] + public_key + message).digest(), "little") % L
    left = scalar_mult(8, scalar_mult(s, BASE))
    return point_equal(left, scalar_mult(8, point_add(r_point, scalar_mult(k, a_point))))


class Wallet:
    """TEST-ONLY Ed25519 wallet from a 32-byte seed; signing goes through OpenSSL."""

    def __init__(self, label: str):
        self.seed = hashlib.sha256(f"p2p-offramp TEST-ONLY solana {label} wallet seed v1".encode()).digest()
        self.key = Ed25519PrivateKey.from_private_bytes(self.seed)
        self.public = self.key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        digest = hashlib.sha512(self.seed).digest()
        scalar = bytearray(digest[:32])
        scalar[0] &= 248
        scalar[31] &= 127
        scalar[31] |= 64
        self.scalar, self.prefix = int.from_bytes(scalar, "little"), digest[32:]
        assert encode_point(scalar_mult(self.scalar, BASE)) == self.public, "pure-Python arithmetic disagrees with OpenSSL"

    def sign(self, message: bytes) -> bytes:
        return self.key.sign(message)


class TorsionWallet:
    """Mixed-order public key A' = aB + T (T of order 8). Signs by RFC 8032 arithmetic with the fixed scalar a."""

    def __init__(self, base: Wallet, torsion):
        self.scalar, self.prefix = base.scalar, base.prefix
        self.public = encode_point(point_add(scalar_mult(self.scalar, BASE), torsion))

    def challenge(self, r_bytes: bytes, message: bytes) -> int:
        return int.from_bytes(hashlib.sha512(r_bytes + self.public + message).digest(), "little") % L

    def sign(self, message: bytes) -> bytes:
        r = int.from_bytes(hashlib.sha512(self.prefix + message).digest(), "little") % L
        r_bytes = encode_point(scalar_mult(r, BASE))
        s = (r + self.challenge(r_bytes, message) * self.scalar) % L
        return r_bytes + s.to_bytes(32, "little")


def order_eight_points():
    """The four points of exact order 8, found as L*Q for curve points Q (deterministic)."""
    found, y = [], 2
    while len(found) < 4:
        q = decode_point(y.to_bytes(32, "little"))
        y += 1
        if q is None:
            continue
        t = scalar_mult(L, q)
        if not point_equal(scalar_mult(4, t), IDENTITY) and not any(point_equal(t, f) for f in found):
            found.append(t)
    return sorted(found, key=encode_point)


# ---------------------------------------------------------------- secp256k1 x-only messaging keys (BIP-340)
SECP_P = 2**256 - 2**32 - 977


def x_only_valid(text) -> bool:
    if not isinstance(text, str) or len(text) != 64 or any(c not in "0123456789abcdef" for c in text):
        return False
    x = int(text, 16)
    return x < SECP_P and pow((x**3 + 7) % SECP_P, (SECP_P - 1) // 2, SECP_P) == 1


def messaging_key(label: str) -> str:
    secret = int.from_bytes(hashlib.sha256(f"p2p-offramp TEST-ONLY nostr {label} key v1".encode()).digest(), "big")
    private = ec.derive_private_key(secret % (2**256 - 432420386565659656852420866394968145599) or 1, ec.SECP256K1())
    text = private.public_key().public_numbers().x.to_bytes(32, "big").hex()
    assert x_only_valid(text)
    return text


def invalid_x_only() -> str:
    x = 1
    while x_only_valid(x.to_bytes(32, "big").hex()):
        x += 1
    return x.to_bytes(32, "big").hex()


# ---------------------------------------------------------------- encodings
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(raw: bytes) -> str:
    n, out = int.from_bytes(raw, "big"), ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    return "1" * (len(raw) - len(raw.lstrip(b"\x00"))) + out


def b58decode32(text):
    """Canonical 32-byte base58 or None."""
    if not isinstance(text, str) or not 32 <= len(text) <= 44 or any(c not in B58 for c in text):
        return None
    n = 0
    for c in text:
        n = n * 58 + B58.index(c)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    raw = b"\x00" * (len(text) - len(text.lstrip("1"))) + body
    return raw if len(raw) == 32 and b58encode(raw) == text else None


def g16(t) -> bytes:
    """G16 Solana raw terms (spec-signed-trade-terms.md section 4)."""
    native, zero = t["assetKind"] == "native", b"\x00" * 32
    key = b58decode32
    return (b"p2p-offramp/solana/basic/v1\x00" + key(t["genesisHash"]) + key(t["programId"]) + bytes.fromhex(t["orderId"])
            + key(t["seller"]) + key(t["buyer"]) + (zero if native else key(t["mint"]))
            + (zero if native else key(t["tokenProgram"])) + bytes.fromhex(t["privateAgreementHash"])
            + bytes.fromhex(t["capabilitiesHash"]) + bytes.fromhex(t["sellerNonce"]) + bytes([1])
            + int(t["revision"]).to_bytes(8, "little") + bytes([0 if native else 2])
            + int(t["amountBaseUnits"]).to_bytes(8, "little") + int(t["acceptBeforeSeconds"]).to_bytes(8, "little")
            + int(t["escrowExpirySeconds"]).to_bytes(8, "little") + bytes([0]))


SIGNING_DOMAIN = b"\xffsolana offchain"
MAX_MESSAGE = 1232
TERMS_DOMAIN = "p2p-offramp/solana/terms-consent/v1"
ACCEPTANCE_DOMAIN = "p2p-offramp/solana/peer-acceptance/v1"
TERMS_SENTENCE = "Off-chain consent to the escrow terms below. Signing it moves no funds."
ACCEPTANCE_SENTENCE = "Off-chain acceptance binding this wallet to two chat keys. It moves no funds."
TERMS_LINES = [("network", "networkId"), ("deployment", "deploymentId"), ("genesis", "genesisHash"),
               ("program", "programId"), ("seller", "seller"), ("buyer", "buyer"), ("terms-sha256", "termsHash")]
ACCEPTANCE_LINES = [("role", "role"), ("wallet", "wallet"), ("own-messaging-key", "ownMessagingKey"),
                    ("counterparty-messaging-key", "counterpartyMessagingKey"), ("network", "networkId"),
                    ("deployment", "deploymentId"), ("genesis", "genesisHash"), ("program", "programId"),
                    ("terms-sha256", "termsHash"), ("not-after", "notAfterSeconds")]
ACCEPTANCE_FIELDS = ["v", "role", "wallet", "ownMessagingKey", "counterpartyMessagingKey", "networkId",
                     "deploymentId", "genesisHash", "programId", "termsHash", "notAfterSeconds"]


def offchain_v1(signers, body: bytes) -> bytes:
    """sRFC #3 version 1: domain, version 1, signer count, signers sorted ascending, body (no length prefix)."""
    ordered = sorted(signers)
    return SIGNING_DOMAIN + bytes([1, len(ordered)]) + b"".join(ordered) + body


def body(domain, sentence, layout, statement) -> bytes:
    return "\n".join([domain, sentence] + [f"{label}: {statement[field]}" for label, field in layout]).encode("ascii")


def terms_message(consent) -> bytes:
    return offchain_v1([b58decode32(consent["seller"]), b58decode32(consent["buyer"])],
                       body(TERMS_DOMAIN, TERMS_SENTENCE, TERMS_LINES, consent))


def acceptance_message(statement) -> bytes:
    return offchain_v1([b58decode32(statement["wallet"])],
                       body(ACCEPTANCE_DOMAIN, ACCEPTANCE_SENTENCE, ACCEPTANCE_LINES, statement))


# ---------------------------------------------------------------- strict validation shared by decoder and verifier
class Refused(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def require(condition, code="INVALID_INPUT"):
    if not condition:
        raise Refused(code)


def registry_id(value):
    import re
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", value) and ".." not in value)
    return value


def u64(value, allow_zero):
    import re
    require(isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]{0,19}", value) and int(value) < 2**64)
    require(allow_zero or int(value) > 0)
    return int(value)


def hash32(value):
    require(isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value))
    return value


def solana_key(value):
    require(b58decode32(value) is not None)
    return value


def check_statement(raw):
    """Field order mirrors docs/acceptance.md: exact keys, version, then each value."""
    require(isinstance(raw, dict) and sorted(raw) == sorted(ACCEPTANCE_FIELDS))
    require(raw["v"] == 1 and type(raw["v"]) is int, "UNSUPPORTED_VERSION")
    require(x_only_valid(raw["ownMessagingKey"]) and x_only_valid(raw["counterpartyMessagingKey"]))
    require(raw["ownMessagingKey"] != raw["counterpartyMessagingKey"])
    u64(raw["notAfterSeconds"], False)
    require(raw["role"] in ("seller", "buyer"))
    solana_key(raw["wallet"])
    registry_id(raw["networkId"])
    registry_id(raw["deploymentId"])
    solana_key(raw["genesisHash"])
    solana_key(raw["programId"])
    hash32(raw["termsHash"])
    return dict(raw)


def check_consent(raw):
    require(raw["seller"] != raw["buyer"])
    for field in ("networkId", "deploymentId"):
        registry_id(raw[field])
    for field in ("genesisHash", "programId", "seller", "buyer"):
        solana_key(raw[field])
    hash32(raw["termsHash"])
    return raw


def decode_offchain(message: bytes):
    require(len(message) <= MAX_MESSAGE, "LIMIT_EXCEEDED")
    require(len(message) >= 16 + 2 + 32 + 1)
    require(message[:16] == SIGNING_DOMAIN)
    require(message[16] == 1, "UNSUPPORTED_VERSION")
    count = message[17]
    start = 18 + 32 * count
    require(1 <= count <= 2 and start < len(message))
    signers = [message[18 + 32 * i:50 + 32 * i] for i in range(count)]
    require(all(signers[i - 1] < signers[i] for i in range(1, count)))
    content = message[start:]
    require(all(b == 0x0A or 0x20 <= b <= 0x7E for b in content))
    return signers, content.decode("ascii")


def split_lines(text, domain, sentence, count):
    import re
    parts = text.split("\n")
    if parts[0] != domain:
        match = re.fullmatch(r"(.+/v)(0|[1-9][0-9]{0,2})", parts[0])
        raise Refused("UNSUPPORTED_VERSION" if match and match.group(1) == domain[:-1] else "INVALID_INPUT")
    require(len(parts) == count + 2 and parts[1] == sentence)
    return parts[2:]


def line_fields(values, layout):
    out = {}
    for (label, field), line in zip(layout, values):
        require(line.startswith(label + ": "))
        out[field] = line[len(label) + 2:]
    return out


def decode(kind, message: bytes):
    signers, text = decode_offchain(message)
    if kind == "terms":
        require(len(signers) == 2)
        raw = line_fields(split_lines(text, TERMS_DOMAIN, TERMS_SENTENCE, len(TERMS_LINES)), TERMS_LINES)
        statement = check_consent({"v": 1, **raw})
        require(terms_message(statement) == message)
        return statement
    require(len(signers) == 1)
    raw = line_fields(split_lines(text, ACCEPTANCE_DOMAIN, ACCEPTANCE_SENTENCE, len(ACCEPTANCE_LINES)),
                      ACCEPTANCE_LINES)
    statement = check_statement({"v": 1, **raw})
    require(statement["wallet"] == b58encode(signers[0]))
    require(acceptance_message(statement) == message)
    return statement


def consent_of(trade):
    t = trade["terms"]
    return {"v": 1, "networkId": trade["networkId"], "deploymentId": trade["deploymentId"],
            "genesisHash": t["genesisHash"], "programId": t["programId"], "seller": t["seller"], "buyer": t["buyer"],
            "termsHash": trade["termsHash"]}


def verify(trade, context, proof):
    """Independent verifier. Returns the derived result or raises Refused(code)."""
    consent = consent_of(trade)
    require(sorted(context) == sorted(["role", "ownMessagingKey", "counterpartyMessagingKey", "nowSeconds",
                                       "envelopeExpiresAtSeconds"]))
    require(sorted(proof) == ["acceptanceSignatureHex", "statement", "termsSignatureHex"])
    require(context["role"] in ("seller", "buyer"))
    require(x_only_valid(context["ownMessagingKey"]) and x_only_valid(context["counterpartyMessagingKey"]))
    require(context["ownMessagingKey"] != context["counterpartyMessagingKey"])
    now, envelope = u64(context["nowSeconds"], True), u64(context["envelopeExpiresAtSeconds"], False)
    statement = check_statement(proof["statement"])
    signatures = [bytes.fromhex(proof["termsSignatureHex"]), bytes.fromhex(proof["acceptanceSignatureHex"])]
    require(all(len(signature) == 64 for signature in signatures))
    require(all(statement[f] == consent[f] for f in ("networkId", "deploymentId", "genesisHash", "programId")),
            "WRONG_CHAIN")
    require(statement["termsHash"] == consent["termsHash"] and statement["role"] == context["role"]
            and statement["wallet"] == consent[context["role"]]
            and statement["ownMessagingKey"] == context["ownMessagingKey"]
            and statement["counterpartyMessagingKey"] == context["counterpartyMessagingKey"], "UNAUTHORIZED")
    deadline = min(int(statement["notAfterSeconds"]), int(trade["terms"]["acceptBeforeSeconds"]), envelope)
    require(now < deadline, "EXPIRED")
    wallet = b58decode32(statement["wallet"])
    terms, acceptance = terms_message(consent), acceptance_message(statement)
    require(strict_verify(signatures[0], terms, wallet) and strict_verify(signatures[1], acceptance, wallet),
            "UNAUTHORIZED")
    return {"termsMessageSha256": hashlib.sha256(terms).hexdigest(),
            "acceptanceMessageSha256": hashlib.sha256(acceptance).hexdigest(),
            "effectiveNotAfterSeconds": str(deadline)}


def outcome(work):
    try:
        work()
        return "ok"
    except Refused as refused:
        return refused.code


# ---------------------------------------------------------------- independent replay-ledger model
MAX_ACCEPTANCES, MAX_TOMBSTONES, HORIZON = 64, 64, 604_800


class LedgerModel:
    def __init__(self):
        self.watermark, self.acceptances, self.tombstones = 0, {}, {}

    def _now(self, clock):
        now = max(clock, self.watermark)
        for table in (self.acceptances, self.tombstones):
            for key in [k for k, row in table.items() if row["acceptBefore"] <= now]:
                self.watermark = max(self.watermark, table.pop(key)["acceptBefore"])
        return now

    def admit(self, trade, context, proof, clock):
        now = self._now(clock)
        verify(trade, {**context, "nowSeconds": str(now)}, proof)
        statement, accept_before = proof["statement"], int(trade["terms"]["acceptBeforeSeconds"])
        require(accept_before - now <= HORIZON, "LIMIT_EXCEEDED")
        require(statement["termsHash"] not in self.tombstones, "CONFLICT")
        party = {f: statement[f] for f in ("wallet", "ownMessagingKey", "counterpartyMessagingKey", "notAfterSeconds")}
        domain = {f: statement[f] for f in ("networkId", "deploymentId", "genesisHash", "programId")}
        entry = self.acceptances.get(statement["termsHash"])
        require(entry is None or entry["domain"] == domain, "CONFLICT")
        role, other = statement["role"], "buyer" if statement["role"] == "seller" else "seller"
        if entry and entry[role]:
            require(entry[role] == party, "CONFLICT")
            return "duplicate"
        if entry:
            seller, buyer = (party, entry[other]) if role == "seller" else (entry[other], party)
            require(seller["wallet"] != buyer["wallet"]
                    and seller["ownMessagingKey"] == buyer["counterpartyMessagingKey"]
                    and buyer["ownMessagingKey"] == seller["counterpartyMessagingKey"], "CONFLICT")
        else:
            require(len(self.acceptances) < MAX_ACCEPTANCES, "LIMIT_EXCEEDED")
            entry = {"acceptBefore": accept_before, "domain": domain, "seller": None, "buyer": None}
            self.acceptances[statement["termsHash"]] = entry
        entry[role] = party
        return "recorded"

    def tombstone(self, trade, clock):
        now, accept_before, key = self._now(clock), int(trade["terms"]["acceptBeforeSeconds"]), trade["termsHash"]
        if accept_before <= now:
            self.watermark = max(self.watermark, accept_before)
            return "ok"
        if key in self.tombstones:
            return "ok"
        require(accept_before - now <= HORIZON and len(self.tombstones) < MAX_TOMBSTONES, "LIMIT_EXCEEDED")
        self.acceptances.pop(key, None)
        self.tombstones[key] = {"acceptBefore": accept_before}
        return "ok"

    def status(self, trade, clock):
        self._now(clock)
        entry = self.acceptances.get(trade["termsHash"])
        return {"tombstoned": trade["termsHash"] in self.tombstones,
                "seller": bool(entry and entry["seller"]), "buyer": bool(entry and entry["buyer"])}


# ---------------------------------------------------------------- fixture construction
NOW = 1_793_782_800
NETWORK_ID, DEPLOYMENT_ID = "solana-localnet", "escrow-v1"
GENESIS = b58encode(b"genesis-hash:p2p-offramp:localv1")
OTHER_GENESIS = b58encode(b"genesis-hash:p2p-offramp:otherv1")
PROGRAM = b58encode(b"escrow-program:p2p-offramp:local")
OTHER_PROGRAM = b58encode(b"escrow-program:p2p-offramp:other")
MINT = b58encode(b"mint-6dp-open:p2p-offramp:local1")
TOKENKEG = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
# EIP-712 digests copied from packages/wallet/test/fixtures/peer-acceptance-v1.json (native seller vector):
# the TradeTerms digest ("termsHash") and the PeerAcceptance digest ("digest"). Used only as foreign bytes.
EVM_TRADE_TERMS_DIGEST = "005201bb0d2410a9bf411023a96cfc57009fb52d8c7a69e9f71b511af3ce666a"
EVM_PEER_ACCEPTANCE_DIGEST = "821f6410f427914f12635640ecb3d40879d2411376ea4c9acec05699f4060f5e"


def sha_hex(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def make_terms(kind, seller, buyer, accept_before=NOW + 600, label=None):
    spl = kind == "spl"
    label = label or kind
    return {"genesisHash": GENESIS, "programId": PROGRAM, "orderId": sha_hex(f"peer-acceptance-order-{label}"),
            "seller": seller, "buyer": buyer, "assetKind": kind, "mint": MINT if spl else None,
            "tokenProgram": TOKENKEG if spl else None, "privateAgreementHash": sha_hex("agreement"),
            "capabilitiesHash": hashlib.sha256(b"\x00").hexdigest(), "sellerNonce": sha_hex(f"peer-acceptance-nonce-{label}"),
            "revision": "1", "amountBaseUnits": "25000000" if spl else "500000000",
            "acceptBeforeSeconds": str(accept_before), "escrowExpirySeconds": str(accept_before + 3000)}


def trade_of(terms):
    raw = g16(terms)
    return {"networkId": NETWORK_ID, "deploymentId": DEPLOYMENT_ID, "terms": terms, "g16Hex": raw.hex(),
            "termsHash": hashlib.sha256(raw).hexdigest()}


def shortvec(n):
    out = bytearray()
    while True:
        byte, n = n & 0x7F, n >> 7
        out.append(byte | (0x80 if n else 0))
        if not n:
            return bytes(out)


def legacy_transaction(wallet: bytes, blockhash: bytes, data: bytes, versioned=False) -> bytes:
    """A transaction message a wallet would sign through signTransaction; it embeds the statement text."""
    program = b58decode32(PROGRAM)
    message = (bytes([0x80]) if versioned else b"") + bytes([1, 0, 1]) + shortvec(2) + wallet + program + blockhash
    message += shortvec(1) + bytes([1]) + shortvec(1) + bytes([0]) + shortvec(len(data)) + data
    return message + (shortvec(0) if versioned else b"")


def build():
    seller, buyer, mallory = Wallet("seller"), Wallet("buyer"), Wallet("mallory")
    keys = {"seller": messaging_key("seller"), "buyer": messaging_key("buyer"), "other": messaging_key("other")}
    wallets = {"seller": seller, "buyer": buyer}
    b58 = {name: b58encode(w.public) for name, w in (("seller", seller), ("buyer", buyer), ("mallory", mallory))}
    trades = {"native": trade_of(make_terms("native", b58["seller"], b58["buyer"])),
              "spl": trade_of(make_terms("spl", b58["seller"], b58["buyer"])),
              "far": trade_of(make_terms("native", b58["seller"], b58["buyer"], NOW + HORIZON + 1, "far"))}
    not_after = str(NOW + 300)

    def context(role, now=NOW, envelope=NOW + 3600, own=None, counterparty=None):
        other = "buyer" if role == "seller" else "seller"
        return {"role": role, "ownMessagingKey": own or keys[role], "counterpartyMessagingKey": counterparty or keys[other],
                "nowSeconds": str(now), "envelopeExpiresAtSeconds": str(envelope)}

    def statement(trade_name, role, **changes):
        consent = consent_of(trades[trade_name])
        other = "buyer" if role == "seller" else "seller"
        base = {"v": 1, "role": role, "wallet": consent[role], "ownMessagingKey": keys[role],
                "counterpartyMessagingKey": keys[other], "networkId": consent["networkId"],
                "deploymentId": consent["deploymentId"], "genesisHash": consent["genesisHash"],
                "programId": consent["programId"], "termsHash": consent["termsHash"], "notAfterSeconds": not_after}
        base.update(changes)
        return {field: base[field] for field in ACCEPTANCE_FIELDS}

    def proof(trade_name, stmt, signer, terms_bytes=None, acceptance_bytes=None):
        terms_bytes = terms_message(consent_of(trades[trade_name])) if terms_bytes is None else terms_bytes
        acceptance_bytes = acceptance_message(stmt) if acceptance_bytes is None else acceptance_bytes
        return {"statement": stmt, "termsSignatureHex": signer.sign(terms_bytes).hex(),
                "acceptanceSignatureHex": signer.sign(acceptance_bytes).hex()}

    positive, variants, negative = [], [], []
    for trade_name in ("native", "spl"):
        for role in ("seller", "buyer"):
            stmt = statement(trade_name, role)
            consent = consent_of(trades[trade_name])
            item = {"id": f"{trade_name}-{role}", "trade": trade_name, "context": context(role),
                    "proof": proof(trade_name, stmt, wallets[role]),
                    "termsText": body(TERMS_DOMAIN, TERMS_SENTENCE, TERMS_LINES, consent).decode(),
                    "acceptanceText": body(ACCEPTANCE_DOMAIN, ACCEPTANCE_SENTENCE, ACCEPTANCE_LINES, stmt).decode(),
                    "termsMessageHex": terms_message(consent).hex(), "acceptanceMessageHex": acceptance_message(stmt).hex()}
            item["expect"] = verify(trades[trade_name], item["context"], item["proof"])
            positive.append(item)

    def variant(ident, trade_name, role, ctx, stmt):
        item = {"id": ident, "trade": trade_name, "context": ctx, "proof": proof(trade_name, stmt, wallets[role])}
        item["expect"] = verify(trades[trade_name], ctx, item["proof"])
        variants.append(item)

    variant("native-seller-renewed", "native", "seller", context("seller"),
            statement("native", "seller", notAfterSeconds=str(NOW + 400)))
    variant("native-buyer-foreign-counterparty", "native", "buyer", context("buyer", counterparty=keys["other"]),
            statement("native", "buyer", counterpartyMessagingKey=keys["other"]))
    variant("native-seller-last-second", "native", "seller", context("seller", now=NOW + 299),
            statement("native", "seller"))
    variant("far-seller", "far", "seller", context("seller"), statement("far", "seller"))

    base = positive[0]
    seller_stmt = base["proof"]["statement"]
    accept_body = body(ACCEPTANCE_DOMAIN, ACCEPTANCE_SENTENCE, ACCEPTANCE_LINES, seller_stmt)
    accept_bytes = bytes.fromhex(base["acceptanceMessageHex"])

    def neg(ident, description, expect, ctx=None, proof_value=None, trade="native", signed=None, **extra):
        item = {"id": ident, "description": description, "trade": trade, "context": ctx or context("seller"),
                "proof": base["proof"] if proof_value is None else proof_value, **extra}
        if signed is not None:
            slots = [slot for slot in ("terms", "acceptance")
                     if item["proof"][slot + "SignatureHex"] == seller.sign(signed).hex()]
            assert len(slots) == 1, ident
            item["signedMessageHex"], item["signedBy"], item["signedSlot"] = signed.hex(), "seller", slots[0]
        actual = outcome(lambda: verify(trades[trade], item["context"], item["proof"]))
        assert actual == expect, (ident, actual, expect)
        item["expect"] = expect
        negative.append(item)

    def with_acceptance_over(message):
        return {**base["proof"], "acceptanceSignatureHex": seller.sign(message).hex()}

    def with_terms_over(message):
        return {**base["proof"], "termsSignatureHex": seller.sign(message).hex()}

    def flip(hex_text, index):
        raw = bytearray(bytes.fromhex(hex_text))
        raw[index] ^= 1
        return raw.hex()

    v2 = offchain_v1([seller.public], accept_body.replace(ACCEPTANCE_DOMAIN.encode(), ACCEPTANCE_DOMAIN[:-1].encode() + b"2"))
    neg("acceptance-signed-v2-domain", "Wallet signed the statement under a v2 body domain.", "UNAUTHORIZED",
        proof_value=with_acceptance_over(v2), signed=v2)
    neg("acceptance-slot-holds-terms-signature", "The terms signature is reused as the acceptance.", "UNAUTHORIZED",
        proof_value={**base["proof"], "acceptanceSignatureHex": base["proof"]["termsSignatureHex"]})
    neg("swapped-signatures", "Terms and acceptance signatures are swapped.", "UNAUTHORIZED",
        proof_value={**base["proof"], "termsSignatureHex": base["proof"]["acceptanceSignatureHex"],
                     "acceptanceSignatureHex": base["proof"]["termsSignatureHex"]})
    for field, other, label in (("genesisHash", OTHER_GENESIS, "cluster"), ("programId", OTHER_PROGRAM, "program"),
                                ("deploymentId", "escrow-v2", "deployment"), ("networkId", "solana-localnet-2", "network")):
        foreign = statement("native", "seller", **{field: other})
        signed = acceptance_message(foreign)
        neg(f"wrong-{label}-signed", f"Wallet signed for another {label}; the local {label} is presented.",
            "UNAUTHORIZED", proof_value=with_acceptance_over(signed), signed=signed)
        neg(f"wrong-{label}-claimed", f"The statement names another {label} and is signed for it.", "WRONG_CHAIN",
            proof_value={**base["proof"], "statement": foreign, "acceptanceSignatureHex": seller.sign(signed).hex()})
        foreign_consent = {**consent_of(trades["native"]), field: other}
        signed_terms = terms_message(foreign_consent)
        neg(f"terms-signed-other-{label}", f"Terms consent signed for another {label}.", "UNAUTHORIZED",
            proof_value=with_terms_over(signed_terms), signed=signed_terms)
    neg("flipped-bit-acceptance-r", "One bit flipped in the acceptance signature R.", "UNAUTHORIZED",
        proof_value={**base["proof"], "acceptanceSignatureHex": flip(base["proof"]["acceptanceSignatureHex"], 0)})
    neg("flipped-bit-acceptance-s", "One bit flipped in the acceptance signature S.", "UNAUTHORIZED",
        proof_value={**base["proof"], "acceptanceSignatureHex": flip(base["proof"]["acceptanceSignatureHex"], 40)})
    neg("flipped-bit-terms-signature", "One bit flipped in the terms signature.", "UNAUTHORIZED",
        proof_value={**base["proof"], "termsSignatureHex": flip(base["proof"]["termsSignatureHex"], 63)})
    flipped = bytes.fromhex(flip(accept_bytes.hex(), len(accept_bytes) - 1))
    neg("flipped-bit-signed-message", "Wallet signed the statement with one bit flipped.", "UNAUTHORIZED",
        proof_value=with_acceptance_over(flipped), signed=flipped)
    neg("wrong-role-context", "A seller acceptance offered where a buyer acceptance is expected.", "UNAUTHORIZED",
        ctx=context("buyer", own=keys["seller"], counterparty=keys["buyer"]))
    swapped_role = statement("native", "buyer", wallet=b58["seller"], ownMessagingKey=keys["seller"],
                             counterpartyMessagingKey=keys["buyer"])
    neg("role-swapped-statement", "The seller wallet signs a statement claiming the buyer role.", "UNAUTHORIZED",
        ctx=context("buyer", own=keys["seller"], counterparty=keys["buyer"]),
        proof_value=proof("native", swapped_role, seller))
    # Only the role field differs: the wallet, both messaging keys and the signatures all match the seller context.
    neg("role-field-only-mismatch", "The seller wallet signs its own statement with role buyer for a seller context.",
        "UNAUTHORIZED", proof_value=proof("native", {**statement("native", "seller"), "role": "buyer"}, seller))
    neg("wrong-signer-mallory", "A third wallet signs the seller's statement.", "UNAUTHORIZED",
        proof_value=proof("native", seller_stmt, mallory))
    neg("wrong-signer-buyer", "The buyer wallet signs the seller's statement.", "UNAUTHORIZED",
        proof_value=proof("native", seller_stmt, buyer))
    neg("foreign-wallet-statement", "The statement names a wallet that is not the seller in the terms.",
        "UNAUTHORIZED", proof_value=proof("native", statement("native", "seller", wallet=b58["mallory"]), mallory))
    neg("other-trade-terms-hash", "A valid spl acceptance replayed against the native trade.", "UNAUTHORIZED",
        proof_value=positive[2]["proof"])
    neg("expired-not-after", "Local time equals notAfterSeconds.", "EXPIRED", ctx=context("seller", now=NOW + 300))
    late = statement("native", "seller", notAfterSeconds=str(NOW + 900))
    neg("expired-accept-before", "notAfter is later, but local time equals acceptBeforeSeconds.", "EXPIRED",
        ctx=context("seller", now=NOW + 600), proof_value=proof("native", late, seller))
    neg("expired-envelope", "Local time equals the envelope expiry.", "EXPIRED",
        ctx=context("seller", now=NOW + 100, envelope=NOW + 100))
    neg("wrong-own-messaging-key", "The session's sender key differs from the signed own key.", "UNAUTHORIZED",
        ctx=context("seller", own=keys["other"]))
    # Only the counterparty key differs: the signed statement names a third key, the session expects the buyer's.
    neg("wrong-counterparty-messaging-key", "The signed counterparty key differs from the session's counterparty key.",
        "UNAUTHORIZED",
        proof_value=proof("native", statement("native", "seller", counterpartyMessagingKey=keys["other"]), seller))
    neg("swapped-messaging-keys", "Own and counterparty keys are swapped in the session.", "UNAUTHORIZED",
        ctx=context("seller", own=keys["buyer"], counterparty=keys["seller"]))
    neg("invalid-messaging-key", "The statement's own key is not an x-only secp256k1 point.", "INVALID_INPUT",
        proof_value={**base["proof"], "statement": {**seller_stmt, "ownMessagingKey": invalid_x_only()}})
    neg("same-messaging-keys", "Own and counterparty keys are equal.", "INVALID_INPUT",
        proof_value={**base["proof"], "statement": {**seller_stmt, "counterpartyMessagingKey": keys["seller"]}})
    neg("unknown-statement-version", "Statement version 2.", "UNSUPPORTED_VERSION",
        proof_value={**base["proof"], "statement": {**seller_stmt, "v": 2}})
    for name, digest in (("evm-peer-acceptance-digest", EVM_PEER_ACCEPTANCE_DIGEST),
                         ("evm-trade-terms-digest", EVM_TRADE_TERMS_DIGEST)):
        raw = bytes.fromhex(digest)
        neg(name, "The Solana wallet signed a 32-byte EIP-712 digest.", "UNAUTHORIZED",
            proof_value=with_acceptance_over(raw) if "peer" in name else with_terms_over(raw), signed=raw)
    blockhash = bytes.fromhex(seller_stmt["termsHash"])
    for name, versioned in (("legacy-transaction-message", False), ("v0-transaction-message", True)):
        tx = legacy_transaction(seller.public, blockhash, accept_body, versioned)
        neg(name, "The wallet signed a transaction message embedding the statement text.", "UNAUTHORIZED",
            proof_value=with_acceptance_over(tx), signed=tx)
    neg("raw-body-without-preamble", "signMessage over the statement text without the off-chain preamble.",
        "UNAUTHORIZED", proof_value=with_acceptance_over(accept_body), signed=accept_body)
    raw_g16 = bytes.fromhex(trades["native"]["g16Hex"])
    neg("raw-g16-terms-signature", "Terms signature over the raw G16 bytes instead of the terms consent.",
        "UNAUTHORIZED", proof_value=with_terms_over(raw_g16), signed=raw_g16)
    short_v0 = SIGNING_DOMAIN + bytes([0, 1]) + len(accept_body).to_bytes(2, "little") + accept_body
    neg("offchain-v0-agave-cli", "Agave CLI layout: domain, version 0, format 1, u16 length, body.", "UNAUTHORIZED",
        proof_value=with_acceptance_over(short_v0), signed=short_v0)
    long_v0 = (SIGNING_DOMAIN + bytes([0]) + b58decode32(PROGRAM) + bytes([1, 1]) + seller.public
               + len(accept_body).to_bytes(2, "little") + accept_body)
    neg("offchain-v0-application-domain", "Version 0 with application domain = program id and one signer.",
        "UNAUTHORIZED", proof_value=with_acceptance_over(long_v0), signed=long_v0)
    signature = bytes.fromhex(base["proof"]["acceptanceSignatureHex"])
    high_s = signature[:32] + (int.from_bytes(signature[32:], "little") + L).to_bytes(32, "little")
    neg("non-canonical-s", "S + L: the same equation with a non-canonical scalar.", "UNAUTHORIZED",
        proof_value={**base["proof"], "acceptanceSignatureHex": high_s.hex()})
    neg("bare-terms-signature", "Only a terms signature: no statement and no acceptance signature.", "INVALID_INPUT",
        proof_value={"termsSignatureHex": base["proof"]["termsSignatureHex"]})
    neg("short-acceptance-signature", "A 63-byte acceptance signature.", "INVALID_INPUT",
        proof_value={**base["proof"], "acceptanceSignatureHex": base["proof"]["acceptanceSignatureHex"][:126]})

    # Mixed-order wallet key: valid under the cofactored equation, refused by the strict policy.
    for torsion in order_eight_points():
        torsioned = TorsionWallet(seller, torsion)
        trades["torsion"] = trade_of(make_terms("native", b58encode(torsioned.public), b58["buyer"], label="torsion"))
        stmt = statement("torsion", "seller")
        messages = [terms_message(consent_of(trades["torsion"])), acceptance_message(stmt)]
        sigs = [torsioned.sign(m) for m in messages]
        if all(cofactored_verify(s, m, torsioned.public) and not strict_verify(s, m, torsioned.public)
               and torsioned.challenge(s[:32], m) % 8 for s, m in zip(sigs, messages)):
            break
    else:
        raise SystemExit("no order-8 point gives a cofactored-only signature")
    neg("mixed-order-wallet-key", "Wallet key aB + T (T of order 8): cofactored-valid, cofactorless-invalid.",
        "UNAUTHORIZED", trade="torsion", proof_value={"statement": stmt, "termsSignatureHex": sigs[0].hex(),
                                                       "acceptanceSignatureHex": sigs[1].hex()},
        cofactoredValid=True, torsionPointHex=encode_point(torsion).hex(), scalarSource="seller seed (RFC 8032 clamp)")

    # A real key with a mixed-order R = rB + T: the cofactored equation holds, the cofactorless one does not.
    torsion = order_eight_points()[0]
    r = int.from_bytes(hashlib.sha512(seller.prefix + accept_bytes).digest(), "little") % L
    r_bytes = encode_point(point_add(scalar_mult(r, BASE), torsion))
    k = int.from_bytes(hashlib.sha512(r_bytes + seller.public + accept_bytes).digest(), "little") % L
    mixed_r = r_bytes + ((r + k * seller.scalar) % L).to_bytes(32, "little")
    assert cofactored_verify(mixed_r, accept_bytes, seller.public) and not strict_verify(mixed_r, accept_bytes, seller.public)
    neg("mixed-order-r", "The seller's own key signs with R = rB + T: cofactored-valid, cofactorless-invalid.",
        "UNAUTHORIZED", proof_value={**base["proof"], "acceptanceSignatureHex": mixed_r.hex()}, cofactoredValid=True)

    # Same kind of key, ground until k = 0 mod 8 for both messages: every equation holds (OpenSSL accepts too), and
    # only the prime-order-subgroup rule refuses it. Deterministic: the first matching label and notAfter are used.
    torsioned = TorsionWallet(seller, order_eight_points()[0])
    openssl = Ed25519PublicKey.from_public_bytes(torsioned.public)

    def zero_mod_8(message):
        signature = torsioned.sign(message)
        return signature if torsioned.challenge(signature[:32], message) % 8 == 0 else None

    for attempt in range(4096):
        trades["torsion-k0"] = trade_of(make_terms("native", b58encode(torsioned.public), b58["buyer"],
                                                   label=f"torsion-k0-{attempt}"))
        terms_signature = zero_mod_8(terms_message(consent_of(trades["torsion-k0"])))
        if terms_signature:
            break
    for offset in range(4096):
        stmt = statement("torsion-k0", "seller", notAfterSeconds=str(NOW + 300 + offset))
        acceptance_signature = zero_mod_8(acceptance_message(stmt))
        if acceptance_signature:
            break
    for signature, message in ((terms_signature, terms_message(consent_of(trades["torsion-k0"]))),
                               (acceptance_signature, acceptance_message(stmt))):
        openssl.verify(signature, message)  # raises if OpenSSL refuses
        assert cofactored_verify(signature, message, torsioned.public)
        assert not strict_verify(signature, message, torsioned.public)
    neg("mixed-order-wallet-key-all-equations-hold", "Key aB + T with k = 0 mod 8: cofactored, cofactorless and "
        "OpenSSL verification all pass; only the prime-order key rule refuses it.", "UNAUTHORIZED", trade="torsion-k0",
        proof_value={"statement": stmt, "termsSignatureHex": terms_signature.hex(),
                     "acceptanceSignatureHex": acceptance_signature.hex()},
        cofactoredValid=True, opensslValid=True)

    decoding = build_decoding(positive, seller, buyer, mallory, keys)
    ledger = build_ledger(trades, positive, variants)
    return {
        "format": FORMAT,
        "generator": {"file": "contracts/solana/vectors/acceptance.py", "python": "3.12",
                      "cryptography": "50.0.0 (scripts/tests/requirements-crypto.txt)",
                      "independentOf": "packages/chain-solana/src (written from docs/acceptance.md)"},
        "warning": "TEST-ONLY synthetic keys derived from public labels. Never use them for funds.",
        "constants": {"nowSeconds": str(NOW), "networkId": NETWORK_ID, "deploymentId": DEPLOYMENT_ID,
                      "genesisHash": GENESIS, "programId": PROGRAM, "otherGenesisHash": OTHER_GENESIS,
                      "otherProgramId": OTHER_PROGRAM, "mint": MINT, "maxTermsHorizonSeconds": str(HORIZON)},
        "wallets": {name: {"seedHex": w.seed.hex(), "publicKey": b58encode(w.public)}
                    for name, w in (("seller", seller), ("buyer", buyer), ("mallory", mallory))},
        "messagingKeys": keys,
        "trades": trades,
        "positive": positive,
        "variants": variants,
        "negative": negative,
        "decoding": decoding,
        "ledger": ledger,
    }


def build_decoding(positive, seller, buyer, mallory, keys):
    vectors = []
    accept = bytes.fromhex(positive[0]["acceptanceMessageHex"])
    terms = bytes.fromhex(positive[0]["termsMessageHex"])
    stmt = positive[0]["proof"]["statement"]

    def add(ident, kind, message, expect):
        actual = outcome(lambda: decode(kind, message))
        assert actual == expect, (ident, actual, expect)
        item = {"id": ident, "kind": kind, "messageHex": message.hex(), "expect": expect}
        if expect == "ok":
            item["decoded"] = decode(kind, message)
        vectors.append(item)

    def accept_text(**changes):
        lines = [f"{label}: {changes.get(field, stmt[field])}" for label, field in ACCEPTANCE_LINES]
        return "\n".join([ACCEPTANCE_DOMAIN, ACCEPTANCE_SENTENCE] + lines).encode()

    def replaced(old: bytes, new: bytes, message=accept):
        assert message.count(old) == 1, old
        return message.replace(old, new)

    add("acceptance-ok", "acceptance", accept, "ok")
    add("terms-ok", "terms", terms, "ok")
    add("version-0", "acceptance", accept[:16] + b"\x00" + accept[17:], "UNSUPPORTED_VERSION")
    add("version-2", "acceptance", accept[:16] + b"\x02" + accept[17:], "UNSUPPORTED_VERSION")
    add("bad-signing-domain", "acceptance", b"\xfe" + accept[1:], "INVALID_INPUT")
    add("zero-signers", "acceptance", accept[:17] + b"\x00" + accept[50:], "INVALID_INPUT")
    three = sorted([seller.public, buyer.public, mallory.public])
    add("three-signers", "acceptance", offchain_v1(three, accept[50:]), "INVALID_INPUT")
    signers = sorted([seller.public, buyer.public])
    add("unsorted-signers", "terms", terms[:18] + signers[1] + signers[0] + terms[82:], "INVALID_INPUT")
    add("duplicate-signers", "terms", terms[:18] + signers[0] + signers[0] + terms[82:], "INVALID_INPUT")
    add("terms-as-acceptance", "acceptance", terms, "INVALID_INPUT")
    add("acceptance-as-terms", "terms", accept, "INVALID_INPUT")
    add("trailing-lf", "acceptance", accept + b"\n", "INVALID_INPUT")
    add("trailing-letter", "acceptance", accept + b"x", "INVALID_INPUT")
    # Version 1 has no length prefix: an appended digit is a different, well-formed statement (notAfter * 10).
    add("trailing-digit-is-another-statement", "acceptance", accept + b"0", "ok")
    add("crlf", "acceptance", replaced(b"\nrole", b"\r\nrole"), "INVALID_INPUT")
    add("nul-byte", "acceptance", replaced(b"\nrole", b"\x00role"), "INVALID_INPUT")
    add("non-ascii", "acceptance", replaced(b"It moves", "It möves".encode()), "INVALID_INPUT")
    add("oversize", "acceptance", accept + b"x" * (MAX_MESSAGE + 1 - len(accept)), "LIMIT_EXCEEDED")
    add("truncated-preamble", "acceptance", accept[:50], "INVALID_INPUT")
    add("body-version-2", "acceptance", replaced(b"acceptance/v1\n", b"acceptance/v2\n"), "UNSUPPORTED_VERSION")
    add("body-version-01", "acceptance", replaced(b"acceptance/v1\n", b"acceptance/v01\n"), "INVALID_INPUT")
    add("wallet-not-signer", "acceptance", offchain_v1([mallory.public], accept[50:]), "INVALID_INPUT")
    add("uppercase-hex", "acceptance", offchain_v1([seller.public], accept_text(termsHash=stmt["termsHash"].upper())),
        "INVALID_INPUT")
    add("non-canonical-base58", "acceptance", offchain_v1([seller.public], accept_text(wallet="1" + stmt["wallet"])),
        "INVALID_INPUT")
    for ident, value in (("leading-zero-not-after", "0" + stmt["notAfterSeconds"]), ("zero-not-after", "0"),
                         ("u64-overflow-not-after", str(2**64))):
        add(ident, "acceptance", offchain_v1([seller.public], accept_text(notAfterSeconds=value)), "INVALID_INPUT")
    add("unknown-role", "acceptance", offchain_v1([seller.public], accept_text(role="arbiter")), "INVALID_INPUT")
    add("double-space", "acceptance", replaced(b"role: seller", b"role:  seller"), "INVALID_INPUT")
    reordered = accept[:50] + "\n".join([ACCEPTANCE_DOMAIN, ACCEPTANCE_SENTENCE] + [
        f"{label}: {stmt[field]}" for label, field in [ACCEPTANCE_LINES[1], ACCEPTANCE_LINES[0]] + ACCEPTANCE_LINES[2:]
    ]).encode()
    add("reordered-lines", "acceptance", reordered, "INVALID_INPUT")
    add("wrong-sentence", "acceptance", replaced(b"It moves no funds.", b"It moves funds."), "INVALID_INPUT")
    add("invalid-messaging-key", "acceptance",
        offchain_v1([seller.public], accept_text(ownMessagingKey=invalid_x_only())), "INVALID_INPUT")
    add("same-messaging-keys", "acceptance",
        offchain_v1([seller.public], accept_text(counterpartyMessagingKey=keys["seller"])), "INVALID_INPUT")
    return vectors


def build_ledger(trades, positive, variants):
    proofs = {item["id"]: item for item in positive + variants}
    scenarios = [
        ("duplicate-is-idempotent", [("admit", "native-seller", NOW, "recorded"), ("admit", "native-seller", NOW + 1, "duplicate")]),
        ("conflicting-expiry", [("admit", "native-seller", NOW, "recorded"), ("admit", "native-seller-renewed", NOW, "CONFLICT")]),
        ("non-reciprocal-keys", [("admit", "native-seller", NOW, "recorded"),
                                 ("admit", "native-buyer-foreign-counterparty", NOW, "CONFLICT")]),
        ("both-roles", [("admit", "native-seller", NOW, "recorded"), ("admit", "native-buyer", NOW, "recorded"),
                        ("status", "native", NOW, {"tombstoned": False, "seller": True, "buyer": True})]),
        ("tombstone-before-acceptance", [("tombstone", "native", NOW, "ok"), ("admit", "native-seller", NOW, "CONFLICT"),
                                         ("tombstone", "native", NOW, "ok")]),
        ("tombstone-after-acceptance", [("admit", "native-seller", NOW, "recorded"), ("tombstone", "native", NOW, "ok"),
                                        ("admit", "native-seller", NOW, "CONFLICT"), ("admit", "native-buyer", NOW, "CONFLICT"),
                                        ("admit", "spl-seller", NOW, "recorded"),
                                        ("status", "native", NOW, {"tombstoned": True, "seller": False, "buyer": False})]),
        ("eviction-watermark", [("admit", "native-seller", NOW, "recorded"), ("status", "native", NOW + 600,
                                {"tombstoned": False, "seller": False, "buyer": False}),
                                ("admit", "native-seller", NOW, "EXPIRED")]),
        ("expired-tombstone-raises-watermark", [("tombstone", "native", NOW + 600, "ok"),
                                                ("admit", "native-seller", NOW, "EXPIRED")]),
        ("horizon", [("admit", "far-seller", NOW, "LIMIT_EXCEEDED"), ("tombstone", "far", NOW, "LIMIT_EXCEEDED"),
                     ("admit", "far-seller", NOW + 2, "recorded")]),
        ("last-second-then-expired", [("admit", "native-seller-last-second", NOW + 299, "recorded"),
                                      ("admit", "native-seller", NOW + 300, "EXPIRED")]),
    ]
    out = []
    for ident, steps in scenarios:
        rendered = [{"op": op, ("vector" if op == "admit" else "trade"): ref, "clockSeconds": str(clock), "expect": expect}
                    for op, ref, clock, expect in steps]
        replay(rendered, trades, proofs)
        out.append({"id": ident, "steps": rendered})
    return out


def replay(model_steps, trades, proofs):
    """Runs one scenario on a fresh model and asserts every expected result."""
    model = LedgerModel()
    for step in model_steps:
        clock = int(step["clockSeconds"])
        try:
            if step["op"] == "admit":
                item = proofs[step["vector"]]
                ctx = {k: v for k, v in item["context"].items() if k != "nowSeconds"}
                actual = model.admit(trades[item["trade"]], ctx, item["proof"], clock)
            elif step["op"] == "tombstone":
                actual = model.tombstone(trades[step["trade"]], clock)
            else:
                actual = model.status(trades[step["trade"]], clock)
        except Refused as refused:
            actual = refused.code
        assert actual == step["expect"], (step, actual)


def render(data) -> str:
    return json.dumps(data, indent=2, ensure_ascii=True) + "\n"


def check_versions():
    if sys.version_info[:2] != (3, 12) or cryptography.__version__ != "50.0.0":
        raise SystemExit("write the fixture with the pinned oracle: CPython 3.12 and cryptography 50.0.0")


def agave_cross_check(cli: str) -> int:
    """Optional, manual: the Agave CLI signs the statement text in its version-0 layout; the signature must equal
    the frozen `offchain-v0-agave-cli` negative, which the verifiers here refuse."""
    import subprocess
    import tempfile
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    seller = Wallet("seller")
    item = next(n for n in data["negative"] if n["id"] == "offchain-v0-agave-cli")
    with tempfile.TemporaryDirectory(prefix="p2p-agave-offchain-") as directory:
        keypair = pathlib.Path(directory) / "test-only-seller.json"
        keypair.write_text(json.dumps(list(seller.seed + seller.public)), encoding="utf-8")
        text = data["positive"][0]["acceptanceText"]
        signed = subprocess.run([cli, "sign-offchain-message", "-k", str(keypair), text], capture_output=True,
                                text=True, timeout=60, check=True).stdout.strip()
    n = 0
    for c in signed:
        n = n * 58 + B58.index(c)
    same = n.to_bytes(64, "big").hex() == item["proof"]["acceptanceSignatureHex"]
    print("agave CLI signature equals the frozen offchain-v0-agave-cli negative:", same)
    return 0 if same else 1


def main(argv):
    if len(argv) == 2 and argv[0] == "--agave-cli":
        return agave_cross_check(argv[1])
    if not (argv == ["--write"] or argv[:1] == ["--check"] and len(argv) <= 2):
        raise SystemExit("usage: acceptance.py --write | --check [FIXTURE] | --agave-cli PATH")
    # build() asserts every expected outcome with the verifier, decoder and ledger model above.
    text = render(build())
    if argv == ["--write"]:
        check_versions()
        FIXTURE.write_text(text, encoding="utf-8")
        print(f"wrote {FIXTURE.name} sha256={hashlib.sha256(text.encode()).hexdigest()}")
        return 0
    path = pathlib.Path(argv[1]) if len(argv) == 2 else FIXTURE
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    if current != text:
        print(f"{path.name} differs from the independent generator: regenerate with --write", file=sys.stderr)
        return 1
    print(f"{path.name} matches the independent generator sha256={hashlib.sha256(text.encode()).hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
