import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staticBuildPlugin } from './scripts/static-build-plugin.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  if (!['production', 'meta', 'header', 'development', 'demo', 'testnet'].includes(mode)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  const delivery = mode === 'header' ? 'header' : 'meta';
  return {
    root, base: './', envPrefix: [], publicDir: false,
    // Only the explicit `demo` mode includes the synthetic local registry and samples; only `testnet` includes the
    // Sepolia registry source. The testnet trust bundle itself is injected by apps/web/scripts/build.mjs after it has
    // verified it (a bare `vite build --mode testnet` embeds null and the registry fails closed). Neither mode changes a
    // runtime permission: ReleaseEnabled stays 0 and connectOrigins stays empty in every mode.
    define: { __P2P_SYNTHETIC_DEMO__: JSON.stringify(mode === 'demo'), __P2P_TESTNET__: JSON.stringify(mode === 'testnet'), __P2P_TESTNET_TRUST__: 'null' },
    plugins: [react(), staticBuildPlugin(repositoryRoot, delivery)],
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, modulePreload: false,
      target: 'es2023', reportCompressedSize: false, license: { fileName: 'third-party-licenses.json' } },
    worker: { format: 'es', plugins: () => [staticBuildPlugin(repositoryRoot, delivery, true)] },
    server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
  };
});
