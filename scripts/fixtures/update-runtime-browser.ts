/** Current-source native composition qualification only. The vault Worker and
 * encrypted IndexedDB are real; HTTP bytes, floor, wallet, gesture and destination
 * are controlled fixture ports. No production trust or navigation is installed. */
import { startAppServices } from '../../apps/web/src/app-services.ts';
import type { RuntimeWorkerPort } from '../../apps/web/src/runtime/app-runtime.ts';
import { parseVaultEnvelope, type RuntimeCommand, type RuntimeMessage, type RuntimeOperation,
  type RuntimeResponse, type RuntimeResult, type VaultEnvelopeV1 } from '../../packages/schemas/index.ts';
import { SessionTransportPolicy, type TrustedTransportRegistryCapability } from '../../packages/transport/src/policy.ts';
import { createAssetUpdateController, type AssetUpdateController } from '../../packages/security/src/release-update.ts';
import type { AcceptedRelease } from '../../packages/security/src/release-update-store.ts';
import { AttemptLedger } from './update-attempts.ts';

export const UPDATE_RUNTIME_SCENARIOS = ['missing-proof', 'verified', 'persisted-mutation',
  'held-own-lock', 'cancel-held-lock', 'competing-opening'] as const;
type Scenario = typeof UPDATE_RUNTIME_SCENARIOS[number];
type Acceptance = Awaited<ReturnType<AssetUpdateController['acceptUpdate']>>;
export interface PublicReleaseCorpus {
  readonly key: JsonWebKey; readonly keyId: string; readonly cid: string; readonly sequence: number;
  readonly locator: readonly number[]; readonly locatorEnvelope: readonly number[];
  readonly manifest: readonly number[]; readonly manifestEnvelope: readonly number[];
  readonly assets: readonly { readonly path: string; readonly bytes: readonly number[] }[];
}
const PASSPHRASE = 'synthetic native update runtime backup passphrase';
function check(value: unknown, label: string): asserts value { if (!value) throw Error('UPDATE_RUNTIME_' + label); }
function value<T>(result: RuntimeResult<T>): T { check(result.ok, result.ok ? 'RESULT' : result.error.code); return result.value; }
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const turn = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const digest = async (bytes: Uint8Array): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(byte => byte.toString(16).padStart(2, '0')).join('');

interface HeldResponse {
  readonly operation: RuntimeOperation;
  identity: { readonly requestId: number; readonly generation: number } | null;
  message: RuntimeResponse | null;
  readonly seen: Promise<RuntimeResponse>;
  observe(message: RuntimeResponse): void;
}

/** A delivery wrapper around one actual module Worker. It forwards original
 * command objects and response data without replacing, constructing or approving
 * protocol responses. Only selected genuine response delivery can be delayed. */
class NativeWorkerPort extends EventTarget implements RuntimeWorkerPort {
  readonly native: Worker;
  readonly events: string[] = [];
  readonly errors: string[] = [];
  readonly held = new Set<HeldResponse>();
  terminated = false;
  received = 0;
  constructor(readonly url: string) {
    super();
    this.native = new Worker(url, { type: 'module' });
    this.native.addEventListener('message', this.receive);
    this.native.addEventListener('error', this.error);
    this.native.addEventListener('messageerror', this.messageError);
  }
  private event(label: string): void { check(this.events.length < 256, 'EVENT_BOUND'); this.events.push(label); }
  postMessage(command: RuntimeCommand): void {
    this.event('request:' + command.operation);
    const gate = [...this.held].find(item => item.operation === command.operation && item.identity === null);
    if (gate) gate.identity = { requestId: command.requestId, generation: command.generation };
    this.native.postMessage(command);
  }
  private receive = (event: MessageEvent<RuntimeMessage>): void => {
    const message = event.data; this.received++;
    if (message.kind === 'response') {
      const gate = [...this.held].find(item => item.operation === message.operation &&
        item.identity?.requestId === message.requestId && item.identity.generation === message.generation);
      if (gate) { check(gate.message === null, 'DUPLICATE_HELD_RESPONSE'); gate.message = message; gate.observe(message); return; }
    }
    this.deliver(message);
  };
  private error = (): void => { this.errors.push('WORKER_ERROR'); this.dispatchEvent(new Event('error')); };
  private messageError = (): void => { this.errors.push('WORKER_MESSAGE_ERROR'); this.dispatchEvent(new Event('messageerror')); };
  private deliver(message: RuntimeMessage): void {
    if (message.kind === 'response') this.event('ack:' + message.operation);
    // Re-dispatching the original native Event while it is being dispatched is
    // invalid. This delivery event retains the exact native message data.
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }
  holdNext(operation: RuntimeOperation) {
    check(this.held.size < 2, 'HELD_RESPONSE_BOUND');
    check(![...this.held].some(item => item.operation === operation), 'DUPLICATE_RESPONSE_GATE');
    let observe!: (message: RuntimeResponse) => void;
    const seen = new Promise<RuntimeResponse>(resolve => { observe = resolve; });
    const gate: HeldResponse = { operation, identity: null, message: null, seen, observe };
    this.held.add(gate);
    return { seen, release: (afterDelivery: () => void = () => {}) => {
      check(this.held.has(gate) && gate.message !== null, 'ACTUAL_RESPONSE_REQUIRED');
      this.held.delete(gate); this.deliver(gate.message); afterDelivery();
    } };
  }
  releaseAll(): void {
    const gates = [...this.held]; this.held.clear();
    for (const gate of gates) if (gate.message) this.deliver(gate.message);
  }
  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.native.removeEventListener('message', this.receive);
    this.native.removeEventListener('error', this.error);
    this.native.removeEventListener('messageerror', this.messageError);
    this.native.terminate();
  }
}

