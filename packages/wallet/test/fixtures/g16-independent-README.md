# G16 cross-implementation vectors

`g16-independent.json` freezes native and ERC-20 domain separators, TradeTerms struct hashes, EIP-712 digests and both parties' signatures produced by ethers 6.15.0 `TypedDataEncoder` and `Wallet`. The generator reads scenario data, never production digest helpers. Production verification uses noble 2.4.0; ethers uses its own encoding and noble 1.x dependencies. This checks agreement between implementations, not independence of all underlying cryptographic ancestry.

Inputs come from `packages/domain/test/fixtures/local-evm-scenario/scenario.json`, including explicitly public synthetic test keys. Never fund these accounts. This is not independent security review, approved trust material, deployed-contract interoperability, or release approval.

Reproduce from repository root, choosing any isolated directory as the prefix and generator argument:

```sh
npm install --cache /workspace/work/npm-cache --prefix /workspace/work/g16 --ignore-scripts ethers@6.15.0
node packages/wallet/test/fixtures/g16-independent-generate.mjs /workspace/work/g16
node packages/wallet/test/g16-independent.test.mjs
```

Generator checks the installed ethers version. Registry source: `https://registry.npmjs.org/ethers/-/ethers-6.15.0.tgz`, MIT license. npm package integrity observed on installation:

```
sha512-Kf/3ZW54L4UT0pZtsY/rf+EkBU7Qi5nnhonjUb8yTXcxH3cdcWrV2cRyk0Xk/4jK6OoHhxxZHriyhje20If2hQ==
```

Frozen JSON SHA-256: `121c358fabe9a4468ff4c1dc2f28fb7fbc8a41f8eba24badf79dda3854f02ab6`.
The generator's dependency installation stays outside the repository dependency graph. Ordinary tests consume only the frozen JSON.
