/** Fixed actual public codec/helper evaluation; no provider/session/application authority. */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync, readdirSync, lstatSync, realpathSync, readlinkSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { relative, resolve, dirname, isAbsolute, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createRequire, syncBuiltinESMExports } from 'node:module';

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

// Instrument attempts before importing the actual SDK; no successful network/Worker stub.
const require = createRequire(import.meta.url), net = require('node:net'), workers = require('node:worker_threads');
const native = { connect: net.Socket.prototype.connect, Worker: workers.Worker, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, WorkerGlobal: globalThis.Worker };
const attempted = { socket: 0, workerThread: 0, fetch: 0, browserWebSocket: 0, browserWorker: 0 };
net.Socket.prototype.connect = function () { attempted.socket++; throw Error('PUBLIC_EVALUATION_NETWORK_FORBIDDEN'); };
workers.Worker = class { constructor() { attempted.workerThread++; throw Error('PUBLIC_EVALUATION_WORKER_FORBIDDEN'); } };
globalThis.fetch = () => { attempted.fetch++; throw Error('PUBLIC_EVALUATION_FETCH_FORBIDDEN'); };
globalThis.WebSocket = class { constructor() { attempted.browserWebSocket++; throw Error('PUBLIC_EVALUATION_WS_FORBIDDEN'); } };
globalThis.Worker = class { constructor() { attempted.browserWorker++; throw Error('PUBLIC_EVALUATION_WORKER_FORBIDDEN'); } };
syncBuiltinESMExports();
const completed = [];
after(() => {
  net.Socket.prototype.connect = native.connect; workers.Worker = native.Worker;
  globalThis.fetch = native.fetch; globalThis.WebSocket = native.WebSocket; globalThis.Worker = native.WorkerGlobal; syncBuiltinESMExports();
  assert.ok(Object.values(attempted).every(value => value === 0), 'actual import/helper calls attempted no intercepted network or Worker construction');
  console.log('PUBLIC_SDK_OBSERVATION ' + JSON.stringify({ profile: pins.profile, completed, attempted, integerObservations,
    publicFunctionsOnly: true, fullSdkClientConstructed: false, sdkCloseQualified: false, sessionOrCallbackAuthenticated: false,
    productionProvider: false, releaseEnabled: false, historicalRegistryAssertions: pins.packages.filter(item => item.historicalSignatureOnly).length,
    installedTreeSha256: pins.installedTree.sha256 }));
});
const sdk = await import(modules + '/@waku/proto/dist/index.js');
const message = sdk.proto_message.WakuMessage, store = sdk.proto_store, push = sdk.proto_lightpush;
const integerObservations = [];
test('six-package audited proto graph and generated sources match the T50 snapshot', () => {
  assert.equal(pins.packages.length, 6);
  for (const row of pins.sourceBindings) {
    const bytes = readFileSync(modules + '/' + row.installedPath); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  }
  completed.push('source-artifact-provenance');
});
test('actual WakuMessage matches independent literal field bytes and preserves optional values', () => {
  const fixture = { payload: Uint8Array.of(1, 2), contentTopic: 't75', version: 1, timestamp: -1n,
    meta: Uint8Array.of(3), rateLimitProof: { proof: Uint8Array.of(4) }, ephemeral: true };
  const expected = Buffer.from('0a0201021203743735180150015a0103aa01030a0104f80101', 'hex');
  const encoded = message.encode(fixture); assert.deepEqual(Buffer.from(encoded), expected);
  const decoded = message.decode(expected); assert.deepEqual(Buffer.from(decoded.payload), Buffer.from(fixture.payload)); assert.equal(decoded.contentTopic, 't75');
  assert.equal(decoded.version, 1); assert.equal(decoded.timestamp, -1n); assert.equal(decoded.ephemeral, true);
  assert.deepEqual(Buffer.from(decoded.meta), Buffer.from(fixture.meta)); assert.deepEqual(Buffer.from(decoded.rateLimitProof.proof), Buffer.from([4]));
  assert.deepEqual(Buffer.from(message.encode({ version: 0, timestamp: 0n, ephemeral: false })), Buffer.from('18005000f80100', 'hex'));
  completed.push('independent-message-wire-fields');
});
const signedIntegerFixtures = [
  {
    "timestamp": "-9223372036854775808",
    "wireHex": "0a0101120a7437352f7075626c6963180050ffffffffffffffffff01"
  },
  {
    "timestamp": "9223372036854775807",
    "wireHex": "0a0101120a7437352f7075626c6963180050feffffffffffffffff01"
  },
  {
    "timestamp": "-1700000000000000000",
    "wireHex": "0a0101120a7437352f7075626c6963180050ffffcfe2c6bfce972f"
  },
  {
    "timestamp": "1700000000000000000",
    "wireHex": "0a0101120a7437352f7075626c69631800508080d0e2c6bfce972f"
  },
  {
    "timestamp": "-1",
    "wireHex": "0a0101120a7437352f7075626c696318005001"
  },
  {
    "timestamp": "0",
    "wireHex": "0a0101120a7437352f7075626c696318005000"
  },
  {
    "timestamp": "1",
    "wireHex": "0a0101120a7437352f7075626c696318005002"
  }
];
for (const fixture of signedIntegerFixtures) test('actual sint64 codec matches independent oracle' + fixture.timestamp, () => {
  const timestamp = BigInt(fixture.timestamp), input = { payload: Uint8Array.of(1), contentTopic: 't75/public', version: 0, timestamp };
  const encoded = message.encode(input), expected = Buffer.from(fixture.wireHex, 'hex');
  const decoded = message.decode(encoded).timestamp, decodedOracle = message.decode(expected).timestamp;
  integerObservations.push({ field: 'timestamp', input: fixture.timestamp, encodedHex: Buffer.from(encoded).toString('hex'), oracleHex: fixture.wireHex, decoded: String(decoded), decodedOracle: String(decodedOracle), matches: decoded === timestamp && decodedOracle === timestamp && Buffer.from(encoded).equals(expected) });
  assert.deepEqual(Buffer.from(encoded), expected, 'independent normative sint64 wire bytes');
  assert.equal(decodedOracle, timestamp, 'independent oracle wire decodes exactly');
  assert.equal(decoded, timestamp, 'normative sint64 expectation is preserved');
});
test('actual uint64 Store limit roundtrips its valid maximum', () => {
  const value = (1n << 64n) - 1n, decoded = store.StoreQueryRequest.decode(store.StoreQueryRequest.encode({ requestId: 't75', paginationLimit: value })).paginationLimit;
  integerObservations.push({ field: 'paginationLimit', input: String(value), decoded: String(decoded), matches: decoded === value });
  assert.equal(decoded, value, 'normative uint64 expectation is preserved');
});
test('ordinary Store fields preserve bytes/bigints while wire limits supply no application consent', () => {
  const query = { requestId: 't75', includeData: true, pubsubTopic: '/synthetic/t75', contentTopics: ['t75'],
    timeStart: -1n, timeEnd: 10n, messageHashes: [new Uint8Array(32).fill(7)],
    paginationCursor: new Uint8Array(32).fill(8), paginationForward: true, paginationLimit: 100n };
  const decoded = store.StoreQueryRequest.decode(store.StoreQueryRequest.encode(query)); assert.deepEqual(decoded, query);
  assert.equal(store.StoreQueryRequest.decode(store.StoreQueryRequest.encode({ requestId: 't75', paginationLimit: 101n })).paginationLimit, 101n,
    'wire integer alone does not impose the application100-message consent cap');
  completed.push('ordinary-store-fields-and-uncapped-wire-limit');
});
test('actual Store decoder enforces its explicit repeated-field count limits', () => {
  const wire = store.StoreQueryResponse.encode({ requestId: 't75', statusCode: 200,
    messages: Array.from({ length: 101 }, () => ({ pubsubTopic: '/synthetic/t75' })) });
  assert.ok(wire.length < 32768); assert.equal(store.StoreQueryResponse.decode(wire).messages.length, 101);
  assert.throws(() => store.StoreQueryResponse.decode(wire, { limits: { messages: 100 } }));
  const allowed = store.StoreQueryResponse.encode({ requestId: 't75', messages: Array.from({ length: 100 }, () => ({})) });
  assert.equal(store.StoreQueryResponse.decode(allowed, { limits: { messages: 100 } }).messages.length, 100);
  const topics = store.StoreQueryRequest.encode({ requestId: 't75', contentTopics: ['a', 'b', 'c'] });
  assert.equal(store.StoreQueryRequest.decode(topics).contentTopics.length, 3);
  assert.throws(() => store.StoreQueryRequest.decode(topics, { limits: { contentTopics: 2 } }));
  completed.push('actual-store-decoder-count-limits');
});
test('small truncated bytes refuse, while protobuf defaults do not authenticate an application message', () => {
  assert.throws(() => message.decode(Uint8Array.of(0x0a, 5, 1)));
  assert.throws(() => store.StoreQueryRequest.decode(Uint8Array.of(0x0a, 0x80)));
  assert.equal(message.encode({}).length, 0); const empty = message.decode(new Uint8Array());
  assert.equal(empty.payload.length, 0); assert.equal(empty.contentTopic, ''); assert.equal(empty.version, undefined);
  completed.push('truncation-and-nonauthoritative-defaults');
});
test('both published LightPush response codecs roundtrip bytes without remote delivery evidence', () => {
  const response = { isSuccess: true, info: 'public synthetic peer response', statusCode: 200, relayPeerCount: 1 };
  assert.deepEqual(push.PushResponse.decode(push.PushResponse.encode(response)), response);
  const v3 = { requestId: 't75', statusCode: 200, statusDesc: 'public synthetic peer response', relayPeerCount: 1 };
  assert.deepEqual(push.LightPushResponseV3.decode(push.LightPushResponseV3.encode(v3)), v3);
  completed.push('lightpush-byte-semantics-only');
});
