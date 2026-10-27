# Code reuse record

Only code copied or adapted from outside this repository is listed. npm dependencies are pinned in
`package-lock.json` and recorded in `security/DEPENDENCY_EVIDENCE.md` and `security/crypto-inventory.json`.

| Upstream | Revision | Reused files | Into | Licence / permission | Adaptations |
|---|---|---|---|---|---|
| [djshellshoxxx/GhostPay](https://github.com/djshellshoxxx/GhostPay) | `edb0051eb89bd135c73733d9db14569aa000662d` | `packages/address-safety/src/text.ts` (`sanitizeDisplayText`), test cases from `text.test.ts` | `apps/web/src/ui/trade/display-text.ts`, `apps/web/test/display-text.test.mjs` | Upstream `package.json` says `UNLICENSED` (no public licence). Reused because both repositories have the same owner (djshellshoxxx), who directed reuse across their repositories. Do not relicense or redistribute this file separately without that owner's permission. | G16 requires displays to use the exact agreed text, so normalization (NFC) and inline mixed-script markers were removed; mixed script is reported as a flag. LF is allowed for multi-line payment instructions. The ZWJ/emoji allowance was dropped. Test runner changed from Vitest to `node:test`. |

No other external source was copied in this change. Checked and not reused: GhostPay `tx-review` and
`ux-*` packages (they target GhostPay invoice/payment flows, not G16 trade terms) and the GhostPay web app
(different state model and dependencies such as viem, which this client does not bundle).
