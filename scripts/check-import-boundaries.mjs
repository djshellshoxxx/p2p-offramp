#!/usr/bin/env node
/** Static source-boundary checks. This does not prove runtime isolation or inspect arbitrary bundler transforms. */
import { readdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import {
  isCallExpression,
  isElementAccessExpression,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportExpression,
  isImportTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isStringLiteral,
} from 'typescript/unstable/ast';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
const CORE_PACKAGES = new Set(['domain', 'schemas']);
const BROWSER_GLOBALS = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
  'Worker', 'SharedWorker', 'WebSocket', 'fetch', 'XMLHttpRequest', 'EventSource',
]);
const PROVIDER_GLOBALS = new Set(['ethereum', 'solana']);
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https', 'module',
  'net', 'os', 'path', 'process', 'stream', 'timers', 'url', 'util', 'worker_threads',
  'zlib', 'test', 'readline', 'vm', 'perf_hooks', 'tty', 'querystring', 'dns', 'tls',
]);
const ADVANCED_PACKAGES = new Set([
  'advanced', 'extensions', 'proof', 'proofs', 'zk', 'zktls', 'stealth', 'reputation',
  'maps', 'map', 'courier', 'couriers', 'tribunal', 'arbitration', 'arbitrator',
]);

function posix(value) { return value.split(sep).join('/'); }
function within(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
function sourceKind(path) {
  const parts = posix(path).split('/');
  const packageIndex = parts.indexOf('packages');
  if (packageIndex >= 0 && parts[packageIndex + 2] === 'src') return { kind: 'package', name: parts[packageIndex + 1], facade: false };
  if (packageIndex >= 0 && packageIndex + 2 === parts.length - 1 && /^index\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(parts[packageIndex + 2])) {
    return { kind: 'package', name: parts[packageIndex + 1], facade: true };
  }
  if (parts.includes('apps') && parts.includes('web') && parts.includes('src')) return { kind: 'app' };
  return undefined;
}
async function collectSources(root) {
  const output = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && SOURCE_EXTENSIONS.includes(extname(entry.name)) && sourceKind(relative(root, path))) output.push(path);
    }
  }
  for (const dir of [resolve(root, 'packages'), resolve(root, 'apps/web/src')]) await walk(dir);
  return output.sort();
}
function addFinding(findings, file, node, code, detail = '') {
  let line = 1;
  try { line = file.text.slice(0, node.getStart()).split('\n').length; } catch { /* generated AST nodes use line 1 */ }
  findings.push({ file: file.fileName, line, code, detail });
}
function bareSpecifier(value) {
  return !value.startsWith('.') && !value.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(value);
}
function isNodeBuiltin(value) {
  const normalized = value.startsWith('node:') ? value.slice(5) : value;
  return value.startsWith('node:') || NODE_BUILTINS.has(normalized);
}
function moduleSpecifiers(sourceFile) {
  const imports = [];
  function walk(node) {
    if (isImportDeclaration(node) || isExportDeclaration(node)) {
      if (node.moduleSpecifier && isStringLiteral(node.moduleSpecifier)) imports.push({ node: node.moduleSpecifier, value: node.moduleSpecifier.text });
    } else if (isCallExpression(node) && isImportExpression(node.expression)) {
      // TypeScript 7 represents `import(x)` as a call whose callee is the `import` keyword.
      const argument = node.arguments[0];
      if (argument && isStringLiteral(argument)) imports.push({ node: argument, value: argument.text });
      else imports.push({ node, value: undefined });
    } else if (isImportTypeNode(node)) {
      if (node.argument && isStringLiteral(node.argument)) imports.push({ node: node.argument, value: node.argument.text });
      else imports.push({ node, value: undefined });
    } else if (isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === 'require') {
      const argument = node.arguments[0];
      if (argument && isStringLiteral(argument)) imports.push({ node: argument, value: argument.text });
      else imports.push({ node, value: undefined });
    }
    node.forEachChild(child => { walk(child); });
  }
  walk(sourceFile);
  return imports;
}
function resolveLocalModule(root, importer, specifier, sourceSet) {
  if (!specifier || (!specifier.startsWith('.') && !isAbsolute(specifier))) return { external: true };
  const raw = isAbsolute(specifier) ? resolve(specifier) : resolve(dirname(importer), specifier);
  if (!within(root, raw)) return { escaped: true, path: raw };
  const candidates = extname(raw)
    ? [raw]
    : [...SOURCE_EXTENSIONS.map(extension => raw + extension), ...SOURCE_EXTENSIONS.map(extension => resolve(raw, `index${extension}`))];
  return { path: candidates.find(candidate => sourceSet.has(candidate)) ?? raw };
}
function packageForPath(root, path) {
  const rel = posix(relative(root, path));
  const match = /^packages\/([^/]+)\//.exec(rel);
  return match?.[1];
}
function isPublicPackageFacade(root, path) {
  return /^packages\/[^/]+\/index\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(posix(relative(root, path)));
}
function isAppSource(root, path) {
  return /^apps\/web\/src(?:\/|$)/.test(posix(relative(root, path)));
}
function isAdvancedOrServerPath(root, path) {
  const rel = posix(relative(root, path));
  const parts = rel.toLowerCase().split('/').flatMap(part => part.split(/[-_]/));
  return parts.some(part => part === 'server' || part === 'servers' || ADVANCED_PACKAGES.has(part));
}
function checkGlobalReferences(root, file, source, findings) {
  const kind = sourceKind(relative(root, file.fileName));
  if (kind?.kind !== 'package' || !CORE_PACKAGES.has(kind.name)) return;
  function walk(node) {
    if (isIdentifier(node) && BROWSER_GLOBALS.has(node.text)) {
      const parent = node.parent;
      const isPropertyName = parent && ((isPropertyAccessExpression(parent) && parent.name === node)
        || ((isPropertyAssignment(parent) || isPropertyDeclaration(parent) || isPropertySignatureDeclaration(parent)) && parent.name === node));
      if (!isPropertyName) addFinding(findings, file, node, 'CORE_BROWSER_GLOBAL', node.text);
    }
    if (isIdentifier(node) && PROVIDER_GLOBALS.has(node.text)) {
      const parent = node.parent;
      const isPropertyName = parent && ((isPropertyAccessExpression(parent) && parent.name === node)
        || ((isPropertyAssignment(parent) || isPropertyDeclaration(parent) || isPropertySignatureDeclaration(parent)) && parent.name === node));
      if (!isPropertyName) addFinding(findings, file, node, 'CORE_PROVIDER_GLOBAL', node.text);
    }
    if (isPropertyAccessExpression(node) && node.expression && isIdentifier(node.expression) && node.expression.text === 'globalThis' && BROWSER_GLOBALS.has(node.name.text)) {
      addFinding(findings, file, node.name, 'CORE_BROWSER_GLOBAL', `globalThis.${node.name.text}`);
    }
    if (isPropertyAccessExpression(node) && node.expression && isIdentifier(node.expression) && node.expression.text === 'globalThis' && PROVIDER_GLOBALS.has(node.name.text)) {
      addFinding(findings, file, node.name, 'CORE_PROVIDER_GLOBAL', `globalThis.${node.name.text}`);
    }
    if (isElementAccessExpression(node) && node.expression && isIdentifier(node.expression) && node.expression.text === 'globalThis' && node.argumentExpression && isStringLiteral(node.argumentExpression) && BROWSER_GLOBALS.has(node.argumentExpression.text)) {
      addFinding(findings, file, node.argumentExpression, 'CORE_BROWSER_GLOBAL', `globalThis[${node.argumentExpression.text}]`);
    }
    if (isElementAccessExpression(node) && node.expression && isIdentifier(node.expression) && node.expression.text === 'globalThis' && node.argumentExpression && isStringLiteral(node.argumentExpression) && PROVIDER_GLOBALS.has(node.argumentExpression.text)) {
      addFinding(findings, file, node.argumentExpression, 'CORE_PROVIDER_GLOBAL', `globalThis[${node.argumentExpression.text}]`);
    }
    node.forEachChild(child => { walk(child); });
  }
  walk(source);
}

