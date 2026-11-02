import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import { isJsxText, isJsxAttribute, isStringLiteral } from 'typescript/unstable/ast';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceCatalog, SOURCE_LOCALE, english } from '../src/ui/locale/en.ts';
import { formatMessage, validateLocale } from '../src/ui/locale/catalog.ts';
import { messages as m } from '../src/ui/messages.ts';
import { tradeMessages as t, tradePageMessages as p } from '../src/ui/trade/trade-messages.ts';
import { recoveryReferenceMessages as r } from '../src/ui/recovery-reference-messages.ts';
import { diagnosticsMessages as d } from '../src/ui/diagnostics-messages.ts';
import { pseudoMessage, pseudoMetadata } from './locale-pseudo.mjs';

const example = purpose => purpose === 'count' ? 2 : purpose === 'date' ? 1700000000000 : purpose === 'base-unit amount' || purpose === 'duration' ? '123456789012345678901234567890' : purpose === 'currency' ? 'EUR' : purpose === 'text' ? 'plain text' : 'canonical-id';

test('every bundled message has frozen metadata and exact variable parity, including safety guidance', () => {
  assert.ok(Object.keys(sourceCatalog).length > 250);
  for (const [key, entry] of Object.entries(sourceCatalog)) {
    assert.equal(entry.key, key); assert.ok(entry.context.length > 10 && entry.docsAnchor.endsWith('.md'));
    assert.equal(entry.reviewRequired, true); assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.variables));
    const values = Object.fromEntries(Object.entries(entry.variables).map(([name, purpose]) => [name, example(purpose)]));
    assert.equal(typeof formatMessage(entry, values), 'string');
  }
  for (const key of ['trade.risk', 'shell.createConsent', 'shell.restoreConsent', 'recovery.unverified', 'diagnostics.privacy']) assert.equal(sourceCatalog[key].severity, 'critical');
});

test('existing English compatibility copy retains plural, page, fingerprint and exact amount behavior', () => {
  assert.equal(m.restored('a'.repeat(32), 1), `Restored as a new locked profile ${'a'.repeat(32)} with 1 record. Unlock it from Home.`);
  assert.equal(m.restored('a'.repeat(32), 2), `Restored as a new locked profile ${'a'.repeat(32)} with 2 records. Unlock it from Home.`);
  assert.equal(p.savedSkipped(1), '1 other trade record was not a readable saved review and was left unchanged.');
  assert.equal(p.savedSkipped(0), '0 other trade records were not a readable saved review and were left unchanged.');
  assert.equal(r.page(0, 0, 7), 'Journal records 0–0 of 0; local snapshot revision 7. This is not a chain height.');
  assert.equal(r.page(64, 70, 8), 'Journal records 65–70 of 70; local snapshot revision 8. This is not a chain height.');
  assert.equal(r.unsupported(1), '1 record on this page could not be interpreted. Nothing was deleted or rewritten. Keep a complete encrypted backup for compatible recovery software.');
  assert.equal(d.event(3), 'Event 3'); assert.equal(d.byteCount(8), '8 UTF-8 bytes; no events are included unless you selected them.');
  assert.match(p.testnetLocalProofBanner('ab'.repeat(32), 1, 1700000000), /fixture key abababababababab… \(manifest 1, valid until 2023-11-14T22:13:20\.000Z\)/);
  const units = ((1n << 256n) - 1n).toString(); assert.equal(t.baseUnits(units, 18), `${units} base units at 18 decimals`);
});

test('complete draft translation validates structurally; missing critical copy cannot silently fall back', () => {
  const messages = Object.fromEntries(Object.entries(sourceCatalog).map(([key, entry]) => [key, entry.source]));
  const draft = { locale: 'fr', translator: null, reviewer: null, status: 'draft', revision: 1, messages };
  assert.equal(Object.keys(validateLocale(draft, sourceCatalog).messages).length, Object.keys(sourceCatalog).length);
  delete messages['trade.risk'];
  assert.throws(() => validateLocale(draft, sourceCatalog), error => error.code === 'LOCALE_INCOMPLETE');
  assert.deepEqual(SOURCE_LOCALE, { locale: 'en', direction: 'ltr', revision: 2, translator: null, reviewer: null, status: 'draft' });
  assert.ok(Object.isFrozen(SOURCE_LOCALE));
});

