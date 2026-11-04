import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedHttpDriver, MAX_HTTP_BYTES, MAX_HTTP_READS } from '../src/http-driver.ts';

// Fetch decodes Content-Encoding before exposing the body; Content-Length still counts encoded bytes.
// A CORS response also hides Content-Encoding (not safelisted) while exposing Content-Length.
const URL_ = 'https://example.test/data';
function scope() {
  const abort = new AbortController();
  return {
    signal: abort.signal,
    current: () => !abort.signal.aborted,
    dispose: () => abort.abort(),
    abort: () => abort.abort(),
    run: async work => ({ ok: true, value: await work(abort.signal) }),
  };
}
function reply(chunks, headers, options = {}) {
  const body = new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(chunk); c.close(); } });
  return { ok: true, redirected: false, url: URL_, headers: new Headers(headers), body, ...options };
}
const decoded = size => Uint8Array.from({ length: size }, (_, i) => i & 255);
const request = response => new BoundedHttpDriver(async () => response).request(scope(), URL_);
// Compare outcome first: a failing deepEqual diff over a 64KiB typed array is pathologically slow.
function assertBytes(result, expected, label) {
  assert.equal(result.ok, true, `${label}: ${JSON.stringify(result)}`);
  assert.equal(Buffer.compare(result.value, expected), 0, label);
}

test('gzip and br responses yield decoded bytes although Content-Length is the encoded size', async () => {
  for (const coding of ['gzip', 'br', 'deflate', 'GZIP', 'gzip, br']) {
    const body = decoded(4011);
    const headers = { 'content-encoding': coding, 'content-length': '54' };
    const result = await request(reply([body.slice(0, 2000), body.slice(2000)], headers));
    assertBytes(result, body, coding);
  }
});

test('CORS response with hidden Content-Encoding does not trust the exposed encoded length', async () => {
  const body = decoded(5000);
  assertBytes(await request(reply([body], { 'content-length': '40' }, { type: 'cors' })), body, 'cors');
});

test('encoded Content-Length above the cap is not a decoded-size refusal', async () => {
  // Incompressible content: gzip framing makes the encoded size exceed the decoded size.
  const body = decoded(MAX_HTTP_BYTES);
  const headers = { 'content-encoding': 'gzip', 'content-length': String(MAX_HTTP_BYTES + 23) };
  assertBytes(await request(reply([body], headers)), body, 'incompressible');
});

test('decoded byte cap is enforced while streaming an encoded response', async () => {
  let pulls = 0;
  const body = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(4096)); } });
  const headers = { 'content-encoding': 'gzip', 'content-length': '100' };
  const result = await request({ ok: true, redirected: false, url: URL_, headers: new Headers(headers), body });
  assert.deepEqual(result, { ok: false, error: 'LIMIT_EXCEEDED' });
  // The reader stops at the first chunk beyond the cap; the unbounded source is never drained.
  assert.ok(pulls <= MAX_HTTP_BYTES / 4096 + 3, String(pulls));
  const fragments = Array.from({ length: MAX_HTTP_READS + 1 }, () => new Uint8Array());
  assert.deepEqual(await request(reply(fragments, headers)), { ok: false, error: 'LIMIT_EXCEEDED' });
});

test('identity responses keep the Content-Length integrity and early-cap checks', async () => {
  const truncated = [
    [{ 'content-length': '2' }, {}],
    [{ 'content-length': '2' }, { type: 'basic' }],
    [{ 'content-length': '2' }, { type: 'default' }],
    [{ 'content-length': '2', 'content-encoding': 'identity' }, { type: 'cors' }],
    // An empty coding list means no coding: the length still describes the body.
    [{ 'content-length': '2', 'content-encoding': '' }, { type: 'basic' }],
    [{ 'content-length': '2', 'content-encoding': '  ' }, {}],
  ];
  for (const [headers, options] of truncated) {
    const result = await request(reply([new Uint8Array([1])], headers, options));
    assert.deepEqual(result, { ok: false, error: 'ROUTE_UNAVAILABLE' }, JSON.stringify([headers, options]));
  }
  const oversized = reply([], { 'content-length': String(MAX_HTTP_BYTES + 1) }, { type: 'basic' });
  assert.deepEqual(await request(oversized), { ok: false, error: 'LIMIT_EXCEEDED' });
  const malformed = reply([new Uint8Array([1])], { 'content-encoding': 'gzip', 'content-length': '01' });
  assert.deepEqual(await request(malformed), { ok: false, error: 'LIMIT_EXCEEDED' });
});

test('errored encoded streams and aborts stay failures with no retry', async () => {
  let calls = 0;
  const errored = new BoundedHttpDriver(async () => {
    calls++;
    const body = new ReadableStream({
      start(c) { c.enqueue(new Uint8Array([1])); c.error(new TypeError('network error')); },
    });
    return { ok: true, redirected: false, url: URL_, headers: new Headers({ 'content-encoding': 'gzip' }), body };
  });
  assert.deepEqual(await errored.request(scope(), URL_), { ok: false, error: 'ROUTE_UNAVAILABLE' });
  assert.equal(calls, 1);
  const s = scope();
  const held = new BoundedHttpDriver(async () => {
    const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array([1])); s.abort(); } });
    return { ok: true, redirected: false, url: URL_, headers: new Headers({ 'content-encoding': 'gzip' }), body };
  });
  assert.deepEqual(await held.request(s, URL_), { ok: false, error: 'CANCELLED' });
  assert.equal(held.pending, 0);
});
