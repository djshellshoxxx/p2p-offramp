import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localizeShellHtml } from './source-locale.mjs';
import { englishGroup } from '../src/ui/locale/en.ts';

test('static loading, no-script and safety copy comes from the same English catalog', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const output = localizeShellHtml(template), copy = englishGroup('document');
  for (const text of Object.values(copy)) assert.ok(output.includes(text));
  assert.ok(output.includes('<html lang="en" dir="ltr">'));
  assert.ok(output.includes('<!-- OFFLINE_CONTENT_POLICY -->'), 'the security-policy transform retains its own marker');
  assert.ok(!output.includes('__P2P_SOURCE_'));
  assert.match(output, /<script type="module" src="\.\/src\/main\.tsx"><\/script>/);
});

test('missing or duplicated catalog placeholders fail instead of emitting mixed static copy', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const key of ['LANG', 'DIRECTION', 'TITLE', 'LOADING', 'NOSCRIPT', 'POLICY_NOTICE']) {
    const marker = `__P2P_SOURCE_${key}__`;
    for (const input of [template.replace(marker, ''), template.replace(marker, marker + marker)]) {
      assert.throws(() => localizeShellHtml(input), { message: 'SOURCE_LOCALE_PLACEHOLDER' });
    }
  }
});