test('test-only pseudolocale expands every source template while preserving variables and canonical bytes', () => {
  assert.equal(pseudoMetadata.status, 'draft');
  let expanded = 0;
  for (const entry of Object.values(sourceCatalog)) {
    const pseudo = pseudoMessage(entry), values = Object.fromEntries(Object.entries(entry.variables).map(([name, purpose]) => [name, example(purpose)]));
    const result = formatMessage(pseudo, values);
    assert.deepEqual(pseudo.variables, entry.variables); assert.ok(result.startsWith('[') && result.endsWith(']'));
    if (pseudo.source.length > entry.source.length + 2) expanded++;
  }
  assert.ok(expanded > 200);
  const canonical = '0xAbCd' + '12'.repeat(18), units = ((1n << 256n) - 1n).toString();
  const source = JSON.stringify({ canonical, units }), bytes = new TextEncoder().encode(source);
  const rendered = formatMessage(pseudoMessage(sourceCatalog['trade.baseUnits']), { units, decimals: 18 });
  assert.ok(rendered.includes(units)); assert.equal(new TextDecoder().decode(bytes), source);
  assert.ok(formatMessage(pseudoMessage(sourceCatalog['tradePage.sessionItem']), { orderId: canonical, revision: '7' }).includes(canonical));
});

test('message display performs no storage, network or browser-language lookup; plain values stay React text', () => {
  const originals = Object.fromEntries(['fetch', 'localStorage', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const key of Object.keys(originals)) Object.defineProperty(globalThis, key, { configurable: true, get() { throw Error('Unexpected external read.'); } });
    assert.equal(english('shell', 'inventoryTitle', { count: 1, max: 16 }), 'Profiles on this origin (1 of 16)');
    const value = formatMessage(sourceCatalog['display.remaining'], { duration: '<img src=x onerror=alert(1)>' });
    const html = renderToStaticMarkup(createElement('p', null, value));
    assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img'));
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('UI labels and accessible prose are catalog-backed, with machine values kept outside translation', async () => {
  const root = fileURLToPath(new URL('../src/ui/', import.meta.url)), failures = [], paths = [];
  async function visitDirectory(path) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const child = `${path}/${item.name}`;
      if (item.isDirectory()) await visitDirectory(child);
      else if (child.endsWith('.tsx')) paths.push(child);
    }
  }
  await visitDirectory(root);
  const api = new API({ cwd: fileURLToPath(new URL('../../../', import.meta.url)) });
  try {
    const projects = api.updateSnapshot({ openProjects: ['apps/web/tsconfig.ui.json'], openFiles: paths }).getProjects();
    for (const path of paths) {
        const source = projects.map(project => project.program.getSourceFile(path)).find(Boolean);
        assert.ok(source, `AST available: ${path}`);
        const visit = node => {
          if (isJsxText(node) && /\p{L}/u.test(node.text)) failures.push(`${path}: inline JSX prose`);
          if (isJsxAttribute(node) && ['aria-label', 'title', 'alt', 'placeholder'].includes(node.name.getText(source)) && node.initializer && isStringLiteral(node.initializer) && /\p{L}/u.test(node.initializer.text)) failures.push(`${path}: inline accessible prose`);
          node.forEachChild(visit);
        };
        visit(source);
    }
  } finally { api.close(); }
  assert.deepEqual(failures, []);
  const displays = await readFile(`${root}/trade/TradeTermsReview.tsx`, 'utf8');
  assert.match(displays, /review\.amountBaseUnits/); assert.match(displays, /result\.value\.full/);
});
