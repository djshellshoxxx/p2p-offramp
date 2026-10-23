# Local test tools

The native Node/Python tests remain dependency-free at runtime. Strict TypeScript 7.0.2 and
`playwright-core` 1.64.1 are exact development-only pins in the lockfile. Playwright is Apache-2.0
([upstream license](https://github.com/microsoft/playwright/blob/v1.64.1/LICENSE)); no Playwright
code is included in a production artifact. TypeScript retains its upstream Apache-2.0 license.
Installed packages retain their license files. No browser download/install hook is enabled.

`npm run test:browser` compiles the storage dependency graph into a temporary directory, starts
a loopback-only static server and uses an already installed Chromium at `/usr/bin/chromium`
(override with `P2P_CHROMIUM`). It checks actual IndexedDB transactions across two tabs and
blocks external egress. It does not certify a UI, real wallet, mobile device or independent audit.
