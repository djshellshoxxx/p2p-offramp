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
  console.log('PUBLIC_SDK_OBSERVATION ' + JSON.stringify({ profile: pins.profile, completed, attempted,
    publicFunctionsOnly: true, fullSdkClientConstructed: false, sdkCloseQualified: false, sessionOrCallbackAuthenticated: false,
    productionProvider: false, releaseEnabled: false, historicalRegistryAssertions: pins.packages.filter(item => item.historicalSignatureOnly).length,
    installedTreeSha256: pins.installedTree.sha256 }));
});
const sdk = await import(modules + '/@walletconnect/utils/dist/index.js');
const account = 'eip155:1:0x' + '11'.repeat(20);
const approved = { eip155: { accounts: [account], methods: ['eth_chainId'], events: ['chainChanged'] } };
const required = { eip155: { chains: ['eip155:1'], methods: ['eth_chainId'], events: ['chainChanged'] } };
test('official source maps match T50 and historical signing evidence remains explicitly unadopted', () => {
  assert.equal(pins.packages.length, 69); assert.equal(pins.packages.filter(item => item.historicalSignatureOnly).length, 33);
  const map = JSON.parse(readFileSync(modules + '/@walletconnect/utils/dist/index.cjs.map'));
  for (const row of pins.sourceBindings) {
    const source = map.sourcesContent[map.sources.indexOf(row.sourceMapPath)]; assert.equal(Buffer.byteLength(source), row.bytes); assert.equal(sha(source), row.sha256);
  }
  assert.equal(pins.packages.find(item => item.name === 'uint8arrays' && item.version === '3.1.1').license.missingFullLicenseText, true);
  assert.equal(pins.packages.find(item => item.name === '@walletconnect/utils').license.declared, 'SEE LICENSE IN LICENSE.md');
  completed.push('source-license-historical-signature-provenance');
});
test('actual namespace helpers preserve agreed read permissions and reject missing chains or methods', () => {
  assert.equal(sdk.isValidNamespaces(approved, 'public-evaluation'), null);
  assert.equal(sdk.isConformingNamespaces(required, approved, 'public-evaluation'), null);
  assert.deepEqual(sdk.getAccountsChains(approved.eip155.accounts), ['eip155:1']);
  assert.deepEqual(sdk.getNamespacesMethodsForChainId(approved, 'eip155:1'), ['eth_chainId']);
  assert.equal(sdk.isValidNamespacesChainId(approved, 'eip155:1'), true);
  assert.equal(sdk.isValidNamespacesChainId(approved, 'eip155:2'), false);
  assert.equal(sdk.isValidNamespacesRequest(approved, 'eip155:1', 'eth_chainId'), true);
  assert.equal(sdk.isValidNamespacesRequest(approved, 'eip155:1', 'personal_sign'), false);
  assert.equal(sdk.isValidNamespacesRequest(approved, 'eip155:2', 'eth_chainId'), false);
  for (const changed of [{ ...approved.eip155, methods: [] }, { ...approved.eip155, events: [] },
    { ...approved.eip155, accounts: ['eip155:2:0x' + '11'.repeat(20)] }]) {
    assert.notEqual(sdk.isConformingNamespaces(required, { eip155: changed }, 'public-evaluation'), null);
  }
  assert.notEqual(sdk.isValidNamespaces({ eip155: { ...approved.eip155, accounts: ['not-a-caip-account'] } }, 'public-evaluation'), null);
  completed.push('actual-namespace-agreement-and-refusals');
});
test('account syntax and namespace compatibility do not establish account ownership or a live authenticated session', () => {
  const anotherAccount = { eip155: { ...approved.eip155, accounts: ['eip155:1:0x' + '22'.repeat(20)] } };
  assert.equal(sdk.isValidNamespaces(anotherAccount, 'public-evaluation'), null);
  assert.equal(sdk.isConformingNamespaces(required, anotherAccount, 'public-evaluation'), null);
  assert.equal(sdk.isSessionStruct({ topic: 'PUBLIC_SYNTHETIC_TOPIC' }), 'PUBLIC_SYNTHETIC_TOPIC', 'this helper is topic-presence only');
  assert.equal(sdk.isSessionCompatible({ topic: 'PUBLIC_SYNTHETIC_TOPIC', expiry: 1, namespaces: approved }, { requiredNamespaces: required }), true,
    'namespace compatibility alone does not enforce session expiry');
  completed.push('limited-predicates-never-session-authentication');
});
test('actual expiry helpers distinguish seconds from milliseconds and obey explicit finite bounds', () => {
  const now = Date.now; Date.now = () => 1700000000000;
  try {
    assert.equal(sdk.calcExpiry(30, 1700000000000), 1700000030);
    assert.equal(sdk.isExpired(1699999999), true); assert.equal(sdk.isExpired(1700000000), true); assert.equal(sdk.isExpired(1700000001), false);
    const syntheticBounds = { min: 10, max: 60 };
    for (const value of [10, 30, 60]) assert.equal(sdk.isValidRequestExpiry(value, syntheticBounds), true);
    for (const value of [9, 61, NaN, Infinity, '30']) assert.equal(sdk.isValidRequestExpiry(value, syntheticBounds), false);
  } finally { Date.now = now; }
  completed.push('native-expiry-units-and-boundaries');
});
test('actual URI fields preserve the stronger full application roundtrip requirement without launching', () => {
  // Literal public dummy material only. A real pairing URI/symmetric key must never enter diagnostics.
  const parameters = { protocol: 'wc', topic: '11'.repeat(32), version: 2, relay: { protocol: 'irn' },
    symKey: '00'.repeat(32), methods: ['eth_chainId'], expiryTimestamp: Math.floor(Date.now() / 1000) + 300 };
  const encoded = sdk.formatUri(parameters), decoded = sdk.parseUri(encoded);
  assert.ok(encoded.startsWith('wc:' + parameters.topic + '@2?')); assert.ok(encoded.length < 512);
  for (const key of ['topic', 'version', 'symKey', 'methods', 'expiryTimestamp']) assert.deepEqual(decoded[key], parameters[key]);
  assert.deepEqual(decoded.relay, parameters.relay);
  // Upstream's own parseUri tests omit this field; its implementation strips wc.
  // Preserve this stronger application expectation as a visible unsupported result.
  assert.equal(decoded.protocol, parameters.protocol, 'stronger application URI protocol roundtrip; SDK helper alone is insufficient');
  completed.push('actual-public-uri-roundtrip-no-launch');
});
