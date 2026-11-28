import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { parseRuntimeCommand } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { startAppServices } from '../src/app-services.ts';
import { capturePendingMetadata } from '../src/runtime/pending-metadata.ts';
const passphrase = 'local template runtime synthetic passphrase';
const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const change = { kind: 'put-template', slot: 0, defaults }, consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const live = [], clone = value => structuredClone(value);
let previousSecure;
beforeEach(() => { previousSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'); Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true }); });
afterEach(async () => { for (const item of live.splice(0).reverse()) await item.dispose(); if (previousSecure) Object.defineProperty(globalThis, 'isSecureContext', previousSecure); else delete globalThis.isSecureContext; });
class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.(); if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw Object.assign(Error('CONFLICT'), { code: 'CONFLICT' });
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}
class Port extends EventTarget {
  commands = []; held = []; hold = null; terminated = false;
  constructor(storage) {
    super(); this.vault = new EncryptedVaultService(storage, crypto, { lifecycle: false }); this.backup = new EncryptedBackupService(storage);
    this.endpoint = createVaultWorkerEndpoint(message => {
      if (message.operation === this.hold) {
        this.held.push(message);
        this.dispatchEvent(new Event('acknowledgement-held'));
      } else {
        this.reply(message);
      }
    }, { createServices: () => ({ vault: this.vault, backup: this.backup }) });
  }
  reply(message) { this.dispatchEvent(new MessageEvent('message', { data: clone(message) })); }
  postMessage(command) { this.commands.push(clone(command)); void this.endpoint.dispatch(clone(command)); }
  release() { this.hold = null; for (const message of this.held.splice(0)) this.reply(message); }
  terminate() { this.terminated = true; this.endpoint.dispose(); }
  dispose() { this.terminate(); }
}
const good = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
async function setup() {
  const storage = new Store(), port = new Port(storage); live.push(port);
  const services = good(await startAppServices({ createWorker: () => port, lifecycle: false })); live.push(services);
  const { profileId } = good(await services.create(passphrase)); return { storage, port, services, profileId };
}
test('document facade composes all four purpose commands through real native Worker and binds selected profile without exposing handles', async () => {
  const { services, storage, port, profileId } = await setup(); const initial = good(await services.loadTradeTemplates()); assert.equal(initial.revision, 0);
  const preview = good(await services.previewTradeTemplateChange(0, change)); assert.equal(storage.writes, 1);
  good(await services.cancelTradeTemplateChange()); assert.equal((await services.commitTradeTemplateChange(preview.previewId, 0, consent)).ok, false);
  const next = good(await services.previewTradeTemplateChange(0, change)); good(await services.commitTradeTemplateChange(next.previewId, 0, consent));
  assert.deepEqual(good(await services.loadTradeTemplates()).library.templates, [{ slot: 0, defaults }]);
  for (const command of port.commands.filter(command => /TradeTemplate/.test(command.operation))) assert.equal(command.profileId, profileId);
  assert.deepEqual(Object.keys(services.getSnapshot()), ['state']); assert.equal('handle' in services, false); assert.equal('vault' in services, false);
});
test('pending template metadata retains no defaults, preview identity, consent or instruction data', () => {
  for (const [operation, fields] of [['loadTradeTemplates', {}], ['previewTradeTemplateChange', { expectedRevision: 0, change }],
    ['commitTradeTemplateChange', { expectedRevision: 0, previewId: 'b'.repeat(32), consent }], ['cancelTradeTemplateChange', {}]]) {
    const command = parseRuntimeCommand({ version: 1, requestId: 1, generation: 2, operation, profileId: 'a'.repeat(32), ...fields });
    assert.deepEqual(capturePendingMetadata(command), { operation, generation: 2, profileId: 'a'.repeat(32) }); assert.ok(Object.isFrozen(capturePendingMetadata(command)));
  }
});
test('lock retires held load, preview and durable commit acknowledgements; explicit reopen reconciles the committed case', { timeout: 30000 }, async () => {
  for (const operation of ['loadTradeTemplates', 'previewTradeTemplateChange', 'commitTradeTemplateChange']) {
    const s = await setup(); let preview;
    if (operation === 'commitTradeTemplateChange') preview = good(await s.services.previewTradeTemplateChange(0, change));
    s.port.hold = operation;
    const held = once(s.port, 'acknowledgement-held');
    const pending = operation === 'loadTradeTemplates' ? s.services.loadTradeTemplates() : operation === 'previewTradeTemplateChange'
      ? s.services.previewTradeTemplateChange(0, change) : s.services.commitTradeTemplateChange(preview.previewId, 0, consent);
    await held;
    assert.equal(s.port.held[0].operation, operation);
    assert.equal(s.port.held.length, 1); good(await s.services.lock()); s.port.release(); const stale = await pending;
    assert.equal(stale.ok, false); assert.equal(stale.error.code, 'LOCKED'); assert.equal(s.services.current.state, 'locked');
    good(await s.services.unlock(s.profileId, passphrase)); const actual = good(await s.services.loadTradeTemplates());
    assert.equal(actual.library.templates.length, operation === 'commitTradeTemplateChange' ? 1 : 0);
  }
});
test('invalid template consent and accessors are refused in document parsing before posting to the native Worker', async () => {
  const s = await setup(), preview = good(await s.services.previewTradeTemplateChange(0, change)), count = s.port.commands.length;
  let invoked = 0; const hostile = { ...consent }; Object.defineProperty(hostile, 'reviewed', { enumerable: true, get() { invoked++; return true; } });
  const rejected = await s.services.commitTradeTemplateChange(preview.previewId, 0, hostile);
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'INVALID_INPUT'); assert.equal(invoked, 0); assert.equal(s.port.commands.length, count);
  good(await s.services.commitTradeTemplateChange(preview.previewId, 0, consent));
});
