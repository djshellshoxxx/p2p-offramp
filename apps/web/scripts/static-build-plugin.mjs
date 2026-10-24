import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildOfflineContentPolicy } from '../../../packages/security/src/content-policy.ts';
import { inspectApplicationSource, inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';

const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function offlinePolicy(delivery) {
  return buildOfflineContentPolicy({ version: 1, releaseId: 'local-development', delivery });
}
export function policyMarkup(policy) {
  return policy.meta.map(record => 'httpEquiv' in record
    ? `<meta http-equiv="${record.httpEquiv}" content="${escapeAttribute(record.content)}">`
    : `<meta name="${record.name}" content="${record.content}">`).join('\n    ');
}
/** Runs for document and native Worker builds; records real bundler module graphs. */
export function staticBuildPlugin(repositoryRoot, delivery = 'meta', worker = false) {
  const policy = offlinePolicy(delivery);
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
        if (path.startsWith('../') || /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)/.test(path) || /(?:^|\/)packages\/(?:extensions|chain-evm|chain-solana|relay)(?:\/|$)|(?:^|\/)(?:05_ADVANCED|06_)/i.test(path)) throw new Error('NON_CORE_MODULE');
        if (!/\.(?:[cm]?[jt]sx?|css|html)$/.test(clean)) throw new Error('UNREVIEWED_MODULE_TYPE');
        const source = await readFile(clean, 'utf8');
        if (!path.startsWith('node_modules/') && /\.[jt]sx?$/.test(clean)) inspectApplicationSource(path, source);
        if (path.startsWith('node_modules/') && !/^node_modules\/(?:react|react-dom|scheduler)\//.test(path)) throw new Error(`UNREVIEWED_DEPENDENCY: ${path}`);
        modules.push({ path, sha256: createHash('sha256').update(source).digest('hex') });
      }
      modules.sort((a, b) => a.path.localeCompare(b.path, 'en'));
      const graph = { version: 1, scope: worker ? 'native-worker' : 'document', modules,
        frameworkDomInternals: 'React DOM contains internal HTML sink code. Application token checks and browser hostile-text probes are separate evidence.', completeXssProof: false };
      this.emitFile({ type: 'asset', fileName: worker ? 'core-graph-worker.json' : 'core-graph-document.json', source: JSON.stringify(graph, null, 2) + '\n' });
      if (!worker) {
        this.emitFile({ type: 'asset', fileName: 'content-policy.json', source: JSON.stringify({ ...policy, releaseAcceptance: false, ReleaseEnabled: 0 }, null, 2) + '\n' });
        const headerPolicy = offlinePolicy('header');
        this.emitFile({ type: 'asset', fileName: '_headers', source: '/*\n' + Object.entries(headerPolicy.headers).map(([name, value]) => `  ${name}: ${value}`).join('\n') + '\n' });
      }
      // This first scan runs before final HTML emission. The build CLI scans the on-disk final set.
      inspectArtifactFiles(Object.fromEntries(Object.entries(bundle).map(([name, file]) => [safeArtifactPath(name), file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8')])));
    },
  };
}
