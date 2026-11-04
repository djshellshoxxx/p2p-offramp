/** Finite actual ws receiver/close evaluation, never a production companion. */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync, readdirSync, lstatSync, realpathSync, readlinkSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { relative, resolve, dirname, isAbsolute, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { once } from 'node:events';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pins = JSON.parse(readFileSync(new URL('./pins.json', import.meta.url)));
const root = '/evaluation', modules = root + '/node_modules';
assert.equal(pins.format, 'p2p-public-sdk-evaluation-v1');
for (const [name, value] of Object.entries(pins.qualification)) assert.equal(value, name === 'publicFixtureOnly');
assert.equal(sha(pins.audit.utf8), pins.audit.sha256);
assert.ok(Object.values(JSON.parse(pins.audit.utf8).metadata.vulnerabilities).every(value => value === 0));
assert.equal(process.getuid(), 65534, 'public lab must be unprivileged');
assert.equal(readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(), '268435456');
assert.equal(readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(), '64');
assert.equal(readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim(), '100000 100000');
assert.ok(Object.values(networkInterfaces()).flat().every(address => address.internal), 'network-none has only loopback');
assert.equal(sha(readFileSync(root + '/package.json')), pins.packageSha256);
assert.equal(sha(readFileSync(root + '/package-lock.json')), pins.lockSha256);
const records = []; let bytes = 0, nodes = 0;
function walk(path, prefix = '', depth = 0) {
  assert.ok(depth <= 24 && ++nodes <= 16384); assert.equal(realpathSync(path), path);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    assert.ok(++nodes <= 16384); const name = prefix + entry.name, target = resolve(path, entry.name);
    if (entry.isDirectory()) { walk(target, name + '/', depth + 1); continue; }
    assert.ok(records.length < 8192);
    if (entry.isSymbolicLink()) {
      const link = readlinkSync(target), actual = realpathSync(target), rel = relative(modules, actual);
      assert.ok(dirname(name).split('/').at(-1) === '.bin' && !isAbsolute(link) && rel !== '..' && !rel.startsWith('..' + sep) && lstatSync(actual).isFile());
      records.push({ path: name, link });
    } else {
      const stat = lstatSync(target); assert.ok(stat.isFile() && stat.size <= 67108864);
      const data = readFileSync(target); bytes += data.length; assert.ok(bytes <= 402653184);
      records.push({ path: name, bytes: data.length, sha256: sha(data) });
    }
  }
}
walk(modules); records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
assert.deepEqual({ entries: records.length, regularFiles: records.filter(row => 'bytes' in row).length,
  symlinks: records.filter(row => 'link' in row).length, bytes, sha256: sha(JSON.stringify(records)) }, pins.installedTree);
