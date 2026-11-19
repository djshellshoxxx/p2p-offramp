import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectQrImage, boundedDecodeDimensions } from '../src/qr/image-header.ts';
import { createQrDecodeClient } from '../src/qr/decode-client.ts';

function png(width = 320, height = 240, extra = []) {
  const chunk = (type, data) => { const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4); out.set(data, 8); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...extra.map(type => chunk(type, Buffer.alloc(0))), chunk('IDAT', Buffer.from([0])), chunk('IEND', Buffer.alloc(0))]));
}
function jpeg(width = 320, height = 240) {
  return new Uint8Array([255, 216, 255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 17, 0,
    255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 1, 255, 0, 1, 255, 217]);
}
const refuses = (bytes, code) => assert.throws(() => inspectQrImage(bytes), error => error.code === code);

test('image preflight bounds dimensions and complete container before native decompression', () => {
  assert.deepEqual(inspectQrImage(png()), { format: 'png', width: 320, height: 240 });
  assert.deepEqual(inspectQrImage(jpeg()), { format: 'jpeg', width: 320, height: 240 });
  refuses(png(4096, 4096), 'IMAGE_TOO_LARGE'); refuses(png(0, 10), 'IMAGE_FORMAT');
  refuses(png(320, 240, ['acTL']), 'IMAGE_FORMAT');
  refuses(png().slice(0, -1), 'IMAGE_FORMAT');
  refuses(new TextEncoder().encode('<svg><script/></svg>'), 'IMAGE_FORMAT');
  refuses(new Uint8Array(2 * 1024 * 1024 + 1), 'IMAGE_TOO_LARGE');
  refuses(jpeg().slice(0, -2), 'IMAGE_FORMAT');
  const forged = png(); new DataView(forged.buffer).setUint32(33, 0xfffffff0); refuses(forged, 'IMAGE_FORMAT');
  const size = boundedDecodeDimensions(1600, 1200);
  assert.ok(size.width * size.height <= 1_000_000 && Math.max(size.width, size.height) <= 1024);
});

test('decoder physical job is terminated on timeout/cancel and late replies cannot cross generations', async () => {
  const workers = [], timers = [];
  const makeWorker = () => {
    const listeners = new Map();
    const worker = { terminated: false, sent: [], addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type),
      postMessage(value) { this.sent.push(value); }, terminate() { this.terminated = true; }, reply(value) { listeners.get('message')?.({ data: value }); } };
    workers.push(worker); return worker;
  };
  const client = createQrDecodeClient({ makeWorker, schedule: callback => { timers.push(callback); return timers.length; }, clear() {} });
  const first = client.decode({ width: 20, height: 20, pixels: new Uint8ClampedArray(1600) });
  assert.equal((await client.decode({ width: 20, height: 20, pixels: new Uint8ClampedArray(1600) })).code, 'BUSY');
  timers[0](); assert.equal((await first).code, 'DECODE_TIMEOUT'); assert.equal(workers[0].terminated, true);
  const second = client.decode({ width: 20, height: 20, pixels: new Uint8ClampedArray(1600) });
  workers[0].reply({ id: 1, ok: true, text: 'late' });
  client.cancel(); assert.equal((await second).code, 'CANCELLED'); assert.equal(workers[1].terminated, true);
  client.dispose();
});

test('decoder refuses inconsistent pixel dimensions before posting and validates reply identifiers', async () => {
  let posts = 0, listener;
  const worker = { addEventListener(type, callback) { if (type === 'message') listener = callback; }, removeEventListener() {}, postMessage() { posts++; }, terminate() {} };
  const client = createQrDecodeClient({ makeWorker: () => worker });
  assert.equal((await client.decode({ width: 2000, height: 2000, pixels: new Uint8ClampedArray(4) })).code, 'IMAGE_TOO_LARGE');
  assert.equal(posts, 0);
  const pending = client.decode({ width: 20, height: 20, pixels: new Uint8ClampedArray(1600) });
  listener({ data: { id: 999, ok: true, text: 'wrong request' } });
  assert.equal((await pending).code, 'DECODER_PROTOCOL'); client.dispose();
});