/** Read the committed native row through an independent, read-only connection.
 * Return public revision/identity and a ciphertext hash, never private records. */
async function encryptedRow(profileId: string) {
  const row = await new Promise<VaultEnvelopeV1>((resolve, reject) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(Error('UPDATE_RUNTIME_MISSING_DATABASE')); };
    request.onerror = () => reject(Error('UPDATE_RUNTIME_DATABASE_OPEN'));
    request.onblocked = () => reject(Error('UPDATE_RUNTIME_DATABASE_BLOCKED'));
    request.onsuccess = () => {
      const db = request.result;
      let transaction: IDBTransaction | undefined;
      try {
        const tx = db.transaction('vaults', 'readonly'); transaction = tx;
        let result: VaultEnvelopeV1 | undefined;
        tx.oncomplete = () => { db.close(); result ? resolve(result) : reject(Error('UPDATE_RUNTIME_MISSING_ROW')); };
        tx.onerror = tx.onabort = () => { db.close(); reject(Error('UPDATE_RUNTIME_DATABASE_READ')); };
        const get = tx.objectStore('vaults').get(profileId);
        get.onsuccess = () => { try { result = parseVaultEnvelope(get.result); } catch { tx.abort(); } };
      } catch {
        try { transaction?.abort(); } catch { /* The failed transaction may already be inactive. */ }
        db.close(); reject(Error('UPDATE_RUNTIME_DATABASE_READ'));
      }
    };
  });
  check(row.profileId === profileId && row.wrappedKey.cipher === 'AES-256-GCM' && row.snapshot.ciphertext.length > 0, 'ENCRYPTED_ROW');
  const serialized = JSON.stringify(row);
  check(!serialized.includes(PASSPHRASE), 'NO_PLAINTEXT_PASSPHRASE');
  return { profileId: row.profileId, keyId: row.keyId, revision: row.revision,
    envelopeSha256: await digest(new TextEncoder().encode(serialized)), encrypted: true as const };
}

