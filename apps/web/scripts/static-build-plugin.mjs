import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildLocalnetContentPolicy, buildSolanaLocalnetContentPolicy, buildOfflineContentPolicy } from '../../../packages/security/src/content-policy.ts';
import { inspectApplicationSource, inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';

const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function offlinePolicy(delivery) {
  return buildOfflineContentPolicy({ version: 1, releaseId: 'local-development', delivery });
}
/** Localnet build profile only: the offline policy with connect-src naming exactly the injected loopback relay origin. */
export function localnetPolicy(delivery, relayOrigin) {
  return buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery, relayOrigin });
}
export function policyMarkup(policy) {
  return policy.meta.map(record => 'httpEquiv' in record
    ? `<meta http-equiv="${record.httpEquiv}" content="${escapeAttribute(record.content)}">`
    : `<meta name="${record.name}" content="${record.content}">`).join('\n    ');
}
/**
 * Module admission (A3). The localnet profile is the ONLY profile with exceptions: the reviewed EVM wallet modules,
 * chain-evm, relay (its WebSocket( token only in packages/relay/src/pool.ts), exchange, the three localnet facades, the
 * apps/web/src/localnet subtree and the @noble/{curves,hashes,ciphers} dependencies. Every other profile keeps the prior
 * rules and additionally refuses each localnet-only module, so a default/demo/testnet build that reached one fails.
 */
