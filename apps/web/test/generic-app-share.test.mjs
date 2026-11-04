import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { deriveGenericAppLink } from '../src/sharing/generic-app-link.ts';
import { GenericAppShare } from '../src/ui/GenericAppShare.tsx';

test('generic app links derive only from the actual dev or emitted main entry and preserve deployment subpaths', () => {
  const cases = [
    ['https://app.example/assets/index-Abc_123-.js', 'https://app.example/'],
    ['https://app.example/nested/project/assets/index-Bkw9Z_1a.js', 'https://app.example/nested/project/'],
    ['https://gateway.example/ipfs/bafy-local-fixture/assets/index-CQ29bW8a.js', 'https://gateway.example/ipfs/bafy-local-fixture/'],
    ['https://app.example:9443/%E2%9C%93/space%20name/assets/index-Abc12345.js', 'https://app.example:9443/%E2%9C%93/space%20name/'],
    ['http://127.0.0.1:3000/src/main.tsx', 'http://127.0.0.1:3000/'],
    ['http://localhost:4173/project/assets/index-Abc12345.js', 'http://localhost:4173/project/'],
    ['http://[::1]:3000/src/main.tsx', 'http://[::1]:3000/'],
  ];
  for (const [entry, expected] of cases) assert.equal(deriveGenericAppLink(entry), expected);
});

test('current routes, queries, fragments, imported modules and unknown entry shapes cannot become app-share targets', () => {
  for (const entry of [
    'https://app.example/nested/?profile=PRIVATE#/trade/PRIVATE',
    'https://app.example/nested/#/settings',
    'https://app.example/assets/index-Abc12345.js?profile=PRIVATE',
    'https://app.example/assets/index-Abc12345.js#PRIVATE',
    'https://app.example/assets/index-Abc12345.js?',
    'https://app.example/assets/index-Abc12345.js#',
    'https://app.example/src/sharing/generic-app-link.ts',
    'https://app.example/src/main.tsx?import',
    'https://app.example/nested/index.html',
    'https://app.example/assets/index.js',
    'https://app.example/assets/index-Abc12345.css',
    'https://app.example/assets/index-Abc12345.js/extra',
    'https://app.example/other/index-Abc12345.js',
    '/assets/index-Abc12345.js',
  ]) assert.equal(deriveGenericAppLink(entry), null, entry);
});

test('app sharing accepts HTTPS or exact canonical HTTP loopback and rejects credentials or malformed URLs', () => {
  for (const entry of [
    'http://app.example/assets/index-Abc12345.js',
    'http://localhost.example/src/main.tsx',
    'http://sub.localhost/src/main.tsx',
    'http://localhost./src/main.tsx',
    'http://127.0.0.2/src/main.tsx',
    'http://127.1/src/main.tsx',
    'http://0x7f000001/src/main.tsx',
    'https://user:password@app.example/assets/index-Abc12345.js',
    'https://@app.example/assets/index-Abc12345.js',
    'https://APP.example/assets/index-Abc12345.js',
    'https://app.example:443/assets/index-Abc12345.js',
    'https://app.example./assets/index-Abc12345.js ',
    ' https://app.example/assets/index-Abc12345.js',
    'https://app.example/\nassets/index-Abc12345.js',
    'https://app.example\\private/assets/index-Abc12345.js',
    'file:///assets/index-Abc12345.js',
    'blob:https://app.example/assets/index-Abc12345.js',
    'data:text/plain,PRIVATE',
    'javascript:PRIVATE',
    'https://[broken/src/main.tsx',
  ]) assert.equal(deriveGenericAppLink(entry), null, entry);
});

test('path normalization, encoded traversal, separators and invalid encodings fail closed before deriving a base', () => {
  for (const prefix of [
    'private/../', './', '%2e%2e/', '%2E/', '%252e%252e/', '%252f/',
    'private%2froute/', 'private%5croute/', '%3Fprofile=PRIVATE/', '%23PRIVATE/',
    '%00/', '%0A/', '%FF/', '%C0%AF/', '%ZZ/', 'double//',
  ]) assert.equal(deriveGenericAppLink(`https://app.example/${prefix}assets/index-Abc12345.js`), null, prefix);
});

test('non-string and oversized inputs are rejected without coercion or ambient current-route reads', () => {
  let access = 0;
  const hostile = { toString() { access++; throw new Error('PRIVATE'); } };
  for (const value of [undefined, null, false, 1, Symbol('PRIVATE'), hostile, '', 'https://app.example/' + 'x'.repeat(4096) + '/src/main.tsx']) assert.equal(deriveGenericAppLink(value), null);
  assert.equal(access, 0);
  const before = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, get() { throw new Error('private current route must not be read'); } });
  try { assert.equal(deriveGenericAppLink('https://app.example/project/src/main.tsx'), 'https://app.example/project/'); }
  finally { if (before) Object.defineProperty(globalThis, 'location', before); else delete globalThis.location; }
});

test('app sharing renders a labeled readonly manual address and explicit copy action without startup clipboard access', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); let reads = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { reads++; throw new Error('startup must not inspect clipboard'); } });
  try {
    const html = renderToStaticMarkup(createElement(GenericAppShare, { appLink: 'https://app.example/nested/project/' }));
    assert.equal(reads, 0);
    assert.match(html, /Share this app/);
    assert.match(html, /<label[^>]*>App address<\/label>/);
    assert.match(html, /<input[^>]*readOnly=""[^>]*value="https:\/\/app\.example\/nested\/project\/"/);
    assert.match(html, /<button[^>]*type="button"[^>]*>Copy app address<\/button>/);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /App address copied\./);
    assert.doesNotMatch(html, /href=|<form|PRIVATE/);
  } finally { if (before) Object.defineProperty(globalThis, 'navigator', before); else delete globalThis.navigator; }
});

test('unsupported entry rendering offers a fixed fallback without an invented address or copy action', () => {
  const html = renderToStaticMarkup(createElement(GenericAppShare, { appLink: null }));
  assert.match(html, /A generic app address is unavailable\./);
  assert.doesNotMatch(html, /<input|<button|https?:\/\//);
});
