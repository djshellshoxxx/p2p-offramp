import { fileURLToPath } from 'node:url';
import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staticBuildPlugin } from './scripts/static-build-plugin.mjs';
import { sourceLocalePlugin } from './scripts/source-locale.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
/**
 * Library-only localnet input, produced by apps/web/scripts/build.mjs after apps/web/src/localnet/config.ts validated it:
 * `document` is the frozen config JSON embedded as `__P2P_LOCALNET_CONFIG__`; `relayOrigin` is the only CSP connect-src.
 */
export interface LocalnetViteInput { readonly document: unknown; readonly relayOrigin: string }
/**
 * Only the explicit `demo` mode includes the synthetic local registry and samples; only `testnet` includes the
 * Sepolia registry source. The testnet trust bundle itself is injected by apps/web/scripts/build.mjs after it has
 * verified it (a bare `vite build --mode testnet` embeds null and the registry fails closed). Neither mode changes a
 * runtime permission: ReleaseEnabled stays 0 and connectOrigins stays empty in every mode.
 * `localnet` exists only with an explicit `localnet` input from buildWeb (a bare `vite build --mode localnet` throws);
 * its single connect origin is the injected loopback relay, and ReleaseEnabled stays 0.
 */
export function createViteConfig(mode: string, localnet: LocalnetViteInput | null = null): UserConfig {
  if (!['production', 'meta', 'header', 'development', 'demo', 'testnet', 'localnet'].includes(mode)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  if (mode === 'localnet' && localnet === null) throw new Error('LOCALNET_CONFIG_REQUIRED');
  if (mode !== 'localnet' && localnet !== null) throw new Error('LOCALNET_PROFILE_ONLY');
  const delivery = mode === 'header' ? 'header' : 'meta';
  const profile = localnet ? { relayOrigin: localnet.relayOrigin } : null;
  return {
    root, base: './', envPrefix: [], publicDir: false,
    define: { __P2P_SYNTHETIC_DEMO__: JSON.stringify(mode === 'demo'), __P2P_TESTNET__: JSON.stringify(mode === 'testnet'), __P2P_TESTNET_TRUST__: 'null', __P2P_TESTNET_LOCAL_PROOF_KEY_ID__: 'null',
      __P2P_LOCALNET__: JSON.stringify(localnet !== null), __P2P_LOCALNET_CONFIG__: localnet ? JSON.stringify(localnet.document) : 'null' },
    plugins: [react(), sourceLocalePlugin(), staticBuildPlugin(repositoryRoot, delivery, false, profile)],
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, modulePreload: false,
      target: 'es2023', reportCompressedSize: false, license: { fileName: 'third-party-licenses.json' } },
    worker: { format: 'es', plugins: () => [staticBuildPlugin(repositoryRoot, delivery, true, profile)] },
    server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
  };
}
export default defineConfig(({ mode }) => createViteConfig(mode));