/**
 * Inspect the production source tree with the TypeScript 7 AST. Findings are structural checks,
 * not data-flow analysis, a complete bundler graph, or proof of runtime isolation.
 */
export async function inspectImportBoundaries(rootDir = process.cwd()) {
  const root = await realpath(resolve(rootDir));
  const paths = await collectSources(root);
  const findings = [];
  if (paths.length === 0) return { findings: [{ file: root, line: 1, code: 'NO_PRODUCTION_SOURCES', detail: '' }], sourceCount: 0, graphChecked: false };
  const sourceSet = new Set(paths);
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openProjects: ['tsconfig.json'], openFiles: paths });
    const projects = snapshot.getProjects();
    const astByPath = new Map();
    for (const path of paths) {
      let parsed;
      for (const project of projects) {
        parsed = project.program.getSourceFile(path);
        if (parsed) break;
      }
      if (!parsed) {
        findings.push({ file: path, line: 1, code: 'AST_PARSE_UNAVAILABLE', detail: '' });
        continue;
      }
      astByPath.set(path, parsed);
      const kind = sourceKind(relative(root, path));
      for (const imported of moduleSpecifiers(parsed)) {
        if (imported.value === undefined) {
          addFinding(findings, parsed, imported.node, 'NON_LITERAL_IMPORT', 'cannot resolve statically');
          continue;
        }
        if (kind?.kind === 'package' && CORE_PACKAGES.has(kind.name) && bareSpecifier(imported.value)) {
          addFinding(findings, parsed, imported.node, isNodeBuiltin(imported.value) ? 'CORE_NODE_IMPORT' : 'CORE_EXTERNAL_IMPORT', imported.value);
        }
        if (/^(?:https?|file|data|blob):/i.test(imported.value)) {
          addFinding(findings, parsed, imported.node, 'EXTERNAL_URL_IMPORT', imported.value);
        }
        const resolved = resolveLocalModule(root, path, imported.value, sourceSet);
        if (resolved.escaped) {
          addFinding(findings, parsed, imported.node, 'IMPORT_PATH_ESCAPE', imported.value);
          continue;
        }
        if (resolved.external) {
          if (/(?:^|\/)src(?:\/|$)/.test(imported.value)) {
            addFinding(findings, parsed, imported.node, kind?.kind === 'app' ? 'APP_PACKAGE_PRIVATE_IMPORT' : 'CROSS_PACKAGE_PRIVATE_IMPORT', imported.value);
          }
          continue;
        }
        const targetPackage = packageForPath(root, resolved.path);
        if (kind?.kind === 'app') {
          if (targetPackage && !isPublicPackageFacade(root, resolved.path)) {
            addFinding(findings, parsed, imported.node, 'APP_PACKAGE_PRIVATE_IMPORT', imported.value);
          } else if (within(root, resolved.path) && !targetPackage && !isAppSource(root, resolved.path)) {
            addFinding(findings, parsed, imported.node, 'APP_IMPORT_OUTSIDE_BOUNDARY', imported.value);
          }
        } else if (kind?.kind === 'package') {
          if (targetPackage && targetPackage !== kind.name && !isPublicPackageFacade(root, resolved.path)) {
            addFinding(findings, parsed, imported.node, 'CROSS_PACKAGE_PRIVATE_IMPORT', imported.value);
          } else if (within(root, resolved.path) && !targetPackage && !isAppSource(root, resolved.path)) {
            addFinding(findings, parsed, imported.node, 'PACKAGE_IMPORT_OUTSIDE_BOUNDARY', imported.value);
          } else if (isAppSource(root, resolved.path)) {
            addFinding(findings, parsed, imported.node, 'PACKAGE_IMPORT_APP_SOURCE', imported.value);
          }
        }
      }
      checkGlobalReferences(root, parsed, parsed, findings);
    }

    // Follow the statically resolvable app entry graph. If the app has no known entry file yet,
    // report that graph verification is unavailable instead of inferring it from all source files.
    const entries = paths.filter(path => {
      if (sourceKind(relative(root, path))?.kind !== 'app') return false;
      return /(?:^|\/)(?:main|index)\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(posix(path));
    });
    const graphChecked = entries.length > 0;
    if (!graphChecked) findings.push({ file: resolve(root, 'apps/web/src'), line: 1, code: 'CORE_GRAPH_NOT_CHECKED', detail: 'no main/index source entry found' });
    const visited = new Set();
    function visit(path) {
      if (visited.has(path)) return;
      visited.add(path);
      const source = astByPath.get(path);
      if (!source) return;
      for (const imported of moduleSpecifiers(source)) {
        if (imported.value === undefined) continue;
        const resolved = resolveLocalModule(root, path, imported.value, sourceSet);
        if (resolved.path && !resolved.external && !resolved.escaped && isAdvancedOrServerPath(root, resolved.path)) {
          addFinding(findings, source, imported.node, 'CORE_GRAPH_FORBIDDEN_MODULE', posix(relative(root, resolved.path)));
        }
        if (resolved.path && !resolved.external && !resolved.escaped && astByPath.has(resolved.path)) visit(resolved.path);
      }
    }
    for (const entry of entries) visit(entry);
    return {
      findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail)),
      sourceCount: paths.length,
      graphChecked,
      graphModules: graphChecked ? visited.size : 0,
    };
  } finally {
    api.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const result = await inspectImportBoundaries(root);
  for (const finding of result.findings) {
    console.log(`${posix(relative(root, finding.file))}:${finding.line} ${finding.code}${finding.detail ? ` ${finding.detail}` : ''}`);
  }
  if (result.findings.length) {
    console.error(`Import boundary check found ${result.findings.length} finding(s) across ${result.sourceCount} production source files; core entry graph ${result.graphChecked ? `visited ${result.graphModules} module(s)` : 'not checked'}.`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${result.sourceCount} production source files; core entry graph visited ${result.graphModules} module(s). Static boundary checks do not prove runtime isolation or complete the bundler graph.`);
  }
}
