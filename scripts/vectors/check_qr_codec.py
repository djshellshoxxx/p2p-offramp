"""Independent D6 QR codec oracle (stdlib only). Written from RFC 9285, RFC 8785 and the accepted D6 decision text,
not translated from packages/qr. It re-derives every frozen vector in packages/qr/test/fixtures/vectors.json:

- RFC 9285 base45 encode/strict decode (the RFC's own examples are hard-coded here and must appear in the file);
- RFC 8785 canonical JSON for the envelope value domain (UTF-16 key order, ES string escaping, safe integers);
- the envelope v1 checks in D6 order, the payload hash, the trade-invite signing digest and the test-only verifier;
- every rejection vector's refusal code, and the local replay refusal.

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


def secret_value(value):
    words = value.split()
    return any([
        re.search(r"(^|[^0-9A-Za-z])wc:", value, re.I), "symkey=" in value.lower(), re.search(r"nsec1", value, re.I),
        re.search(r"[xyztuv]prv[1-9A-HJ-NP-Za-km-z]{20}", value), "PRIVATE KEY-----" in value,
        re.search(r"eyJ[\w-]+\.[\w-]+\.", value), re.match(r"\s*bearer\s+\S", value, re.I),
        re.search(r"(token|secret|password|apikey|api_key|sessionid)\s*[=:]", value, re.I),
        re.search(r"0x[0-9a-fA-F]{64}(?![0-9a-fA-F])", value),
        len(words) >= 12 and all(word.isascii() and word.isalpha() and word.islower() for word in words),
        re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{50,}", value) and not HEX.fullmatch(value),
    ])


def url_value(value):
    return bool(re.match(r"[A-Za-z][A-Za-z0-9+.-]*:", value)) or "://" in value or value.startswith("//") or value.lower().startswith("www.")


def scan(value, top):
    if isinstance(value, dict):
        for key, item in value.items():
            if any(word in re.sub(r"[^a-z0-9]", "", key.lower()) for word in SECRET_WORDS) or secret_value(key):
                raise Refused("SECRET_REFUSED")
            if isinstance(item, str):
                if secret_value(item):
                    raise Refused("SECRET_REFUSED")
                if not (top and key == "chain") and url_value(item):
                    raise Refused("URL_REFUSED")
            else:
                scan(item, False)
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                if secret_value(item):
                    raise Refused("SECRET_REFUSED")
                if url_value(item):
                    raise Refused("URL_REFUSED")
            else:
                scan(item, False)


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
              and isinstance(payload["releaseId"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", payload["releaseId"]) is not None
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
    scan(env, True)
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
    sig = env.get("signature")
    if sig is not None and context.get("verifierProfile") == sig["profile"]:
        expected = hmac.new(test_profile["key"], signing_digest(env), hashlib.sha256).hexdigest()
        if sig["publicKey"] != test_profile["publicKey"] or not hmac.compare_digest(sig["value"], expected):
            raise Refused("SIGNATURE_INVALID")
        authenticated = True
    return env, authenticated


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
    test_profile = {"key": hashlib.sha256(b"qr-test-only-hmac-key").digest(), "publicKey": hashlib.sha256(b"qr-test-only-key-id").hexdigest()}
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
