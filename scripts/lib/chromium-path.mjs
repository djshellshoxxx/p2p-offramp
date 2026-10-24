import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const bundledRoot = '/opt/pw-browsers';

/**
 * Resolve the Chromium executable for the browser fixtures. Order: P2P_CHROMIUM, the system
 * package path, then the newest bundled Playwright Chromium. Undefined lets playwright-core choose.
 */
export function resolveChromiumPath(env = process.env) {
  if (env.P2P_CHROMIUM) return env.P2P_CHROMIUM;
  if (existsSync('/usr/bin/chromium')) return '/usr/bin/chromium';
  let builds;
  try {
    builds = readdirSync(bundledRoot)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)));
  } catch {
    return undefined;
  }
  for (const build of builds) {
    let dirs;
    try {
      dirs = readdirSync(join(bundledRoot, build)).filter((name) => name.startsWith('chrome-linux'));
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const candidate = join(bundledRoot, build, dir, 'chrome');
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}
