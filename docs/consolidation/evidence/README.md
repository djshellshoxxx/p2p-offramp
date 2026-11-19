# Retained verification evidence

[raw-logs.zip](raw-logs.zip) preserves every original evidence byte. Viewable `.log` files normalize only trailing whitespace and extra terminal blank lines; test output and results are otherwise unchanged. [index.json](index.json) records both raw and presentation SHA-256 values and source scope. ZIP entry dates are fixed for reproducibility, not test timestamps.

Tests overlap; do not sum them as unique tests. [TEST-RESULTS.md](../TEST-RESULTS.md) explains outcomes and limits.

| File | Source / tree | Outcome | Presentation SHA-256 |
| --- | --- | --- | --- |
| [main-boundaries.log](main-boundaries.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `f5d18d613c51d33533dfa56ed680f8bfa9e9e38c5b9b423ac398564b95beee3b` |
| [main-build-policy.log](main-build-policy.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `895d4ad275cf34787e85b8d867defb356d20a506d43ceee3c27452c8ed89b5fb` |
| [main-default-build.log](main-default-build.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `605558d443c9557ccf08fcaeff0b33a4fec8965d81c16a115681d29a87a661de` |
| [main-default-retained-inventory.json](main-default-retained-inventory.json) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `db32d51bc074fc712281340aac3b35428f3e9464364e1ddf36196a6856b41bdc` |
| [main-default-verify.log](main-default-verify.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `274e34175a6b94cc0dbc0127c91fe6602dce4534a3b2110cda7b2afe0342eb0a` |
| [main-demo-build.log](main-demo-build.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `7c37d7b3e65ce31c7fd55e4eb56b590e29626780331a86055442e39497cbd6af` |
| [main-demo-retained-inventory.json](main-demo-retained-inventory.json) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `480a7892fa229e92f6c00e2c36659e71ed648a3f7b82d72d73daacbe65140ba3` |
| [main-demo-verify.log](main-demo-verify.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `a33f7909a69a41b5c35f90fe428bca92f58a6b735f5f3e392945355fc92dc468` |
| [main-foundry.log](main-foundry.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `e7703cf0f324b26e34a8f932b81e84b55da6fcc406a8f20ddb836dbf45b7923e` |
| [main-localnet-build.log](main-localnet-build.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | EXPECTED_REFUSAL | `51e1473c624798ed2f4be48deeafcf946b888d901352878d5260ca20c2a7717e` |
| [main-npm-audit-production.json](main-npm-audit-production.json) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `0b8abff8b84fbc0fded24cdbf77d0ae8177f1327db050d2622b7773a360c97e3` |
| [main-npm-audit.json](main-npm-audit.json) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `0b8abff8b84fbc0fded24cdbf77d0ae8177f1327db050d2622b7773a360c97e3` |
| [main-package-tests.log](main-package-tests.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `30960c53e3ec2b275c6f277a2ada006d13b7594e43835fb0cc9ea8a7762a1197` |
| [main-spec-inventory.log](main-spec-inventory.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `702f17b0b0d5d137efd0cb99c4b0c9592e628045d20a12638e2d50e8cd7dc66a` |
| [main-spec-tests.log](main-spec-tests.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `fb72a4fa6e33159592acf98333ae5682200e176fbdcec3f3dc712d156afaaa3c` |
| [main-typecheck.log](main-typecheck.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `a550ff26e5b128d5107b02fa16d34523af27e99e388c4cdbe322940fa5de93c3` |
| [core-focused-review.log](core-focused-review.log) | `9bc9aa83d740891a01522b7398f5fd3e4049b3e8` | PASS | `8362fc0495a12a807184b83a15be7770a208f760abe4d97c7926f9ac75d4027d` |
| [tooling154-focused-tests.log](tooling154-focused-tests.log) | `aba8ca0843dcf24e2a80adfa2c8d38e0574a4a2c` | PASS | `28a24cf416f2e54b102f5fb2cb8e7a56ebc7514f5c2be9860a456459ad4999e5` |
| [tooling154-claims-red.log](tooling154-claims-red.log) | `before bounds repair on #154 integration` | EXPECTED_RED | `9b9c52fdb30aee12ca87632f12f052a0af8d36d1ea3485c67ed63a0f16ea33be` |
| [tooling154-focused-red.log](tooling154-focused-red.log) | `initial #154 current-main fixture integration` | FAIL_REPAIRED | `1193a51df2738ae632cf4b969ac6d7e179f1ebccc19725217baca3e990fe46e9` |
| [erc20-browser-extension-local.log](erc20-browser-extension-local.log) | `#173 original extension` | BLOCKED | `171a8646823dd4a6d3e73aded6489ad7fcb6d68fc1bcd13c999953d2ee058e7d` |
| [erc20-cold-forge-build.log](erc20-cold-forge-build.log) | `#173 isolated pinned compiler fixture` | PASS | `c563a4f6e0bbe8346d1e45e17d945f46880131d3bd88d2364cb1b5df9bdf53e7` |
| [browser-parent-typecheck.log](browser-parent-typecheck.log) | `3f90594849cca2ba1a34d76f66d77cf45c7bc124` | PASS | `a550ff26e5b128d5107b02fa16d34523af27e99e388c4cdbe322940fa5de93c3` |
| [browser-parent-regressions.log](browser-parent-regressions.log) | `3f90594849cca2ba1a34d76f66d77cf45c7bc124` | PASS | `c2a29164ace5d2c8a6d4a41912628a51460e94ad5e22a0fde0ffcd2722a0b1d7` |
| [browser-parent-controller.log](browser-parent-controller.log) | `3f90594849cca2ba1a34d76f66d77cf45c7bc124` | FAIL | `3da6491ed92d1a9b3d5c988da8036a06d4bf8abeba5f1d4859c30d1e3a6a5155` |
| [browser-parent-controller-retry.log](browser-parent-controller-retry.log) | `3f90594849cca2ba1a34d76f66d77cf45c7bc124` | PASS | `46e2707f87383c786c0c5d4ec3afa208da838351907bfd5c8ad87aab8c73d0d5` |
| [tooling154-typecheck.log](tooling154-typecheck.log) | `5284fb94e13b3f0fdd4c146d45ac445f35c00783` | PASS | `a550ff26e5b128d5107b02fa16d34523af27e99e388c4cdbe322940fa5de93c3` |
| [tooling154-current-docs.log](tooling154-current-docs.log) | `5284fb94e13b3f0fdd4c146d45ac445f35c00783` | PASS | `f94bba211ba856692222af3ad208374089d05c0b09b9179629ba8edeadbcd3ed` |
| [main-erc20-native.log](main-erc20-native.log) | `91ee6991d4527bba0e76b048a76e65ed7693c5a1` | PASS | `c0d0557cc64bd0c5c8f8f6eb53ae1ea65e920c576787b7941a84e25ddb0ebeb7` |
| [main-after138-spec-check.log](main-after138-spec-check.log) | `80375193f16082c582a1faf2c6ba598f9eca532a` | PASS | `2cf32f195ca4fb478a4387e1998b6948d74ba38dfa9770e75658bb01c6410f10` |
| [resumption-affected-regression.log](resumption-affected-regression.log) | `local 81de237; published ba90ad4; identical tree bc0b0700495b8001d409cc7ec0ef8152e2744a77` | PASS | `9f7742fc1253f2d8ba504dc5f84894c1eb3e902c4c2b7533da6146491ca92ca6` |
| [resumption-exchange-wallet.log](resumption-exchange-wallet.log) | `local 81de237; published ba90ad4; identical tree bc0b0700495b8001d409cc7ec0ef8152e2744a77` | PASS | `ac24e13705b16ddb663e51f5b5408789b1e75a5dc097f52ae8a2c1de5813e85d` |
| [resumption-typecheck.log](resumption-typecheck.log) | `local 81de237; published ba90ad4; identical tree bc0b0700495b8001d409cc7ec0ef8152e2744a77` | PASS | `a550ff26e5b128d5107b02fa16d34523af27e99e388c4cdbe322940fa5de93c3` |
| [resumption-build-default.log](resumption-build-default.log) | `local 81de237; published ba90ad4; identical tree bc0b0700495b8001d409cc7ec0ef8152e2744a77` | PASS | `2af1e774151eb7f9a584e62cb6e3f432e1dd9f0da8150975b0a526fa2d3b53ac` |
| [resumption-build-localnet.log](resumption-build-localnet.log) | `local 81de237; published ba90ad4; identical tree bc0b0700495b8001d409cc7ec0ef8152e2744a77` | PASS | `30a5b658006258e74e44ebe5a702fb41f26c831a70f861cb16d4374892e80e7e` |
| [resumption-controller-red.log](resumption-controller-red.log) | `test-only local 81815a2; published 1d2f25a; parent 91ee6991d4527bba0e76b048a76e65ed7693c5a1` | EXPECTED_RED | `53f166bb6f8897bcf342fe2e7bf240958ec9e269bcc0c980019c9e8ff20e3562` |
| [resumption-build-localnet-input-failure.log](resumption-build-localnet-input-failure.log) | `local 81de237; published ba90ad4; identical tree bc0b0700495b8001d409cc7ec0ef8152e2744a77` | EXPECTED_REFUSAL | `ff69db032378aa97b3bb05e5c08e660b65d0e9aeef9e2a50900cf1d7cf0d67db` |

Local logs contain synthetic fixture evidence. Hosted native/browser results are linked in the result report and inventory; local Chromium refusal is not promoted to a pass. The fresh independent Solana 277-test run was observed in a tool session; no separate portable log was retained and no earlier log is relabelled.
