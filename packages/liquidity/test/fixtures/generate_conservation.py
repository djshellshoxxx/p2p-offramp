"""Independent integer conservation oracle. Public local fixtures; no native/signature profile."""
import hashlib
import json
from pathlib import Path
from random import Random

MAKER = "0x" + "11" * 20
TAKER = "0x" + "22" * 20
FIELDS = ["deposited", "available", "reserved", "inEscrow", "withdrawn", "releasedToBuyers"]


def quote(identifier, principal, now):
    digest = "0x" + hashlib.sha256(("local-fixture:" + identifier).encode()).hexdigest()
    return dict(quoteId=identifier, maker=MAKER, taker=TAKER,
                binding=dict(chain="evm", networkId="local-evm", deploymentId="local-basic", tradeId=digest),
                termsHash=digest, assetId="native", principal=str(principal), fee="0",
                nonce="nonce-" + identifier, expiresAtSeconds=str(now + 120))


def scenario(seed, count):
    rng, now, vault, serial = Random(seed), 100, 0, 0
    ledger = {field: 0 for field in FIELDS}
    entries, rows = {}, []
    for index in range(count):
        reserved = [key for key, value in entries.items() if value["state"] == "reserved"]
        spendable = [key for key in reserved if now < int(entries[key]["quote"]["expiresAtSeconds"])]
        consumed = [key for key, value in entries.items() if value["state"] == "consumed"]
        actions = ["deposit", "donation"]
        if ledger["available"]:
            actions += ["reserve", "withdraw"]
        if reserved:
            actions += ["cancel", "expire"]
        if spendable:
            actions += ["consume"]
        if consumed:
            actions += ["refund", "release"]
        action = "deposit" if index == 0 else rng.choice(actions)
        if action == "deposit":
            amount = rng.randint(1, 100)
            command = dict(kind=action, actor=MAKER, amount=str(amount), received=str(amount))
            ledger["deposited"] += amount
            ledger["available"] += amount
            vault += amount
        elif action == "donation":
            amount = rng.randint(1, 50)
            command = dict(kind=action, amount=str(amount))
            vault += amount
        elif action == "withdraw":
            amount = rng.randint(1, ledger["available"])
            command = dict(kind=action, actor=MAKER, amount=str(amount), outcome="applied")
            ledger["available"] -= amount
            ledger["withdrawn"] += amount
            vault -= amount
        elif action == "reserve":
            amount, serial = rng.randint(1, ledger["available"]), serial + 1
            value = quote(f"s{seed}-q{serial}", amount, now)
            command = dict(kind=action, actor=TAKER, quote=value, outcome="applied")
            entries[value["quoteId"]] = dict(state="reserved", amount=amount, quote=value)
            ledger["available"] -= amount
            ledger["reserved"] += amount
        else:
            identifier = rng.choice(spendable if action == "consume" else consumed if action in ["refund", "release"] else reserved)
            entry = entries[identifier]
            amount = entry["amount"]
            if action in ["cancel", "expire"]:
                if action == "expire":
                    now = max(now, int(entry["quote"]["expiresAtSeconds"]))
                command = dict(kind=action, quoteId=identifier)
                if action == "cancel":
                    command["actor"] = MAKER
                ledger["reserved"] -= amount
                ledger["available"] += amount
                entry["state"] = "cancelled" if action == "cancel" else "expired"
            elif action == "consume":
                command = dict(kind=action, actor=TAKER, quoteId=identifier, termsHash=entry["quote"]["termsHash"], amount=str(amount), outcome="applied")
                ledger["reserved"] -= amount
                ledger["inEscrow"] += amount
                vault -= amount
                entry["state"] = "consumed"
            elif action == "refund":
                command = dict(kind=action, quoteId=identifier, returned=str(amount))
                ledger["inEscrow"] -= amount
                ledger["available"] += amount
                vault += amount
                entry["state"] = "refunded"
            else:
                command = dict(kind=action, quoteId=identifier)
                ledger["inEscrow"] -= amount
                ledger["releasedToBuyers"] += amount
                entry["state"] = "released"
        assert ledger["deposited"] == sum(ledger[key] for key in FIELDS[1:])
        assert vault >= ledger["available"] + ledger["reserved"]
        rows.append(dict(at=str(now), command=command,
                         expected=dict(ledger={key: str(value) for key, value in ledger.items()}, custody=str(vault),
                                       surplus=str(vault - ledger["available"] - ledger["reserved"]))))
    return dict(seed=seed, rows=rows)


if __name__ == "__main__":
    data = dict(format="local-liquidity-python-conservation-v1", authority=False,
                scenarios=[scenario(seed, 40) for seed in [11, 37, 101, 20261102]])
    Path(__file__).with_name("conservation-python-v1.json").write_text(json.dumps(data, indent=2) + "\n")