const LOCALNET_WALLET_MODULES = /^packages\/wallet\/src\/evm-(?:adapter|terms|submit|escrow|payment-preflight|peer-acceptance|peer-envelope|peer-replay|peer-verifier|peer-port)\.ts$/;
const LOCALNET_ONLY_MODULES = [LOCALNET_WALLET_MODULES, /^packages\/(?:wallet|domain|chain-evm)\/localnet\.ts$/, /^packages\/(?:chain-evm|relay|exchange)\//, /^apps\/web\/src\/localnet\//];
const LOCALNET_DEPENDENCIES = /^node_modules\/@noble\/(?:curves|hashes|ciphers)\//;
export const LOCALNET_WEBSOCKET_MODULE = 'packages/relay/src/pool.ts';
/** Throws NON_CORE_MODULE / UNREVIEWED_DEPENDENCY for a repository-relative module path the profile does not admit. */
export function assertModuleAdmitted(path, localnet = false, solanaLocalnet = false) {
  if (localnet && solanaLocalnet) throw new Error('LOCALNET_PROFILE_EXCLUSIVE');
  if (solanaLocalnet) {
    if (path.startsWith('../') || /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)/.test(path) ||
        /(?:^|\/)packages\/(?:extensions|chain-evm|relay|exchange|wallet)(?:\/|$)|(?:^|\/)(?:05_ADVANCED|06_)/i.test(path) ||
        /^apps\/web\/src\/localnet\//.test(path)) throw new Error('NON_CORE_MODULE');
    if (/(?:^|\/)packages\/chain-solana\//.test(path) && !/^packages\/chain-solana\//.test(path)) throw new Error('NON_CORE_MODULE');
    if (/^packages\/[^/]+\/localnet\.ts$/.test(path) && path !== 'packages/chain-solana/localnet.ts') throw new Error('NON_CORE_MODULE');
    if (path.startsWith('node_modules/') && !/^node_modules\/(?:react|react-dom|scheduler)\//.test(path) && !LOCALNET_DEPENDENCIES.test(path)) throw new Error(`UNREVIEWED_DEPENDENCY: ${path}`);
    return;
  }
  if (/^apps\/web\/src\/solana-localnet\//.test(path)) throw new Error('NON_CORE_MODULE');
  if (localnet) {
    if (/^packages\/wallet\/src\/evm-/.test(path) && !LOCALNET_WALLET_MODULES.test(path)) throw new Error('NON_CORE_MODULE');
    // chain-evm and relay are admitted only at their own top-level package roots, never as nested look-alike paths.
    const evmOrRelay = /(?:^|\/)packages\/(?:chain-evm|relay)(?:\/|$)/.test(path) && !/^packages\/(?:chain-evm|relay)\//.test(path);
    if (path.startsWith('../') || /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)/.test(path) || evmOrRelay || /(?:^|\/)packages\/(?:extensions|chain-solana)(?:\/|$)|(?:^|\/)(?:05_ADVANCED|06_)/i.test(path)) throw new Error('NON_CORE_MODULE');
    if (/^packages\/[^/]+\/localnet\.ts$/.test(path) && !LOCALNET_ONLY_MODULES[1].test(path)) throw new Error('NON_CORE_MODULE');
    if (path.startsWith('node_modules/') && !/^node_modules\/(?:react|react-dom|scheduler)\//.test(path) && !LOCALNET_DEPENDENCIES.test(path)) throw new Error(`UNREVIEWED_DEPENDENCY: ${path}`);
    return;
  }
  if (LOCALNET_ONLY_MODULES.some(pattern => pattern.test(path))) throw new Error('NON_CORE_MODULE');
  if (/^packages\/wallet\/src\/evm-(?:execution|adapter|terms)\.ts$/.test(path)) throw new Error('NON_CORE_MODULE');
  if (path.startsWith('../') || /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)/.test(path) || /(?:^|\/)packages\/(?:extensions|chain-evm|chain-solana|relay)(?:\/|$)|(?:^|\/)(?:05_ADVANCED|06_)/i.test(path)) throw new Error('NON_CORE_MODULE');
  if (path.startsWith('node_modules/') && !/^node_modules\/(?:react|react-dom|scheduler)\//.test(path)) throw new Error(`UNREVIEWED_DEPENDENCY: ${path}`);
}
function localnetProfile(localnet) {
  if (localnet === null || localnet === undefined) return null;
  if (typeof localnet !== 'object' || Object.getPrototypeOf(localnet) !== Object.prototype || Object.keys(localnet).join() !== 'relayOrigin') throw new Error('LOCALNET_PROFILE_INVALID');
  return Object.freeze({ relayOrigin: localnet.relayOrigin });
}
/**
 * Runs for document and native Worker builds; records real bundler module graphs. `localnet` ({ relayOrigin }) is set
 * only by the library-only localnet build (apps/web/vite.config.ts createViteConfig); every other build omits it.
 */
export function staticBuildPlugin(repositoryRoot, delivery = 'meta', worker = false, localnet = null, solanaLocalnet = null) {
  const profile = localnetProfile(localnet);
  if (profile && solanaLocalnet) throw new Error('LOCALNET_PROFILE_EXCLUSIVE');
  if (solanaLocalnet !== null && (typeof solanaLocalnet !== 'object' || Object.getPrototypeOf(solanaLocalnet) !== Object.prototype || Object.keys(solanaLocalnet).join() !== 'rpcOrigin')) throw new Error('SOLANA_LOCALNET_PROFILE_INVALID');
  const solanaPolicy = level => buildSolanaLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: level, rpcOrigin: solanaLocalnet.rpcOrigin });
  const policy = solanaLocalnet ? solanaPolicy(delivery) : profile ? localnetPolicy(delivery, profile.relayOrigin) : offlinePolicy(delivery);
  return {
    name: `p2p-offline-static-${worker ? 'worker' : 'document'}`,
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!html.includes('<!-- OFFLINE_CONTENT_POLICY -->')) throw new Error('POLICY_PLACEHOLDER_MISSING');
        const protectedHtml = html.replace('<!-- OFFLINE_CONTENT_POLICY -->', policyMarkup(policy));
        if (delivery === 'meta' && protectedHtml.indexOf('http-equiv="Content-Security-Policy"') > protectedHtml.search(/<(?:script|link|img)\b/i)) throw new Error('POLICY_ORDER');
        return protectedHtml;
      },
    },
    async generateBundle(_options, bundle) {
      const modules = [];
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id);
        if (!info || info.isExternal) throw new Error('EXTERNAL_MODULE');
        if (id.startsWith('\0') || id.startsWith('vite/') || id.startsWith('rolldown:')) continue;
        const clean = id.split('?')[0];
        const path = relative(repositoryRoot, clean).replaceAll('\\', '/');
        assertModuleAdmitted(path, profile !== null, solanaLocalnet !== null);
        if (!/\.(?:[cm]?[jt]sx?|css|html)$/.test(clean)) throw new Error('UNREVIEWED_MODULE_TYPE');
        const source = await readFile(clean, 'utf8');
        if (!path.startsWith('node_modules/') && /\.[jt]sx?$/.test(clean)) inspectApplicationSource(path, source, {
          allowWebSocketConstructor: profile !== null && path === LOCALNET_WEBSOCKET_MODULE,
          allowFetch: solanaLocalnet !== null && worker && path === 'apps/web/src/solana-localnet/rpc.ts',
        });
        modules.push({ path, sha256: createHash('sha256').update(source).digest('hex') });
      }
      modules.sort((a, b) => a.path.localeCompare(b.path, 'en'));
      const graph = { version: 1, scope: worker ? 'native-worker' : 'document', modules,
        frameworkDomInternals: 'React DOM contains internal HTML sink code. Application token checks and browser hostile-text probes are separate evidence.', completeXssProof: false };
      this.emitFile({ type: 'asset', fileName: worker ? 'core-graph-worker.json' : 'core-graph-document.json', source: JSON.stringify(graph, null, 2) + '\n' });
      if (!worker) {
        this.emitFile({ type: 'asset', fileName: 'content-policy.json', source: JSON.stringify({ ...policy, releaseAcceptance: false, ReleaseEnabled: 0 }, null, 2) + '\n' });
        const headerPolicy = solanaLocalnet ? solanaPolicy('header') : profile ? localnetPolicy('header', profile.relayOrigin) : offlinePolicy('header');
        this.emitFile({ type: 'asset', fileName: '_headers', source: '/*\n' + Object.entries(headerPolicy.headers).map(([name, value]) => `  ${name}: ${value}`).join('\n') + '\n' });
      }
      // This first scan runs before final HTML emission. The build CLI scans the on-disk final set.
      inspectArtifactFiles(Object.fromEntries(Object.entries(bundle).map(([name, file]) => [safeArtifactPath(name), file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8')])));
    },
  };
}
