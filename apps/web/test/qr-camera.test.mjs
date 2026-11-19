import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraCapture } from '../src/qr/capture-controller.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function stream() { const tracks = [{ stops: 0, stop() { this.stops++; } }, { stops: 0, stop() { this.stops++; } }]; return { getTracks: () => tracks, tracks }; }

test('permission is an explicit action; cancellation holds physical admission across new owners and stops late tracks', async () => {
  const permission = deferred(), attached = []; let requests = 0;
  const a = createCameraCapture({ request: () => { requests++; return permission.promise; }, attach: value => attached.push(value), detach() {} });
  const b = createCameraCapture({ request: async () => stream(), attach() {}, detach() {} });
  assert.equal(requests, 0);
  const started = a.start(); assert.equal(requests, 1); a.dispose();
  assert.equal((await b.start()).code, 'BUSY');
  const late = stream(); permission.resolve(late);
  assert.equal((await started).code, 'CANCELLED'); assert.equal(attached.length, 0);
  assert.deepEqual(late.tracks.map(track => track.stops), [1, 1]);
  assert.equal((await b.start()).ok, true); b.dispose();
});

test('active cancellation stops every track, detaches preview and requires a new gesture', async () => {
  const active = stream(); let attached = 0, detached = 0;
  const capture = createCameraCapture({ request: async () => active, attach() { attached++; }, detach() { detached++; } });
  assert.equal((await capture.start()).ok, true); assert.equal(capture.getSnapshot().state, 'live');
  capture.cancel(); assert.deepEqual(active.tracks.map(track => track.stops), [1, 1]);
  assert.equal(attached, 1); assert.ok(detached >= 1); assert.equal(capture.getSnapshot().state, 'idle');
  capture.dispose();
});

test('a second mounted owner cannot open another camera while the original stream is live', async () => {
  const a = createCameraCapture({ request: async () => stream(), attach() {}, detach() {} });
  const b = createCameraCapture({ request: async () => stream(), attach() {}, detach() {} });
  try { assert.equal((await a.start()).ok, true); assert.equal((await b.start()).code, 'BUSY'); }
  finally { a.dispose(); b.dispose(); }
});

test('provider failures and attach failures are fixed errors and cannot leak a live stream', async () => {
  const denied = createCameraCapture({ request: async () => { throw Error('private device details'); }, attach() {}, detach() {} });
  assert.deepEqual(await denied.start(), { ok: false, code: 'CAMERA_UNAVAILABLE' }); denied.dispose();
  const active = stream();
  const broken = createCameraCapture({ request: async () => active, attach() { throw Error('private detail'); }, detach() { throw Error('cleanup'); } });
  assert.equal((await broken.start()).code, 'CAMERA_UNAVAILABLE');
  assert.deepEqual(active.tracks.map(track => track.stops), [1, 1]); broken.dispose();
});

test('synchronous revocation by a requesting-state observer prevents the native permission side effect', async () => {
  let requests = 0;
  const capture = createCameraCapture({ request: async () => { requests++; return stream(); }, attach() {}, detach() {} });
  capture.subscribe(() => { if (capture.getSnapshot().state === 'requesting') capture.cancel(); });
  assert.equal((await capture.start()).code, 'CANCELLED'); assert.equal(requests, 0); capture.dispose();
});
