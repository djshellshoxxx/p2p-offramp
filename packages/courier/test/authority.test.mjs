// Optional modules gain no authority over funded trades (D7 / invariant 8): courier models are local,
// diagnostic and in-memory. They hold no wallet, contract, relay, device or network executor.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as facade from '../index.ts';
import { evaluateAccessWindow } from '../src/locker.ts';
import { fixture, H, signs } from './support/fixtures.mjs';

const here = new URL('../', import.meta.url);
const sources = ['index.ts', ...readdirSync(new URL('src/', here)).map(name => `src/${name}`)];
const text = name => readFileSync(new URL(name, here), 'utf8');

test('courier: sources import only schemas/domain and use no network, browser, wallet or escrow surface', () => {
  const allowed = new Set(['../../domain/index.ts', '../../schemas/index.ts']);
  for (const name of sources) {
    const body = text(name);
    for (const match of body.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`\n]+)\1/g)) {
      const specifier = match[2];
      assert.ok(specifier.startsWith('./') || allowed.has(specifier), `${name} imports ${specifier}`);
    }
    // `window` is a domain word here (access windows), so only bare global member access is flagged for it.
    const hit = /\b(?:fetch|WebSocket|XMLHttpRequest|Worker|SharedWorker|EventSource|localStorage|sessionStorage|indexedDB|navigator|ethereum|solana)\b|(?<![.\w])(?:window|document)\s*\./.exec(body);
    assert.equal(hit, null, `${name} touches a browser/provider global: ${hit?.[0]}`);
  }
});

test('courier: no exported function is a fund/release/refund/slash/transfer/sign/send/broadcast executor', () => {
  const names = Object.keys(facade);
  assert.ok(names.length >= 14);
  for (const name of names) assert.doesNotMatch(name, /^(?:fund|release|refund|slash|transfer|pay|sign|send|broadcast|execute|submit|unlock|open)/i, name);
});

test('courier: authority flags are only ever assigned false in source', () => {
  const body = sources.map(text).join('\n');
  for (const flag of ['nativeExecutionAllowed', 'nativeUnlockAllowed', 'oneUsePersistenceVerified']) {
    assert.ok(new RegExp(`${flag}\\s*:\\s*false`).test(body), `${flag} is present and false`);
    assert.doesNotMatch(body, new RegExp(`${flag}\\s*:\\s*(?:true|boolean)`), `${flag} is never true or caller-selected`);
  }
});

test('courier: a valid signed access window stays diagnostic (no native unlock, no persisted one-use proof)', async () => {
  const f = fixture({ requiredSigners: () => ['key-issuer'] });
  const body = { reservationId: 'r', credentialId: H('5'), subject: 'key-courier', notBefore: 100, expiresAt: 200, maxClockError: 30, maxUses: 1, issuer: 'key-issuer', revocationEpoch: 4, offlineAllowed: false };
  const window = await f.verifier.verify('window', body, signs('key-issuer'));
  assert.equal(window.ok, true, JSON.stringify(window));
  const view = evaluateAccessWindow({ verifier: f.verifier, window: window.value, reservationId: 'r', subject: 'key-courier', interval: { lower: 110, upper: 120, error: 10 }, revocationEpoch: 4, replayStorageAvailable: true });
  assert.equal(view.ok, true); assert.equal(view.value.decision, 'valid');
  assert.equal(view.value.nativeUnlockAllowed, false); assert.equal(view.value.oneUsePersistenceVerified, false);
});
