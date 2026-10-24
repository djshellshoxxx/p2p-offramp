/** Bounded static checks complement browser probes; they do not prove absence of XSS. */
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

const forbiddenMembers = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'dangerouslySetInnerHTML', 'serviceWorker', 'sendBeacon']);
export function inspectApplicationSource(path, source) {
  // TypeScript 7's scanner handles escapes/comments/literals. This is a conservative token
  // policy, not data-flow analysis; browser fixtures independently exercise hostile content.
  const scanner = createScanner(true, undefined, source);
  const tokens = [], templates = [];
  let braces = 0, previousEnd = -1;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if (kind === SyntaxKind.SlashToken && ['=', '(', '[', ',', ':', 'return', '!', '&&', '||', '?', '=>'].includes(tokens.at(-1)?.text)) kind = scanner.reScanSlashToken();
    if (kind === SyntaxKind.CloseBraceToken && templates.at(-1) === braces) {
      kind = scanner.reScanTemplateToken(false);
      if (kind === SyntaxKind.TemplateTail) templates.pop();
    } else if (kind === SyntaxKind.OpenBraceToken) braces++;
    else if (kind === SyntaxKind.CloseBraceToken) braces--;
    if (kind === SyntaxKind.TemplateHead) templates.push(braces);
    if (tokens.length > source.length * 2 + 1 || scanner.getTokenEnd() <= previousEnd) throw new Error(`SOURCE_SCANNER_LIMIT: ${path}`);
    previousEnd = scanner.getTokenEnd();
    tokens.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() });
  }
  const fail = () => { throw new Error(`SOURCE_POLICY: ${path}`); };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], previous = tokens[i - 1]?.text, next = tokens[i + 1]?.text;
    if ((token.kind === SyntaxKind.Identifier || token.kind === SyntaxKind.StringLiteral && previous === '[') && forbiddenMembers.has(token.value)) fail();
    if (token.kind === SyntaxKind.Identifier && ['eval', 'Function', 'fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource'].includes(token.value) && next === '(') fail();
    if (['write', 'writeln'].includes(token.value) && previous === '.' && tokens[i - 2]?.text === 'document') fail();
    if (token.value === 'style' && next === '=') fail();
    if (token.value === 'setAttribute' && next === '(' && tokens[i + 2]?.kind === SyntaxKind.StringLiteral && /^(?:on|style$)/i.test(tokens[i + 2].value)) fail();
  }
}
export function safeArtifactPath(path) {
  if (typeof path !== 'string' || path.length < 1 || path.length > 240 || !/^[a-zA-Z0-9._/-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('ARTIFACT_PATH');
  return path;
}
const localResource = value => /^(?:\.\/)?[a-zA-Z0-9_-][a-zA-Z0-9._/-]*$/.test(value) && !value.split('/').includes('..');
export function inspectArtifactFiles(files) {
  const paths = Object.keys(files);
  if (paths.length > 10000 || new Set(paths.map(path => safeArtifactPath(path).toLowerCase())).size !== paths.length) throw new Error('ARTIFACT_POLICY: paths');
  let total = 0, frameworkSinkTokens = 0;
  for (const path of paths) {
    const text = String(files[path]); total += Buffer.byteLength(text);
    const fail = () => { throw new Error(`ARTIFACT_POLICY: ${path}`); };
    if (total > 256 * 1024 * 1024 || path.endsWith('.map') || /sourceMappingURL|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text)) fail();
    if (/\.(?:html|css|js)$/.test(path) && /\b(?:eval\s*\(|new\s+Function\s*\(|serviceWorker\s*\.\s*register\s*\()/.test(text)) fail();
    if (path.endsWith('.html')) {
      if (/\s(?:on[a-z]+|style|srcset|poster|action)\s*=/i.test(text) || /http-equiv\s*=\s*["']refresh["']/i.test(text) || /<(?:style|iframe|object|embed|base)\b/i.test(text)) fail();
      for (const script of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (script[2].trim() || !/\bsrc\s*=/.test(script[1])) fail();
      for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
        if (!localResource(match[1]) && !/^#\/[a-z/]*$/.test(match[1])) fail();
        if (localResource(match[1]) && !Object.hasOwn(files, match[1].replace(/^\.\//, ''))) fail();
      }
    }
    if (path.endsWith('.css')) {
      if (/@import\b/i.test(text)) fail();
      for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)/gi)) if (!localResource(match[1])) fail();
    }
    if (path.endsWith('.js')) {
      // Namespace/documentation strings in React are not network requests. Check executable imports,
      // and report internal sink tokens separately from the application token policy above.
      if (/\b(?:import|export)\s*(?:\([^)]*|[^;]*?from\s*)?["'](?:https?:|\/\/|data:|blob:)/.test(text)) fail();
      frameworkSinkTokens += (text.match(/innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML/g) ?? []).length;
    }
  }
  return { files: paths.length, bytes: total, bundledSinkTokensRequiringFrameworkReview: frameworkSinkTokens, completeXssProof: false };
}
