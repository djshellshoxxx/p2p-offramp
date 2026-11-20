// Optional modules gain no authority over funded trades (D7 / invariant 8): arbitration here is
// diagnostic calculation only. No tribunal outcome can release, refund, slash or reassign basic principal.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as facade from '../index.ts';

const here = new URL('../', import.meta.url);
const sources = ['index.ts', ...readdirSync(new URL('src/', here)).map(name => `src/${name}`)];
const text = name => readFileSync(new URL(name, here), 'utf8');
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result, (_, v) => typeof v === 'bigint' ? String(v) : v)); return result.value; };

test('arbitration: sources import only noble hashes and local files, with no network, browser, wallet or escrow surface', () => {
  const allowed = new Set(['@noble/hashes/sha2.js', '@noble/hashes/sha3.js']);
  for (const name of sources) {
    const body = text(name);
    for (const match of body.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`\n]+)\1/g)) {
      const specifier = match[2];
      assert.ok(specifier.startsWith('./') || allowed.has(specifier), `${name} imports ${specifier}`);
    }
    // `window` is a domain word here (evidence windows), so only bare global member access is flagged for it.
    const hit = /\b(?:fetch|WebSocket|XMLHttpRequest|Worker|SharedWorker|EventSource|localStorage|sessionStorage|indexedDB|navigator|ethereum|solana)\b|(?<![.\w])(?:window|document)\s*\./.exec(body);
    assert.equal(hit, null, `${name} touches a browser/provider global: ${hit?.[0]}`);
  }
});

test('arbitration: no exported function is a fund/release/refund/slash/transfer/sign/send/execute action', () => {
  const names = Object.keys(facade);
  assert.ok(names.length >= 15);
  for (const name of names) assert.doesNotMatch(name, /^(?:fund|release|refund|slash|transfer|pay|sign|send|broadcast|execute|submit|settle|certify)/i, name);
});

test('arbitration: calculators return diagnostic-only data and a penalty or fee quote is never applied or spent', () => {
  const penalty = ok(facade.calculateNonRevealPenalty({ reservedBond: 101n, reservedRemaining: 101n, seated: true, accepted: true, enteredCommit: true, validTimelyReveal: false, roundClosed: true }));
  assert.equal(penalty.applied, false);
  const quote = ok(facade.quoteFeeReserve({ feePerSeat: 7n, providerRound0: 11n, providerRound1: 13n, executionCap: 17n }));
  assert.equal(quote.principalContribution, 0n);
  const tally = ok(facade.calculateTally(0, [0, 0, 0, 0, 0]));
  assert.equal(tally.closed, false, 'a count is never a closed verdict');
  for (const value of [penalty, quote, tally]) {
    assert.equal(value.diagnosticOnly, true); assert.equal(value.economicAuthority, false);
    for (const inner of Object.values(value)) assert.notEqual(typeof inner, 'function');
  }
});

test('arbitration: authority flags are only ever assigned false/true as diagnostic constants in source', () => {
  const body = sources.map(text).join('\n');
  assert.doesNotMatch(body, /economicAuthority\s*:\s*(?:true|boolean)/);
  assert.doesNotMatch(body, /diagnosticOnly\s*:\s*(?:false|boolean)/);
  assert.match(body, /economicAuthority:\s*false/);
});