async function world(workerUrl: string, corpus: PublicReleaseCorpus) {
  const worker = new NativeWorkerPort(workerUrl);
  const started = await startAppServices({ createWorker: () => worker });
  if (!started.ok) { worker.terminate(); throw Error('UPDATE_RUNTIME_' + started.error.code); }
  const services = started.value, events = worker.events;
  const destination = `https://${corpus.cid}.ipfs.fixture.test/`;
  const endpoints = new Map<string, string>(), payloads = new Map<string, Uint8Array>();
  const endpoint = (id: string, url: string, bytes: readonly number[]) => {
    endpoints.set(id, url); payloads.set(url, new Uint8Array(bytes)); return { endpointId: id, url };
  };
  const locator = endpoint('locator', 'https://updates.fixture.test/locator', corpus.locator);
  const locatorEnvelope = endpoint('locator-envelope', 'https://updates.fixture.test/locator-envelope', corpus.locatorEnvelope);
  const manifest = endpoint('manifest', destination + 'release.json', corpus.manifest);
  const manifestEnvelope = endpoint('manifest-envelope', destination + 'release-envelope.json', corpus.manifestEnvelope);
  const assets = corpus.assets.map((asset, index) => endpoint('asset-' + index, destination + asset.path, asset.bytes));
  const state: { stored: AcceptedRelease | null; floorWrites: number; walletHeld: boolean; walletConnected: boolean;
    disconnects: number; releases: number; destinations: string[]; fetches: number; afterAdvance: () => Promise<void> } = {
    stored: null, floorWrites: 0, walletHeld: false, walletConnected: true, disconnects: 0,
    releases: 0, destinations: [], fetches: 0, afterAdvance: async () => {},
  };
  const registry: TrustedTransportRegistryCapability = {
    inspect: () => ({ channel: 'update', coverage: 'direct', adapterId: 'fixture', expiresAt: 1_000_000 }),
    subscribeInvalidation: () => () => {},
    capture(request, owner) {
      const url = endpoints.get(request.endpointId); if (!url) return null;
      return { owner, current: candidate => candidate === owner,
        snapshot: () => ({ version: 1, request, endpoint: { id: request.endpointId, channel: 'update', url,
          adapterId: 'fixture', methods: ['read'] }, evidence: this.inspect('update'), directConsent: true }),
        subscribeInvalidation: () => () => {}, dispose() {} };
    },
  };
  const transport = new SessionTransportPolicy({ trustedRegistry: registry, now: () => 0 });
  const controller = createAssetUpdateController({
    trust: { keyId: corpus.keyId, key: corpus.key, channel: 'fixture-beta', storageSchema: 1,
      gateway: 'https://ipfs.fixture.test/', current: { sequence: 1, manifestSha256: '0'.repeat(64) } },
    source: { locator, locatorEnvelope,
      resolve(_cid, kind, path) {
        if (kind === 'manifest') return manifest;
        if (kind === 'manifest-envelope') return manifestEnvelope;
        const asset = assets[corpus.assets.findIndex(candidate => candidate.path === path)];
        check(asset, 'FIXTURE_ASSET'); return asset;
      }, destination: () => destination },
    transport,
    fetch: async (url, init) => {
      check(init.method === 'GET' && init.redirect === 'error' && init.credentials === 'omit' &&
        init.cache === 'no-store' && init.referrerPolicy === 'no-referrer', 'HTTP_CONTRACT');
      const bytes = payloads.get(url); check(bytes, 'EXACT_FIXTURE_ENDPOINT'); state.fetches++;
      return { ok: true, redirected: false, url, headers: new Headers({ 'content-length': String(bytes.length) }),
        body: new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new Uint8Array(bytes)); stream.close(); } }) };
    },
    acceptedStore: {
      async read() { return state.stored; },
      async advance(expected, next, _signal, current) {
        current(); if (!same(expected, state.stored)) return 'conflict';
        state.stored = structuredClone(next); state.floorWrites++; events.push('floor:write');
        await state.afterAdvance(); return 'written';
      }, close() {},
    },
    // Gesture and wallet authority are controlled, just as in the G23 composition
    // test. This fixture makes no browser activation or physical-wallet claim.
    owner: { current: () => true, subscribeInvalidation: () => () => {}, isUserGesture: () => true },
    backup: { capture: services.captureBackupSelection },
    walletQuiescence: { acquire() {
      if (state.walletHeld) return null;
      state.walletHeld = true; events.push('wallet:acquire');
      return { current: () => state.walletHeld,
        async disconnect() { state.walletConnected = false; state.disconnects++; events.push('wallet:disconnect'); },
        release() { state.walletHeld = false; state.releases++; events.push('wallet:release'); } };
    } },
    navigation: { openVerifiedDestination(url) {
      check(url === destination && services.current.state === 'locked' && !state.walletConnected &&
        state.walletHeld && state.stored?.sequence === corpus.sequence, 'DESTINATION_ORDER');
      state.destinations.push(url); events.push('destination:observe');
    } }, monotonicNow: () => 0, nowSeconds: () => 1500,
  });
  const attempts = new AttemptLedger<Acceptance>();
  let profileId = '';
  const candidate = async () => {
    const result = await controller.checkForUpdate();
    check(result.kind === 'candidate', 'VERIFIED_CANDIDATE');
    check(result.review.releaseEnabled === false && result.review.destination === destination, 'CANDIDATE_REVIEW');
    return result.candidate;
  };
  const exportBytes = async () => {
    const exported = value(await services.exportEncrypted(profileId));
    check(exported.authentication === 'not-checked', 'EXPORT_IS_UNCHECKED'); return exported.bytes;
  };
  return { worker, services, events, state, controller, attempts, candidate, destination,
    create: async () => { profileId = value(await services.create(PASSPHRASE)).profileId; return encryptedRow(profileId); },
    row: () => encryptedRow(profileId),
    exportOnly: async () => { const bytes = await exportBytes(); bytes.fill(0); },
    verify: async () => {
      const bytes = await exportBytes();
      try {
        const fileDigest = await digest(bytes), receipt = value(await services.verifyBackup(bytes, PASSPHRASE));
        check(receipt.profileId === profileId && receipt.backupSha256 === fileDigest, 'ACTUAL_BACKUP_AUTHENTICATION');
        return receipt;
      } finally { bytes.fill(0); }
    },
    open: () => services.unlock(profileId, PASSPHRASE),
    accept: (token: object) => attempts.start(() => controller.acceptUpdate(token)),
    checks: () => events.filter(event => event === 'request:checkBackupVerification').length,
    locks: () => events.filter(event => event === 'request:lock').length,
    async close() {
      controller.cancel(); worker.releaseAll();
      try { await controller.dispose(); } finally {
        try { await services.dispose(); } finally { worker.terminate(); transport.dispose(); }
      }
      for (const bytes of payloads.values()) bytes.fill(0);
    },
  };
}

