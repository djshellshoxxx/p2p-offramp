"""Independent D6 QR codec oracle (stdlib only). Written from RFC 9285, RFC 8785 and the accepted D6 decision text,
not translated from packages/qr. It re-derives every frozen vector in packages/qr/test/fixtures/vectors.json:

- RFC 9285 base45 encode/strict decode (the RFC's own examples are hard-coded here and must appear in the file);
- RFC 8785 canonical JSON for the envelope value domain (UTF-16 key order, ES string escaping, safe integers);
- the envelope v1 checks in D6 order, the payload hash, the trade-invite signing digest and the test-only verifier;
- every rejection vector's refusal code, and the local replay refusal.

Independence is not uniform. base45, RFC 8785, the hashes, the signing digest and the QR symbol reader are separate
implementations written from the standards. The secret/URL heuristics, the signature-requirement rules and the replay
simulation restate the same policy as packages/qr (the policy is a project decision, not a standard), so agreement there
shows the two sides apply one consistent rule set; it does not independently prove the rules are sufficient. The replay
check here is a single seen-set; it does not model the TS ledger's capacity, eviction or retention behaviour, which only
the TS tests cover.

Usage: python3 -I scripts/vectors/check_qr_codec.py [--vectors PATH]. Exit status 0 only if every check agrees.
"""
import hashlib
import hmac
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_VECTORS = ROOT / "packages/qr/test/fixtures/vectors.json"

# --- RFC 9285 ------------------------------------------------------------------------------------------------------
B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
RFC9285_EXAMPLES = [(b"AB", "BB8"), (b"Hello!!", "%69 VD92EX0"), (b"base-45", "UJCLQE7W581"), (b"ietf!", "QED8WEX0")]


