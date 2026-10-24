import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staticBuildPlugin } from './scripts/static-build-plugin.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  if (!['production', 'meta', 'header', 'development'].includes(mode)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  const delivery = mode === 'header' ? 'header' : 'meta';
  return {
    root, base: './', envPrefix: [], publicDir: false,
    plugins: [react(), staticBuildPlugin(repositoryRoot, delivery)],
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, modulePreload: false,
      target: 'es2023', reportCompressedSize: false, license: { fileName: 'third-party-licenses.json' } },
    worker: { format: 'es', plugins: () => [staticBuildPlugin(repositoryRoot, delivery, true)] },
    server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
  };
});