type World = Awaited<ReturnType<typeof world>>;
function refused(result: Acceptance, code: string): void { check(!result.ok && result.error.code === code, 'EXPECTED_' + code); }
function retainedFloor(s: World, sequence: number): void {
  check(s.state.floorWrites === 1 && s.state.stored?.sequence === sequence && s.state.destinations.length === 0, 'RETAINED_FLOOR');
}
function genuineLocked(message: RuntimeResponse): void {
  check(message.operation === 'lock' && message.result.ok && 'state' in message.result.value &&
    message.result.value.state === 'locked', 'GENUINE_LOCK_ACK');
}
const acceptanceOrder = ['wallet:acquire', 'request:checkBackupVerification', 'ack:checkBackupVerification',
  'floor:write', 'request:checkBackupVerification', 'ack:checkBackupVerification', 'wallet:disconnect',
  'request:lock', 'ack:lock', 'destination:observe', 'wallet:release'];

export async function runUpdateRuntimeScenario(input: { readonly scenario: Scenario; readonly workerUrl: string; readonly corpus: PublicReleaseCorpus }) {
  check(UPDATE_RUNTIME_SCENARIOS.includes(input.scenario), 'SCENARIO');
  check(new URL(input.workerUrl, location.href).origin === location.origin, 'SAME_ORIGIN_WORKER');
  const initialLocation = location.href, s = await world(input.workerUrl, input.corpus);
  let before: Awaited<ReturnType<typeof encryptedRow>> | undefined;
  const attemptIds: number[] = [];
  const accept = (token: object) => { const id = s.accept(token); attemptIds.push(id); return id; };
  let observedPending = false, lateResponseDrained = false, admittedOpening = false;
  try {
    before = await s.create();
    if (input.scenario === 'missing-proof') {
      const token = await s.candidate();
      refused(await s.attempts.wait(accept(token)), 'BACKUP_REQUIRED');
      check(s.checks() === 1, 'MISSING_PROOF_FRESH_CHECK');
      await s.exportOnly();
      refused(await s.attempts.wait(accept(token)), 'BACKUP_REQUIRED');
      check(s.checks() === 2 && s.state.floorWrites === 0 && s.state.stored === null && s.locks() === 0 &&
        s.state.disconnects === 0 && s.state.destinations.length === 0 && s.state.releases === 2, 'EXPORT_DOES_NOT_VERIFY');
    } else {
      let priorAttempt: number | undefined;
      if (input.scenario === 'held-own-lock') {
        priorAttempt = accept(await s.candidate());
        refused(await s.attempts.wait(priorAttempt), 'BACKUP_REQUIRED');
      }
      const receipt = await s.verify(); check(receipt.revision === before.revision, 'VERIFIED_PERSISTED_REVISION');
      const token = await s.candidate(), start = s.events.length, initialChecks = s.checks();
      if (input.scenario === 'persisted-mutation') {
        s.state.afterAdvance = async () => { value(await s.services.saveTermsReview('file', new Uint8Array([1]))); };
        refused(await s.attempts.wait(accept(token)), 'BACKUP_REQUIRED');
        const after = await s.row();
        check(after.revision === before.revision + 1 && after.envelopeSha256 !== before.envelopeSha256, 'NATIVE_PERSISTED_MUTATION');
        retainedFloor(s, input.corpus.sequence);
        check(s.checks() - initialChecks === 2 && s.locks() === 0 && s.state.disconnects === 0 &&
          s.services.current.state === 'unlocked', 'SECOND_CHECK_REFUSAL');
      } else if (input.scenario === 'verified') {
        const id = accept(token), result = await s.attempts.wait(id);
        check(result.ok && result.value.releaseEnabled === false, 'ACCEPTED');
        check(same(s.events.slice(start), acceptanceOrder), 'EXACT_ACCEPTANCE_ORDER');
        refused(await s.attempts.wait(accept(token)), 'UPDATE_UNTRUSTED');
        check(s.state.destinations.length === 1 && s.checks() === 2 && s.locks() === 1, 'NO_CANDIDATE_REPLAY');
      } else {
        const lock = s.worker.holdNext('lock'), id = accept(token);
        genuineLocked(await lock.seen); await turn();
        check(s.services.current.state === 'locked' && s.attempts.read(id).state === 'pending' &&
          s.state.walletHeld && s.state.disconnects === 1, 'ACK_REQUIRED_AFTER_LOCKED_SNAPSHOT');
        retainedFloor(s, input.corpus.sequence); observedPending = true;
        if (priorAttempt !== undefined) check(s.attempts.read(priorAttempt).state === 'completed' && priorAttempt !== id, 'FRESH_ATTEMPT_ORACLE');
        if (input.scenario === 'held-own-lock') {
          lock.release(); const result = await s.attempts.wait(id);
          check(result.ok && same(s.events.slice(start), acceptanceOrder), 'OWN_ACK_COMPLETES');
          check(s.state.destinations.length === 1, 'SINGLE_DESTINATION');
        } else if (input.scenario === 'cancel-held-lock') {
          s.controller.cancel(); refused(await s.attempts.wait(id), 'CANCELLED');
          check(s.state.walletHeld, 'CANCELLED_LOCK_STILL_DRAINING');
          check(same(await s.controller.checkForUpdate(), { kind: 'unreachable', reason: 'BUSY' }), 'NO_REENTRY_DURING_DRAIN');
          lock.release(); await s.controller.dispose(); await turn();
          retainedFloor(s, input.corpus.sequence); lateResponseDrained = true;
          check(s.state.releases === 1 && !s.state.walletHeld, 'DRAIN_RELEASES_WALLET');
        } else {
          const openingGate = s.worker.holdNext('unlock');
          let opening: ReturnType<World['open']> | undefined;
          // Deliver the actual ack, then admit the opening synchronously before
          // the old own-lock continuation resumes. An earlier opening is BUSY.
          lock.release(() => { opening = s.open(); });
          refused(await s.attempts.wait(id), 'UNAVAILABLE');
          const message = await openingGate.seen;
          check(message.operation === 'unlock' && message.result.ok && 'state' in message.result.value &&
            message.result.value.state === 'unlocked', 'ACTUALLY_ADMITTED_OPENING');
          retainedFloor(s, input.corpus.sequence); openingGate.release();
          check(opening, 'OPENING_PROMISE'); value(await opening); await turn();
          check(s.services.getSnapshot().state === 'unlocked' && !s.state.walletHeld, 'LATE_OPENING_ONLY');
          retainedFloor(s, input.corpus.sequence); admittedOpening = true;
        }
        check(s.checks() - initialChecks === 2 && s.locks() === 1, 'NATIVE_CHECK_AND_LOCK_COUNTS');
      }
    }
    const after = await s.row();
    if (input.scenario !== 'persisted-mutation') check(same(before, after), 'VAULT_CIPHERTEXT_UNCHANGED');
    check(!s.state.walletHeld && s.worker.errors.length === 0 && location.href === initialLocation, 'NO_NATIVE_SIDE_EFFECT_FAILURE');
    check(attemptIds.every(id => s.attempts.read(id).state === 'completed'), 'EVERY_EXACT_ATTEMPT_COMPLETED');
    return { scenario: input.scenario, attemptIds, attempts: attemptIds.map(id => s.attempts.read(id)),
      nativeChecks: s.checks(), nativeLocks: s.locks(), floorWrites: s.state.floorWrites,
      walletDisconnects: s.state.disconnects, walletReleases: s.state.releases, destinationObservations: s.state.destinations.length,
      observedPending, lateResponseDrained, admittedOpening,
      beforeRevision: before.revision, afterRevision: after.revision,
      encryptedVault: after.encrypted, ciphertextUnchanged: before.envelopeSha256 === after.envelopeSha256,
      events: [...s.events], nativeMessages: s.worker.received, controlledFetches: s.state.fetches,
      actualOriginTransition: false, ReleaseEnabled: 0 };
  } finally {
    await s.close();
    check(s.worker.terminated && s.worker.held.size === 0 && s.worker.errors.length === 0, 'NATIVE_CLEANUP');
  }
}