assert.equal(sha(pins.registryKeys.utf8), pins.registryKeys.sha256);
const keys = JSON.parse(pins.registryKeys.utf8).keys;
const part = value => { const data = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([size, data]); };
for (const item of pins.packages) {
  assert.equal(JSON.parse(readFileSync(root + '/' + item.path + '/package.json')).version, item.version); let accepted = false;
  for (const signature of item.registrySignatures) {
    const record = keys.find(key => key.keyid === signature.keyid); if (!record) continue;
    const key = createPublicKey({ key: Buffer.from(record.key, 'base64'), format: 'der', type: 'spki' }), jwk = key.export({ format: 'jwk' });
    const wire = Buffer.concat([part('ecdsa-sha2-nistp256'), part('nistp256'), part(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]))]);
    assert.equal('SHA256:' + createHash('sha256').update(wire).digest('base64').replace(/=+$/, ''), record.keyid);
    const message = Buffer.from(`${item.name}@${item.version}:${item.integrity}`), signed = Buffer.from(signature.sig, 'base64');
    if (verify('sha256', message, key, signed)) {
      assert.equal(verify('sha256', Buffer.from('altered:' + message), key, signed), false);
      assert.equal(record.expires, item.signingKeyExpires); assert.equal(item.historicalSignatureOnly, record.expires !== null); accepted = true; break;
    }
  }
  assert.ok(accepted, item.name);
}
for (const file of pins.pinnedFiles) assert.equal(sha(readFileSync(modules + '/' + file.path)), file.sha256);
const { default: WebSocket, WebSocketServer, Receiver, Sender } = await import(modules + '/ws/wrapper.mjs');
const caps = Object.freeze({ maxPayload: 65536, maxFragments: 8, maxBufferedChunks: 8, perMessageDeflate: false });
const completed = [], policyClosures = [];
async function within(promise, label) {
  let timer; try { return await Promise.race([promise, new Promise((_, fail) => { timer = setTimeout(() => fail(Error(label)), 3000); })]); }
  finally { clearTimeout(timer); }
}
async function pair(overrides = {}) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, ...caps }), sockets = new Set(); let client, disposed = false;
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); });
  async function dispose() {
    if (disposed) return; disposed = true; const pending = [];
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.CLOSED) pending.push(within(new Promise(done => socket.once('close', done)), 'SOCKET_CLOSE_TIMEOUT'));
      try { socket.terminate(); } catch {}
    }
    const results = await Promise.allSettled(pending);
    const closing = await Promise.allSettled([within(new Promise(done => server.close(done)), 'SERVER_CLOSE_TIMEOUT')]);
    for (const socket of sockets) socket.removeAllListeners(); server.removeAllListeners();
    assert.ok(results.every(row => row.status === 'fulfilled') && closing.every(row => row.status === 'fulfilled'), 'owned cleanup completes');
    assert.equal(server.clients.size, 0);
  }
  try {
    await within(once(server, 'listening'), 'LISTEN_TIMEOUT'); const incoming = once(server, 'connection');
    client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { ...caps, ...overrides }); sockets.add(client); client.on('error', () => {});
    await within(once(client, 'open'), 'OPEN_TIMEOUT'); const [peer] = await within(incoming, 'CONNECTION_TIMEOUT');
    assert.equal(client.extensions, ''); assert.equal(peer.extensions, '');
    return { client, peer, server, dispose };
  } catch (error) { await dispose(); throw error; }
}
test('official receiver source is byte-exact to T50 and all fixed input/container gates ran', () => {
  assert.equal(pins.packages.length, 1); assert.equal(pins.packages[0].version, '8.22.1');
  assert.equal(sha(readFileSync(modules + '/ws/lib/receiver.js')), pins.sourceBindings[0].sha256); completed.push('fixed-public-provenance-and-container');
});
test('unchanged NIP01 messages arrive exactly through a real local WS pair, including65536 bytes', async () => {
  const p = await pair(); try {
    for (const value of [JSON.stringify(['EOSE', 't75-public']), JSON.stringify(['NOTICE', 'x'.repeat(65536 - Buffer.byteLength(JSON.stringify(['NOTICE', ''])))])]) {
      const incoming = once(p.client, 'message'); p.peer.send(value); const [actual, binary] = await within(incoming, 'MESSAGE_TIMEOUT');
      assert.equal(binary, false); assert.deepEqual(actual, Buffer.from(value)); assert.ok(actual.length <= 65536);
    }
    completed.push('unchanged-nip01-cap-boundary');
  } finally { await p.dispose(); }
});
test('a finite65537-byte normal local send is refused before any complete message publication', async () => {
  const p = await pair(); try {
    const delivered = [], errors = []; p.client.on('message', value => delivered.push(value)); p.client.on('error', error => errors.push(error.code));
    const closed = new Promise(done => p.client.once('close', code => done(code))), peerClosed = new Promise(done => p.peer.once('close', done)); p.peer.send('x'.repeat(65537));
    const localCode = await within(closed, 'CAP_CLOSE_TIMEOUT'), peerCode = await within(peerClosed, 'PEER_CAP_CLOSE_TIMEOUT');
    assert.equal(localCode, 1006); assert.equal(peerCode, 1009); assert.deepEqual(delivered, []);
    policyClosures.push({ policy: 'payload', localCode, peerCode });
    assert.ok(errors.includes('WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')); completed.push('payload-cap-refusal');
  } finally { await p.dispose(); }
});
test('actual continuation fragments obey an explicit finite fragment budget', async () => {
  for (const limit of [3, 2]) {
    const p = await pair({ maxFragments: limit }); try {
      const errors = [], delivered = []; p.client.on('error', error => errors.push(error.code)); p.client.on('message', value => delivered.push(value.toString()));
      const done = limit === 3 ? once(p.client, 'message') : new Promise(done => p.client.once('close', done));
      const peerClosed = limit === 2 ? new Promise(done => p.peer.once('close', done)) : null;
      p.peer.send('["NOTICE",', { fin: false }); p.peer.send('"public fragment"', { fin: false }); p.peer.send(']', { fin: true });
      const observed = await within(done, 'FRAGMENT_TIMEOUT');
      if (limit === 3) assert.equal(observed[0].toString(), '["NOTICE","public fragment"]');
      else {
        const peerCode = await within(peerClosed, 'PEER_FRAGMENT_CLOSE_TIMEOUT');
        assert.equal(observed, 1006); assert.equal(peerCode, 1008); assert.deepEqual(delivered, []); assert.ok(errors.includes('WS_ERR_TOO_MANY_BUFFERED_PARTS'));
        policyClosures.push({ policy: 'fragment', localCode: observed, peerCode });
      }
    } finally { await p.dispose(); }
  }
  completed.push('fragment-budget');
});
test('public Receiver rejects excess buffered chunks while a small valid frame is incomplete', async () => {
  const receiver = new Receiver({ isServer: false, binaryType: 'nodebuffer', maxPayload: 65536, maxFragments: 8, maxBufferedChunks: 2 });
  const published = []; receiver.on('message', value => published.push(value)); const failure = new Promise(done => receiver.once('error', done));
  try {
    const [header, payload] = Sender.frame(Buffer.from('["EOSE","public"]'), { fin: true, opcode: 1, mask: false, rsv1: false, readOnly: true });
    receiver.write(header); receiver.write(payload.subarray(0, 1)); receiver.write(payload.subarray(1, 2)); receiver.write(payload.subarray(2, 3));
    assert.equal((await within(failure, 'CHUNK_TIMEOUT')).code, 'WS_ERR_TOO_MANY_BUFFERED_PARTS'); assert.deepEqual(published, []); completed.push('buffered-chunk-budget');
  } finally { receiver.destroy(); }
});
test('closing during an incomplete message drains actual sockets without late complete delivery', async () => {
  const p = await pair(); try {
    const delivered = []; p.client.on('message', value => delivered.push(value)); p.peer.send('["NOTICE",', { fin: false });
    await new Promise(done => setImmediate(done)); const closed = new Promise(done => p.client.once('close', done)); p.client.close(1000, 'public test complete');
    assert.equal(await within(closed, 'CANCEL_CLOSE_TIMEOUT'), 1000); assert.equal(p.client.readyState, WebSocket.CLOSED);
    const late = await new Promise(done => p.peer.send('"late"]', { fin: true }, error => done(error))); assert.ok(late instanceof Error);
    assert.deepEqual(delivered, []); completed.push('close-incomplete-no-late-message');
  } finally { await p.dispose(); }
});
after(() => {
  console.log('PUBLIC_SDK_OBSERVATION ' + JSON.stringify({ profile: pins.profile, completed, policyClosures, unchangedNip01: true,
    compressionEnabled: false, companionOrG05Qualified: false, browserPreassemblyBoundQualified: false, wholeProcessOrNativeBufferProof: false,
    productionProvider: false, releaseEnabled: false, installedTreeSha256: pins.installedTree.sha256 }));
});
