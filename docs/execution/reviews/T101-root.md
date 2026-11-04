# T101 hosted YAML definition repair

GitHub rejected d8c Vault41508745535 and Specs41508743599 with failure and no jobs. Root independently reproduced PyYAML ScannerError at the unquoted `:all: ` token, then used literal block scalars in both existing run steps. All3 workflows parse. Inverting only block syntax reproduces exact prior bytes; decoded commands/argv and isolated/hash/binary flags remain unchanged. The distinct review also rejects duplicate keys and preserves `on`.

[Current review](T101-final.md) and [root/hosted snapshot](T101-root.json) retain failure and exact sources. No skip, actionpin, permission, dependency, gate, product code or1713 package input changed. Earlier D8 documentation acceptance remains its historical scope; this is a narrow later CI/configuration correction. Actual new-head hosted job creation/results remain live in PR26.
