import { transformWithOxc } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function load(url, context, next) {
  if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context);
  const path = fileURLToPath(url);
  const out = await transformWithOxc(await readFile(path, 'utf8'), path, { lang: 'tsx', jsx: { runtime: 'automatic' } });
  return { format: 'module', source: out.code, shortCircuit: true };
}
