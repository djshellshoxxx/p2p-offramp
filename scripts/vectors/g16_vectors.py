"""Independent G16 reference encoder written from the specification text (not from the TypeScript source).

Produces packages/domain/test/fixtures/g16-vectors.json. Synthetic inputs only; no real order, key or account.
"""
import hashlib
import json
import pathlib
import sys

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode32(text: str) -> bytes:
    n = 0
    for ch in text:
        n = n * 58 + B58.index(ch)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    out = b"\x00" * (len(text) - len(text.lstrip("1"))) + body
    assert len(out) == 32, text
    return out


def b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    return "1" * (len(raw) - len(raw.lstrip(b"\x00"))) + out


def lp(data: bytes) -> bytes:
    return len(data).to_bytes(4, "big") + data


def caps(entries) -> bytes:
    out = bytes([len(entries)])
    for e in entries:
        out += lp(e["id"].encode()) + lp(e["version"].encode()) + lp(e["policyHash"].encode())
    return out


def private_agreement(a) -> bytes:
    return (b"p2p-offramp/private-agreement/v1\x00" + bytes([1]) + lp(a["orderId"].encode())
            + int(a["revision"]).to_bytes(8, "big") + lp(a["fiatCurrency"].encode())
            + int(a["fiatMinorUnits"]).to_bytes(16, "big") + bytes([a["fiatScale"]])
            + lp(a["paymentInstructions"].encode("utf-8")) + caps(a["capabilities"]) + bytes.fromhex(a["agreementSalt"]))


def solana(t) -> bytes:
    native = t["assetKind"] == "native"
    zero = b"\x00" * 32
    return (b"p2p-offramp/solana/basic/v1\x00" + b58decode32(t["genesisHash"]) + b58decode32(t["programId"])
            + bytes.fromhex(t["orderId"]) + b58decode32(t["seller"]) + b58decode32(t["buyer"])
            + (zero if native else b58decode32(t["mint"])) + (zero if native else b58decode32(t["tokenProgram"]))
            + bytes.fromhex(t["privateAgreementHash"]) + bytes.fromhex(t["capabilitiesHash"]) + bytes.fromhex(t["sellerNonce"])
            + bytes([1]) + int(t["revision"]).to_bytes(8, "little") + bytes([0 if native else 2])
            + int(t["amountBaseUnits"]).to_bytes(8, "little") + int(t["acceptBeforeSeconds"]).to_bytes(8, "little")
            + int(t["escrowExpirySeconds"]).to_bytes(8, "little") + bytes([0]))


def key(seed: int) -> str:
    return b58encode(hashlib.sha256(b"g16-synthetic-key-" + bytes([seed])).digest())


def build():
    hx = lambda label: hashlib.sha256(label.encode()).hexdigest()
    agreements = [
        {"v": 1, "orderId": hx("order-1"), "revision": "1", "fiatCurrency": "EUR", "fiatMinorUnits": "12345",
         "fiatScale": 2, "paymentInstructions": "", "capabilities": [], "agreementSalt": hx("salt-1")},
        {"v": 1, "orderId": hx("order-2"), "revision": "18446744073709551615", "fiatCurrency": "JPY",
         "fiatMinorUnits": "340282366920938463463374607431768211455", "fiatScale": 0,
         "paymentInstructions": "Bank été — réf. \U0001F4B6 #42",
         "capabilities": [{"id": "a.cap", "version": "1", "policyHash": hx("pa")}, {"id": "b-cap", "version": "2.0.1", "policyHash": hx("pb")}],
         "agreementSalt": hx("salt-2")},
    ]
    vectors = {"generator": "scripts/vectors/g16_vectors.py", "privateAgreements": [], "solanaTerms": []}
    for a in agreements:
        enc = private_agreement(a)
        vectors["privateAgreements"].append({"input": a, "bytesHex": enc.hex(), "privateAgreementHash": hashlib.sha256(enc).hexdigest(),
                                             "capabilitiesHash": hashlib.sha256(caps(a["capabilities"])).hexdigest()})
    base = {"genesisHash": key(1), "programId": key(2), "orderId": agreements[0]["orderId"], "seller": key(3), "buyer": key(4),
            "privateAgreementHash": vectors["privateAgreements"][0]["privateAgreementHash"],
            "capabilitiesHash": vectors["privateAgreements"][0]["capabilitiesHash"], "sellerNonce": hx("nonce-1"),
            "revision": "1", "amountBaseUnits": "1000000", "acceptBeforeSeconds": "1700000000", "escrowExpirySeconds": "1700086400"}
    for extra in ({"assetKind": "native", "mint": None, "tokenProgram": None},
                  {"assetKind": "spl", "mint": key(5), "tokenProgram": key(6), "amountBaseUnits": "18446744073709551615"}):
        t = {**base, **extra}
        enc = solana(t)
        vectors["solanaTerms"].append({"input": t, "bytesHex": enc.hex(), "termsHash": hashlib.sha256(enc).hexdigest()})
    return vectors


FIXTURE = pathlib.Path(__file__).resolve().parents[2] / "packages/domain/test/fixtures/g16-vectors.json"

if __name__ == "__main__":
    text = json.dumps(build(), indent=1, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        sys.exit(0 if FIXTURE.read_text(encoding="utf-8") == text else 1)
    FIXTURE.write_text(text, encoding="utf-8")