class Refused(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def b45encode(data: bytes) -> str:
    out = []
    for i in range(0, len(data) - 1, 2):
        e, rest = divmod(data[i] * 256 + data[i + 1], 45 * 45)
        d, c = divmod(rest, 45)
        out += [B45[c], B45[d], B45[e]]
    if len(data) % 2:
        d, c = divmod(data[-1], 45)
        out += [B45[c], B45[d]]
    return "".join(out)


def b45decode(text: str) -> bytes:
    if len(text) % 3 == 1:
        raise Refused("INVALID_ENCODING")
    values = []
    for ch in text:
        position = B45.find(ch)
        if position < 0:
            raise Refused("INVALID_ENCODING")
        values.append(position)
    out = bytearray()
    for i in range(0, len(values), 3):
        chunk = values[i:i + 3]
        n = sum(v * 45 ** k for k, v in enumerate(chunk))
        if len(chunk) == 3:
            if n > 0xFFFF:
                raise Refused("INVALID_ENCODING")
            out += n.to_bytes(2, "big")
        else:
            if n > 0xFF:
                raise Refused("INVALID_ENCODING")
            out.append(n)
    return bytes(out)


# --- RFC 8785 for the envelope value domain ------------------------------------------------------------------------
SAFE = 2 ** 53 - 1


def _pairs(pairs):
    keys = [key for key, _ in pairs]
    if len(set(keys)) != len(keys):
        raise Refused("DUPLICATE_KEY")
    return dict(pairs)


def _int(literal):
    if literal == "-0":
        raise Refused("UNSUPPORTED_NUMBER")
    value = int(literal)
    if abs(value) > SAFE:
        raise Refused("UNSUPPORTED_NUMBER")
    return value


def _float(_literal):
    raise Refused("UNSUPPORTED_NUMBER")


def _constant(_literal):
    raise Refused("INVALID_JSON")


def _depth_and_unicode(value, depth, max_depth):
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            raise Refused("INVALID_UNICODE")
        return
    if isinstance(value, (list, dict)):
        if depth + 1 > max_depth:
            raise Refused("DEPTH_EXCEEDED")
        items = value.items() if isinstance(value, dict) else enumerate(value)
        for key, item in items:
            if isinstance(key, str):
                _depth_and_unicode(key, depth, max_depth)
            _depth_and_unicode(item, depth + 1, max_depth)


def strict_json(text: str, max_depth: int):
    try:
        value = json.loads(text, object_pairs_hook=_pairs, parse_int=_int, parse_float=_float, parse_constant=_constant)
    except Refused:
        raise
    except (ValueError, RecursionError):
        raise Refused("INVALID_JSON")
    _depth_and_unicode(value, 0, max_depth)
    return value


def quote(text: str) -> str:
    short = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r"}
    out = ['"']
    for ch in text:
        code = ord(ch)
        if 0xD800 <= code <= 0xDFFF:
            raise Refused("INVALID_UNICODE")
        if ch in short:
            out.append(short[ch])
        elif code < 0x20:
            out.append("\\u%04x" % code)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def jcs(value) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        if abs(value) > SAFE:
            raise Refused("UNSUPPORTED_NUMBER")
        return str(value)
    if isinstance(value, str):
        return quote(value)
    if isinstance(value, list):
        return "[" + ",".join(jcs(item) for item in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda key: key.encode("utf-16-be", "surrogatepass"))
        return "{" + ",".join(quote(key) + ":" + jcs(value[key]) for key in keys) + "}"
    raise Refused("UNSUPPORTED_VALUE")


def jcs_bytes(value) -> bytes:
    return jcs(value).encode("utf-8")


# --- Envelope v1 (D6 Option B) -------------------------------------------------------------------------------------
PREFIX, FAMILY, PROTOCOL = "P2POFFRAMP:1:", "P2POFFRAMP:", "p2p-offramp-qr"
MAX_BYTES, MAX_DEPTH, MARGIN, SKEW, MAX_INVITE = 2048, 8, 60, 120, 86400
MAX_TEXT = len(PREFIX) + (MAX_BYTES // 2) * 3
DOMAIN = b"p2p-offramp-qr/v1/trade-invite/signing-digest"
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
ENVELOPE_KEYS = {"protocol", "v", "type", "requestId", "createdAt", "expiresAt", "chain", "originHint", "payload", "payloadSha256"}
PAYLOAD_KEYS = {
    "public-address": {"address"},
    "trade-invite": {"ad", "termsHash"},
    "payment-request": {"recipient", "asset", "amount"},
    "release-fingerprint": {"channel", "releaseId", "sequence", "manifestSha256"},
    "recovery-fingerprint": {"format", "byteLength", "sha256"},
}
CHAIN_BOUND = {"public-address", "trade-invite", "payment-request"}
RECOVERY_FORMATS = {"p2p-offramp-backup/v1": 12 * 1024 * 1024, "p2p-offramp/offline-recovery-references/v1": 128 * 1024}
SECRET_WORDS = ("seed", "mnemonic", "private", "secret", "nsec", "password", "passphrase", "token", "auth", "session",
                "bearer", "cookie", "credential", "xprv", "wif", "keystore", "entropy", "apikey", "symkey", "walletconnect")
HEX = re.compile(r"[0-9a-f]+")


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def b58_bytes(text):
    n = 0
    for ch in text:
        if ch not in B58:
            return None
        n = n * 58 + B58.index(ch)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\x00" * (len(text) - len(text.lstrip("1"))) + body


def is_chain(value):
    if not isinstance(value, str):
        return False
    if re.fullmatch(r"evm:[1-9][0-9]{0,19}", value):
        return True
    return bool(re.fullmatch(r"solana:[1-9A-HJ-NP-Za-km-z]{32,44}", value)) and len(b58_bytes(value[7:]) or b"") == 32


def is_account(chain, value):
    if not isinstance(value, str):
        return False
    if chain.startswith("evm:"):
        return bool(re.fullmatch(r"0x[0-9a-f]{40}", value)) and value != "0x" + "0" * 40
    raw = b58_bytes(value) if re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", value) else None
    return raw is not None and len(raw) == 32 and any(raw)


SEPARATORS = re.compile(r"[\s,;:|/._-]+")
URL_EXEMPT_SLOTS = {"chain", "originHint"}
TEXT_SLOTS = {"originHint", "payload.channel", "payload.releaseId"}


def mnemonic_like(value):
    words = [word for word in SEPARATORS.split(value) if word]
    return len(words) >= 12 and all(re.fullmatch(r"[A-Za-z]{3,8}", word) for word in words)


def secret_value(value):
    return any([
        re.search(r"(^|[^0-9A-Za-z])wc:", value, re.I), "symkey=" in value.lower(), re.search(r"nsec1[0-9a-z]{50}", value, re.I),
        re.search(r"[xyztuv]prv[1-9A-HJ-NP-Za-km-z]{100}", value), "PRIVATE KEY-----" in value,
        re.search(r"eyJ[\w-]+\.[\w-]+\.", value), re.match(r"\s*bearer\s+\S", value, re.I),
        re.search(r"(token|secret|password|apikey|api_key|sessionid)\s*[=:]", value, re.I),
        re.search(r"0x[0-9a-fA-F]{64}(?![0-9a-fA-F])", value),
        mnemonic_like(value),
        re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{50,}", value) and not HEX.fullmatch(value),
    ])


def url_value(value):
    return bool(re.match(r"[A-Za-z][A-Za-z0-9+.-]*:", value)) or "://" in value or value.startswith("//") or value.lower().startswith("www.")


def secret_text(value):
    """Text slots: separators removed, then 16+ hex bytes or 50+ base58/bech32 characters count as key material."""
    compact = SEPARATORS.sub("", value)
    return (secret_value(value) or secret_value(compact) or re.search(r"[0-9a-fA-F]{32}", compact) is not None
            or re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{50,}", compact) is not None or re.fullmatch(r"[02-9ac-hj-np-z]{50,}", compact, re.I) is not None)


def scan(value, path):
    if isinstance(value, dict):
        for key, item in value.items():
            if any(word in re.sub(r"[^a-z0-9]", "", key.lower()) for word in SECRET_WORDS) or secret_value(key):
                raise Refused("SECRET_REFUSED")
            scan(item, f"{path}.{key}" if path else key)
    elif isinstance(value, list):
        for item in value:
            scan(item, path + "[]")
    elif isinstance(value, str):
        if secret_text(value) if path in TEXT_SLOTS else secret_value(value):
            raise Refused("SECRET_REFUSED")
        if path not in URL_EXEMPT_SLOTS and url_value(value):
            raise Refused("URL_REFUSED")


def check_payload(kind, chain, payload):
    if not isinstance(payload, dict):
        raise Refused("INVALID_PAYLOAD")
    if set(payload) - PAYLOAD_KEYS[kind]:
        raise Refused("FIELD_UNSUPPORTED")
    if PAYLOAD_KEYS[kind] - set(payload):
        raise Refused("INVALID_PAYLOAD")
    ok = True
    if kind == "public-address":
        ok = is_account(chain, payload["address"])
    elif kind == "payment-request":
        limit = 2 ** 256 - 1 if chain.startswith("evm:") else 2 ** 64 - 1
        amount = payload["amount"]
        ok = (is_account(chain, payload["recipient"]) and (payload["asset"] == "native" or is_account(chain, payload["asset"]))
              and isinstance(amount, str) and re.fullmatch(r"[1-9][0-9]{0,77}", amount) is not None and int(amount) <= limit)
    elif kind == "trade-invite":
        ok = (isinstance(payload["ad"], str) and re.fullmatch(r"30078:[0-9a-f]{64}:p2p-offramp:v1:[0-9a-f]{64}", payload["ad"]) is not None
              and isinstance(payload["termsHash"], str) and re.fullmatch(r"[0-9a-f]{64}", payload["termsHash"]) is not None)
    elif kind == "release-fingerprint":
        ok = (isinstance(payload["channel"], str) and re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", payload["channel"]) is not None
              and isinstance(payload["releaseId"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,39}", payload["releaseId"]) is not None
              and is_int(payload["sequence"]) and payload["sequence"] >= 1
              and isinstance(payload["manifestSha256"], str) and re.fullmatch(r"[0-9a-f]{64}", payload["manifestSha256"]) is not None)
    elif kind == "recovery-fingerprint":
        fmt = payload["format"]
        ok = (fmt in RECOVERY_FORMATS and is_int(payload["byteLength"]) and 1 <= payload["byteLength"] <= RECOVERY_FORMATS[fmt]
              and isinstance(payload["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", payload["sha256"]) is not None)
    if not ok:
        raise Refused("INVALID_PAYLOAD")


def is_host(value):
    return isinstance(value, str) and 1 <= len(value) <= 253 and all(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in value.split("."))


def check_envelope(env):
    if not isinstance(env, dict):
        raise Refused("INVALID_ENVELOPE")
    scan(env, "")
    if env.get("protocol") != PROTOCOL:
        raise Refused("PROTOCOL_UNSUPPORTED")
    if not (is_int(env.get("v")) and env.get("v") == 1):
        raise Refused("VERSION_UNSUPPORTED")
    kind = env.get("type")
    if kind not in PAYLOAD_KEYS:
        raise Refused("TYPE_UNSUPPORTED")
    if set(env) - ENVELOPE_KEYS - {"signature"}:
        raise Refused("FIELD_UNSUPPORTED")
    if ENVELOPE_KEYS - set(env):
        raise Refused("INVALID_ENVELOPE")
    created, expires = env["createdAt"], env["expiresAt"]
    in_range = lambda t: is_int(t) and 1 <= t <= 253402300799
    if not (isinstance(env["requestId"], str) and re.fullmatch(r"[0-9a-f]{32}", env["requestId"])):
        raise Refused("INVALID_ENVELOPE")
    if not in_range(created) or (expires is not None and (not in_range(expires) or expires <= created)):
        raise Refused("INVALID_ENVELOPE")
    if (not is_chain(env["chain"])) if kind in CHAIN_BOUND else env["chain"] is not None:
        raise Refused("INVALID_ENVELOPE")
    if env["originHint"] is not None and not is_host(env["originHint"]):
        raise Refused("INVALID_ENVELOPE")
    if not (isinstance(env["payloadSha256"], str) and re.fullmatch(r"[0-9a-f]{64}", env["payloadSha256"])):
        raise Refused("INVALID_ENVELOPE")
    check_payload(kind, env["chain"], env["payload"])
    if "signature" in env:
        if kind != "trade-invite":
            raise Refused("SIGNATURE_UNSUPPORTED")
        sig = env["signature"]
        if not (isinstance(sig, dict) and set(sig) == {"profile", "publicKey", "value"}
                and isinstance(sig["profile"], str) and re.fullmatch(r"[a-z0-9][a-z0-9.-]{0,63}", sig["profile"])
                and all(isinstance(sig[k], str) and re.fullmatch(r"(?:[0-9a-f]{2})+", sig[k]) for k in ("publicKey", "value"))
                and len(sig["publicKey"]) <= 256 and len(sig["value"]) <= 2048):
            raise Refused("INVALID_ENVELOPE")
    if kind == "trade-invite":
        if expires is None:
            raise Refused("INVALID_ENVELOPE")
        if expires - created > MAX_INVITE:
            raise Refused("LIFETIME_EXCEEDED")
    return kind


def signing_digest(env) -> bytes:
    unsigned = {key: value for key, value in env.items() if key != "signature"}
    return hashlib.sha256(DOMAIN + b"\x00" + jcs_bytes(unsigned)).digest()


def decode(text, context, test_profile):
    """Returns (envelope, authenticated) or raises Refused with the D6 refusal code."""
    if len(text) > MAX_TEXT:
        raise Refused("QR_TOO_LARGE")
    if not text.startswith(PREFIX):
        if text.startswith(FAMILY):
            raise Refused("VERSION_UNSUPPORTED")
        if text.lower().startswith("wc:"):
            raise Refused("WALLET_SESSION_REFUSED")
        if secret_value(text):
            raise Refused("SECRET_REFUSED")
        if url_value(text):
            raise Refused("URL_REFUSED")
        raise Refused("FORMAT_UNSUPPORTED")
    raw = b45decode(text[len(PREFIX):])
    if len(raw) > MAX_BYTES:
        raise Refused("QR_TOO_LARGE")
    try:
        decoded = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise Refused("INVALID_UNICODE")
    try:
        env = strict_json(decoded, MAX_DEPTH)
    except Refused as refused:
        raise Refused("INVALID_UNICODE" if refused.code == "INVALID_UNICODE" else "INVALID_JSON")
    if jcs(env) != decoded:
        raise Refused("NON_CANONICAL")
    check_envelope(env)
    if env["chain"] is not None:
        if env["chain"] not in context["chains"]:
            raise Refused("CHAIN_UNSUPPORTED")
        if context.get("expectedChain") and env["chain"] != context["expectedChain"]:
            raise Refused("CHAIN_MISMATCH")
    if hashlib.sha256(jcs_bytes(env["payload"])).hexdigest() != env["payloadSha256"]:
        raise Refused("HASH_MISMATCH")
    now = context["now"]
    if env["createdAt"] > now + SKEW:
        raise Refused("NOT_YET_VALID")
    if env["expiresAt"] is not None and now + MARGIN >= env["expiresAt"]:
        raise Refused("EXPIRED")
    authenticated = False
    sig, verifier = env.get("signature"), context.get("verifierProfile")
    require = verifier is not None and context.get("requireInviteSignature", True)
    if env["type"] == "trade-invite":
        if sig is None:
            if require:
                raise Refused("SIGNATURE_REQUIRED")
        elif verifier is not None and sig["profile"] != verifier:
            if require:
                raise Refused("PROFILE_UNSUPPORTED")
        elif verifier is not None:
            if len(sig["publicKey"]) != 2 * test_profile["publicKeyBytes"] or len(sig["value"]) != 2 * test_profile["signatureBytes"]:
                raise Refused("SIGNATURE_INVALID")
            expected = hmac.new(test_profile["key"], signing_digest(env), hashlib.sha256).hexdigest()
            author = env["payload"]["ad"].split(":")[1]
            if (sig["publicKey"] != test_profile["publicKey"] or not hmac.compare_digest(sig["value"], expected)
                    or author != test_profile["boundAuthor"]):
                raise Refused("SIGNATURE_INVALID")
            authenticated = True
    return env, authenticated


# --- ISO/IEC 18004 symbol reader ------------------------------------------------------------------------------------
# A reader, not an encoder: it locates the reserved regions, reads and checks both format-information copies and the
# version information, unmasks, walks the codeword zigzag, de-interleaves blocks, requires every Reed-Solomon syndrome
# to be zero, then parses the single segment and its padding. It never consults the TS encoder's helpers.
LEVELS = "LMQH"
LEVEL_BITS = {"L": 0b01, "M": 0b00, "Q": 0b11, "H": 0b10}
# ISO/IEC 18004 Table 9, per level: (ECC codewords per block, number of blocks) for versions 1..40.
ECC_PER_BLOCK = {
    "L": [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    "M": [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    "Q": [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    "H": [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
}
BLOCKS = {
    "L": [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    "M": [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    "Q": [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    "H": [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
}
GF_EXP, GF_LOG = [0] * 512, [0] * 256
_x = 1
for _i in range(255):
    GF_EXP[_i], GF_LOG[_x] = _x, _i
    _x = (_x << 1) ^ (0x11D if _x & 0x80 else 0)
for _i in range(255, 512):
    GF_EXP[_i] = GF_EXP[_i - 255]


def gf_mul(a, b):
    return 0 if a == 0 or b == 0 else GF_EXP[GF_LOG[a] + GF_LOG[b]]


def rs_ecc(data, degree):
    """Systematic RS parity: remainder of data(x)*x^degree mod prod_{i<degree}(x - a^i), by polynomial long division."""
    generator = [1]
    for i in range(degree):
        generator = [a ^ gf_mul(b, GF_EXP[i]) for a, b in zip(generator + [0], [0] + generator)]
    work = list(data) + [0] * degree
    for i in range(len(data)):
        coefficient = work[i]
        if coefficient:
            for j, g in enumerate(generator):
                work[i + j] ^= gf_mul(g, coefficient)
    return bytes(work[len(data):])


def syndromes_zero(block, degree):
    for j in range(degree):
        value = 0
        for c in block:
            value = gf_mul(value, GF_EXP[j]) ^ c
        if value:
            return False
    return True


def bch(data, data_bits, generator, generator_degree):
    value = data << generator_degree
    for shift in range(data_bits + generator_degree - 1, generator_degree - 1, -1):
        if (value >> shift) & 1:
            value ^= generator << (shift - generator_degree)
    return (data << generator_degree) | value


def format_word(level, mask):
    return bch((LEVEL_BITS[level] << 3) | mask, 5, 0x537, 10) ^ 0x5412


def version_word(version):
    return bch(version, 6, 0x1F25, 12)


def alignment_centres(version):
    if version == 1:
        return []
    size, count = 17 + 4 * version, version // 7 + 2
    step = 26 if version == 32 else -(-(size - 13) // (2 * (count - 1))) * 2
    return [6] + [size - 7 - step * k for k in range(count - 2, -1, -1)]


def reserved_map(version):
    size = 17 + 4 * version
    reserved = [[False] * size for _ in range(size)]

    def box(x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                reserved[y][x] = True
    box(0, 0, 8, 8)
    box(size - 8, 0, size - 1, 8)
    box(0, size - 8, 8, size - 1)
    for i in range(size):
        reserved[6][i] = reserved[i][6] = True
    centres = alignment_centres(version)
    in_finder = lambda x, y: (x <= 8 and y <= 8) or (x >= size - 8 and y <= 8) or (x <= 8 and y >= size - 8)
    for cy in centres:
        for cx in centres:
            if not in_finder(cx, cy):
                box(cx - 2, cy - 2, cx + 2, cy + 2)
    if version >= 7:
        box(size - 11, 0, size - 9, 5)
        box(0, size - 11, 5, size - 9)
    return reserved


RAW_CODEWORDS = {}


def data_codewords(version, level):
    """Counts the free modules of the reserved map itself, so the capacity does not rely on a closed formula."""
    if version not in RAW_CODEWORDS:
        RAW_CODEWORDS[version] = sum(not cell for row in reserved_map(version) for cell in row) // 8
    raw = RAW_CODEWORDS[version]
    return raw - ECC_PER_BLOCK[level][version - 1] * BLOCKS[level][version - 1], raw


def count_bits(mode, version):
    if mode == "alphanumeric":
        return 9 if version <= 9 else 11 if version <= 26 else 13
    return 8 if version <= 9 else 16


def capacity(version, level, mode):
    available = data_codewords(version, level)[0] * 8 - 4 - count_bits(mode, version)
    count = available // 11 * 2 + (1 if available % 11 >= 6 else 0) if mode == "alphanumeric" else available // 8
    return min(count, 2 ** count_bits(mode, version) - 1)


MASK_RULES = [
    lambda i, j: (i + j) % 2 == 0, lambda i, j: i % 2 == 0, lambda i, j: j % 3 == 0, lambda i, j: (i + j) % 3 == 0,
    lambda i, j: (i // 2 + j // 3) % 2 == 0, lambda i, j: (i * j) % 2 + (i * j) % 3 == 0,
    lambda i, j: ((i * j) % 2 + (i * j) % 3) % 2 == 0, lambda i, j: ((i * j) % 3 + (i + j) % 2) % 2 == 0,
]


def read_symbol(rows):
    """Returns (level, mask, version, mode, text) or raises AssertionError."""
    size = len(rows)
    assert all(len(row) == size for row in rows) and (size - 17) % 4 == 0
    version = (size - 17) // 4
    dark = [[c == "1" for c in row] for row in rows]
    first = [(8, i) for i in range(6)] + [(8, 7), (8, 8), (7, 8)] + [(14 - i, 8) for i in range(9, 15)]
    second = [(size - 1 - i, 8) for i in range(8)] + [(8, size - 15 + i) for i in range(8, 15)]
    words = [sum(dark[y][x] << i for i, (x, y) in enumerate(spots)) for spots in (first, second)]
    assert words[0] == words[1], "format copies differ"
    matches = [(level, mask) for level in LEVELS for mask in range(8) if format_word(level, mask) == words[0]]
    assert len(matches) == 1, "format information is not a valid codeword"
    level, mask = matches[0]
    assert dark[size - 8][8], "dark module missing"
    if version >= 7:
        for transpose in (False, True):
            word = 0
            for i in range(18):
                a, b = size - 11 + i % 3, i // 3
                word |= dark[a if transpose else b][b if transpose else a] << i
            assert word == version_word(version), "version information mismatch"
    reserved, bits = reserved_map(version), []
    column, upward = size - 1, True
    while column > 0:
        if column == 6:
            column -= 1
        for y in (range(size - 1, -1, -1) if upward else range(size)):
            for x in (column, column - 1):
                if not reserved[y][x]:
                    bits.append(dark[y][x] ^ MASK_RULES[mask](y, x))
        upward, column = not upward, column - 2
    dc, raw = data_codewords(version, level)
    assert len(bits) // 8 == raw and not any(bits[raw * 8:]), "remainder bits"
    codewords = [int("".join(map(str, map(int, bits[k:k + 8]))), 2) for k in range(0, raw * 8, 8)]
    ecc, blocks = ECC_PER_BLOCK[level][version - 1], BLOCKS[level][version - 1]
    long_blocks = raw % blocks
    lengths = [raw // blocks - ecc + (1 if b >= blocks - long_blocks else 0) for b in range(blocks)]
    data_parts, at = [[] for _ in range(blocks)], 0
    for k in range(max(lengths)):
        for b in range(blocks):
            if k < lengths[b]:
                data_parts[b].append(codewords[at])
                at += 1
    ecc_parts = [[] for _ in range(blocks)]
    for _ in range(ecc):
        for b in range(blocks):
            ecc_parts[b].append(codewords[at])
            at += 1
    for b in range(blocks):
        assert syndromes_zero(data_parts[b] + ecc_parts[b], ecc), f"RS block {b} fails"
    stream = "".join(f"{c:08b}" for part in data_parts for c in part)
    assert len(stream) == dc * 8
    mode_bits, pos = stream[:4], 4
    mode = {"0010": "alphanumeric", "0100": "byte"}[mode_bits]
    width = count_bits(mode, version)
    count, pos = int(stream[pos:pos + width], 2), pos + width
    if mode == "alphanumeric":
        chars = []
        for _ in range(count // 2):
            value, pos = int(stream[pos:pos + 11], 2), pos + 11
            chars += [B45[value // 45], B45[value % 45]]
        if count % 2:
            chars.append(B45[int(stream[pos:pos + 6], 2)])
            pos += 6
        text = "".join(chars)
    else:
        text = bytes(int(stream[pos + 8 * k:pos + 8 * k + 8], 2) for k in range(count)).decode("utf-8")
        pos += 8 * count
    terminator = min(4, len(stream) - pos)
    assert stream[pos:pos + terminator] == "0" * terminator
    pos += terminator
    pad_to = -(-pos // 8) * 8
    assert stream[pos:pad_to] == "0" * (pad_to - pos)
    pads = [int(stream[k:k + 8], 2) for k in range(pad_to, len(stream), 8)]
    assert pads == [(0xEC, 0x11)[k % 2] for k in range(len(pads))], "pad codewords"
    return level, mask, version, mode, text


def check_symbols(section, expect, count):
    for name, data, published in (("iso-18004-annex-i-1M", [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17], [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]),
                                  ("hello-world-1Q", [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236], [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16])):
        expect(rs_ecc(data, len(published)) == bytes(published), f"oracle RS disagrees with published {name}")
        recorded = next((v for v in section["reedSolomon"] if v["name"] == name), None)
        expect(recorded is not None and recorded["dataHex"] == bytes(data).hex() and recorded["eccHex"] == bytes(published).hex(), f"RS vector {name}")
        count("rs-known-answer")
    for v in section["formatInformation"]:
        expect(format_word(v["ecLevel"], v["mask"]) == v["bits"], f"format {v['ecLevel']}{v['mask']}")
        count("format-information")
    for v in section["versionInformation"]:
        expect(version_word(v["version"]) == v["bits"], f"version information {v['version']}")
        count("version-information")
    published = {(40, "L"): (4296, 2953), (40, "M"): (3391, 2331), (40, "Q"): (2420, 1663), (40, "H"): (1852, 1273), (38, "M"): (None, 2099)}
    for v in section["capacities"]:
        mine = (capacity(v["version"], v["ecLevel"], "alphanumeric"), capacity(v["version"], v["ecLevel"], "byte"))
        expect(mine == (v["alphanumeric"], v["byte"]), f"capacity {v['version']}{v['ecLevel']}")
        known = published.get((v["version"], v["ecLevel"]))
        if known:
            expect(known[0] in (None, mine[0]) and known[1] == mine[1], f"capacity {v['version']}{v['ecLevel']} differs from D6/research figure")
        count("capacity")
    for v in section["matrices"]:
        rows = []
        for hex_row in v["rowsHex"]:
            rows.append("".join(f"{int(digit, 16):04b}" for digit in hex_row)[:v["size"]])
        expect(hashlib.sha256("\n".join(rows).encode()).hexdigest() == v["rowsSha256"], f"matrix {v['name']} rows digest")
        try:
            decoded = read_symbol(rows)
        except (AssertionError, KeyError, ValueError, IndexError) as error:
            expect(False, f"matrix {v['name']} unreadable: {error}")
            continue
        expect(decoded == (v["ecLevel"], v["mask"], v["version"], v["mode"], v["text"]), f"matrix {v['name']} decoded {decoded[:4]}")
        count("symbol")


# --- Driver --------------------------------------------------------------------------------------------------------
def main(argv):
    path = pathlib.Path(argv[argv.index("--vectors") + 1]) if "--vectors" in argv else DEFAULT_VECTORS
    failures, counts = [], {}

    def expect(condition, message):
        if not condition:
            failures.append(message)

    def count(name):
        counts[name] = counts.get(name, 0) + 1

    body = path.read_bytes()
    sidecar = pathlib.Path(str(path) + ".sha256")
    if sidecar.exists():
        expect(sidecar.read_text().split()[0] == hashlib.sha256(body).hexdigest(), "sidecar SHA-256 does not match vectors.json")
        count("file-sha256")
    document = json.loads(body.decode("utf-8"))
    meta, vectors = document["meta"], document["vectors"]
    expect(hashlib.sha256(jcs_bytes(vectors)).hexdigest() == meta["contentSha256"], "meta.contentSha256 does not match RFC 8785 bytes of vectors")
    codec = meta["codec"]
    expect((codec["prefix"], codec["protocol"], codec["maxEnvelopeBytes"], codec["maxDepth"], codec["inviteSigningDomain"].encode())
           == (PREFIX, PROTOCOL, MAX_BYTES, MAX_DEPTH, DOMAIN), "codec parameters differ from D6 values used by the oracle")
    test_profile = {"key": hashlib.sha256(b"qr-test-only-hmac-key").digest(), "publicKey": hashlib.sha256(b"qr-test-only-key-id").hexdigest(),
                    "boundAuthor": hashlib.sha256(b"qr-seller").hexdigest(), "publicKeyBytes": 32, "signatureBytes": 32}
    recorded = meta["testOnlyInviteProfile"]
    expect((recorded["boundAuthor"], recorded["publicKeyBytes"], recorded["signatureBytes"])
           == (test_profile["boundAuthor"], 32, 32), "test profile binding or sizes differ")
    expect(meta["testOnlyInviteProfile"]["publicKey"] == test_profile["publicKey"], "test profile public key differs")

    present = {(v["inputHex"], v["base45"]) for v in vectors["base45"]}
    for data, encoded in RFC9285_EXAMPLES:
        expect(b45encode(data) == encoded and b45decode(encoded) == data, f"oracle disagrees with RFC 9285 example {encoded!r}")
        expect((data.hex(), encoded) in present, f"RFC 9285 example {encoded!r} missing from vectors")
        count("rfc9285-example")
    for v in vectors["base45"]:
        data = bytes.fromhex(v["inputHex"])
        expect(b45encode(data) == v["base45"] and b45decode(v["base45"]) == data, f"base45 {v['name']}")
        count("base45")
    for v in vectors["base45Invalid"]:
        try:
            b45decode(v["text"])
            failures.append(f"base45Invalid {v['name']} decoded")
        except Refused:
            pass
        count("base45-invalid")
    for v in vectors["jcs"]:
        canonical = jcs(strict_json(v["inputJson"], 32))
        expect(canonical == v["canonical"] and canonical.encode("utf-8").hex() == v["canonicalHex"], f"jcs {v['name']}")
        count("jcs")
    for v in vectors["jcsInvalid"]:
        try:
            jcs(strict_json(v["inputJson"], v["maxDepth"]))
            failures.append(f"jcsInvalid {v['name']} accepted")
        except Refused as refused:
            expect(refused.code == v["expectedCode"], f"jcsInvalid {v['name']}: {refused.code} != {v['expectedCode']}")
        count("jcs-invalid")
    for v in vectors["utf8Invalid"]:
        try:
            bytes.fromhex(v["inputHex"]).decode("utf-8")
            failures.append(f"utf8Invalid {v['name']} decoded")
        except UnicodeDecodeError:
            pass
        count("utf8-invalid")
    for v in vectors["envelopes"]:
        try:
            env, authenticated = decode(v["text"], v["context"], test_profile)
        except Refused as refused:
            failures.append(f"envelope {v['name']} refused: {refused.code}")
            continue
        raw = jcs_bytes(env)
        expect(v["text"] == PREFIX + b45encode(raw), f"envelope {v['name']} text")
        expect(jcs(env) == v["canonical"] and len(raw) == v["envelopeBytes"], f"envelope {v['name']} canonical bytes")
        expect(jcs(env["payload"]) == v["payloadCanonical"] and hashlib.sha256(jcs_bytes(env["payload"])).hexdigest() == v["payloadSha256"], f"envelope {v['name']} payload hash")
        expect(authenticated == v["authenticated"], f"envelope {v['name']} authenticated")
        expect((len(raw) <= 1024) == v["withinGenerationTarget"], f"envelope {v['name']} generation target")
        if "signingDigestHex" in v:
            expect(signing_digest(env).hex() == v["signingDigestHex"], f"envelope {v['name']} signing digest")
        count("envelope")
    expect(any(v["envelopeBytes"] == MAX_BYTES for v in vectors["envelopes"]), "no envelope at exactly the 2,048-byte cap")
    for v in vectors["rejections"]:
        try:
            decode(v["text"], v["context"], test_profile)
            failures.append(f"rejection {v['name']} accepted")
        except Refused as refused:
            expect(refused.code == v["expectedCode"], f"rejection {v['name']}: oracle {refused.code} != {v['expectedCode']}")
        count("rejection")
    for v in vectors["replays"]:
        seen, codes = set(), []
        for _ in v["expectedCodes"]:
            env, _auth = decode(v["text"], v["context"], test_profile)
            codes.append("REPLAYED" if env["requestId"] in seen else None)
            seen.add(env["requestId"])
        expect(codes == v["expectedCodes"], f"replay {v['name']}: {codes}")
        count("replay")
    if "qrSymbol" in vectors:
        check_symbols(vectors["qrSymbol"], expect, count)
    expect(vectors.get("qrSymbol", {}).get("defaultEcLevel") == "M", "D6 default error correction is M")

    if failures:
        for message in failures:
            print(f"FAIL: {message}", file=sys.stderr)
        print(f"{len(failures)} disagreement(s) with {path}", file=sys.stderr)
        return 1
    summary = ", ".join(f"{n} {name}" for name, n in sorted(counts.items()))
    print(f"PASS: independent Python {sys.version.split()[0]} oracle agrees with {path.name} ({summary}); generator {meta['generator']} on {meta['generatorRuntime']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
