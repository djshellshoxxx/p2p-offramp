/** Private G20 composition: native NIP-17 authentication precedes every append AND every history read.
 * Stored receipt order is a local claim, never delivery, payment, chain or release evidence. No transport exists here.
 */
import { createTradeChat, verifyEventSync, parseEventJson, type TradeChat, type NostrEvent } from '../../nostr-crypto/index.ts';
import { decodeBase64url, encodeBase64url, intentData, parseTradeBinding, sameBinding, MAX_PAYLOAD_BYTES,
  type CoreResult, type CoreErrorCode, type VaultService, type VaultSession, type VaultSessionAuthority, type VaultSessionLease, type Result } from '../../schemas/index.ts';
import { copyBytes, decodeMessage, errorCode, failure, messageBytes, stop, type TextMessageV1 } from './envelope.ts';

export const HISTORY_FORMAT = 'p2p-offramp-chat-history';
export const DEFAULT_HISTORY_MESSAGES = 64;
export const MAX_HISTORY_MESSAGES = 256;
export const MAX_HISTORY_BYTES = 2_097_152;
const MAX_WRAP_BYTES = 131_072;
const WRAP_LIMITS = Object.freeze({ maxContentBytes: 100_000, maxTags: 1, maxTagItems: 2, maxTagItemBytes: 64,
  maxJsonBytes: MAX_WRAP_BYTES, allowedKinds: Object.freeze([1059]) });
type HistoryVault = Pick<VaultService, 'list' | 'read' | 'commit'> & VaultSessionAuthority;
export interface DurableTradeChatOptions extends Omit<Parameters<typeof createTradeChat>[0], 'maxSeenMessages'> {
  readonly vault: HistoryVault; readonly session: VaultSession;
  readonly maxMessages?: number; readonly maxHistoryBytes?: number;
  /** Local receipt clock in milliseconds. Never interpreted as native chain time. */
  readonly nowMs?: () => number;
}
export interface HistoryReceipt { readonly recordId: string; readonly receivedSequence: number; readonly duplicate: boolean; }
export interface HistoryMessage extends HistoryReceipt {
  readonly receivedAt: number; readonly rumorId: string; readonly direction: 'inbound' | 'outbound'; readonly message: TextMessageV1;
}
export interface HistoryView {
  readonly provenance: 'native-reauthenticated-local-history'; readonly economicAuthority: false;
  readonly messages: readonly HistoryMessage[]; readonly skippedRecords: number;
}
export interface DurableTradeChat {
  readonly conversationId: string;
  /** The caller supplies a stable messageId in an exact envelope; retries use the same bytes, never an automatic send. */
  send(bytes: unknown, senderSecret: unknown, signal?: AbortSignal): Promise<CoreResult<HistoryReceipt & { readonly recipientWrap: NostrEvent; readonly selfWrap: NostrEvent }>>;
  receive(wrap: unknown, recipientSecret: unknown, signal?: AbortSignal): Promise<CoreResult<HistoryReceipt>>;
  /** Requires the original messaging identity, even after fresh-key vault restore. Proofs are re-authenticated. */
  list(identitySecret: unknown, signal?: AbortSignal): Promise<CoreResult<HistoryView>>;
  close(): void;
}
interface StoredHistory {
  readonly recordId: string; readonly conversationId: string; readonly receivedSequence: number; readonly receivedAt: number;
  readonly wrap: unknown; readonly bytes: number;
}
interface Job { readonly controller: AbortController; readonly buffers: Set<Uint8Array>; revision: number; }
interface Authenticated { readonly message: TextMessageV1; readonly wrap: NostrEvent; readonly rumorId: string; }
function take<T>(result: CoreResult<T>): T { if (result.ok) return result.value; return stop(result.error.code); }
function vaultValue<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  return stop(code === 'LOCKED' || code === 'CANCELLED' || code === 'CONFLICT' || code === 'LIMIT_EXCEEDED' || code === 'INVALID_INPUT' ? code :
    code === 'REKEY_REQUIRED' || code === 'QUOTA_EXCEEDED' ? 'LIMIT_EXCEEDED' : 'UNAVAILABLE');
}
function integer(value: unknown, positive = false): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= (positive ? 1 : 0) ? value : stop('INTEGRITY_FAILURE');
}
function randomId(): string {
  const bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
  catch { return stop('UNAVAILABLE'); } finally { bytes.fill(0); }
}

export function createDurableTradeChat(options: DurableTradeChatOptions): CoreResult<DurableTradeChat> {
  let chat: TradeChat | undefined, lease: VaultSessionLease | undefined;
  try {
    const binding = parseTradeBinding(options.binding), participants = Object.freeze([...options.participants]) as readonly [string, string];
    const self = options.selfPublicKey, other = participants.find(key => key !== self);
    const maxMessages = options.maxMessages ?? DEFAULT_HISTORY_MESSAGES, maxBytes = options.maxHistoryBytes ?? MAX_HISTORY_BYTES;
    if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || maxMessages > MAX_HISTORY_MESSAGES ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_HISTORY_BYTES) return failure('INVALID_INPUT');
    const provider = options.provider;
    const native = take(createTradeChat({ binding, participants, selfPublicKey: self, provider,
      ...(options.now === undefined ? {} : { now: options.now }) })); chat = native;
    const vault = options.vault, nowMs = options.nowMs ?? Date.now;
    let closed = false, active: Job | undefined;
    const wipe = (job: Job): void => { for (const buffer of job.buffers) buffer.fill(0); };
    const close = (): void => { if (closed) return; closed = true; active?.controller.abort(); if (active) wipe(active); native.close(); lease?.dispose(); };
    lease = vaultValue(vault.captureSession(options.session, close));
    const currentLease = lease;
    const guard = (job: Job): Readonly<VaultSession> => {
      const session = currentLease.current();
      if (closed || !session) return stop('LOCKED');
      if (job.controller.signal.aborted) return stop('CANCELLED');
      if (session.revision !== job.revision) return stop('CONFLICT');
      return session;
    };
    async function run<T>(secret: unknown, external: AbortSignal | undefined, operation: (job: Job, key: Uint8Array) => Promise<T>): Promise<CoreResult<T>> {
      if (closed || !currentLease.current()) return failure('LOCKED');
      try {
        if (external !== undefined && !(external instanceof AbortSignal)) return failure('INVALID_INPUT');
        if (external?.aborted) return failure('CANCELLED');
      } catch { return failure('INVALID_INPUT'); }
      if (active) return failure('CONFLICT');
      let key: Uint8Array;
      try { key = copyBytes(secret, 32, 32); } catch (error) { return failure(errorCode(error)); }
      const session = currentLease.current(); if (!session) { key.fill(0); return failure('LOCKED'); }
      const job: Job = { controller: new AbortController(), buffers: new Set([key]), revision: session.revision }; active = job;
      const onExternal = (): void => job.controller.abort();
      external?.addEventListener('abort', onExternal, { once: true }); if (external?.aborted) onExternal();
      let stopped!: () => void;
      const aborted = new Promise<CoreResult<T>>(resolve => {
        stopped = () => { wipe(job); resolve(failure(closed ? 'LOCKED' : 'CANCELLED')); };
        job.controller.signal.addEventListener('abort', stopped, { once: true });
        if (job.controller.signal.aborted) stopped();
      });
      const physical = Promise.resolve().then(async (): Promise<CoreResult<T>> => {
        guard(job);
        const value = await operation(job, key); guard(job); return { ok: true, value };
      }).catch(error => failure<T>(errorCode(error))).finally(() => {
        wipe(job); job.buffers.clear(); external?.removeEventListener('abort', onExternal);
        job.controller.signal.removeEventListener('abort', stopped); if (active === job) active = undefined;
      });
      return Promise.race([physical, aborted]);
    }
    async function scan(job: Job): Promise<{ records: StoredHistory[]; skippedRecords: number }> {
      const session = guard(job);
      const revision = vaultValue(await vault.commit(session.sessionId, job.revision, [], job.controller.signal, () => { guard(job); }));
      guard(job); if (revision !== job.revision) return stop('CONFLICT');
      const records = vaultValue(await vault.list(session.sessionId, 'chat')); guard(job);
      const found: StoredHistory[] = []; let skippedRecords = 0, totalBytes = 0;
      for (const record of records) {
        if (record.kind !== 'chat' || !/^[0-9a-f]{32}$/.test(record.id)) return stop('INTEGRITY_FAILURE');
        if (record.schemaVersion !== 1) return stop('UNSUPPORTED_VERSION');
        let bytes: Uint8Array | undefined;
        try {
          bytes = decodeBase64url(record.payload, 1, MAX_PAYLOAD_BYTES);
          const raw = parseEventJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), MAX_PAYLOAD_BYTES, 6);
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return stop('INTEGRITY_FAILURE');
          if (Object.getOwnPropertyDescriptor(raw, 'format')?.value !== HISTORY_FORMAT) { skippedRecords++; continue; }
          const value = intentData(raw, ['format', 'version', 'conversationId', 'receivedSequence', 'receivedAt', 'wrap']);
          if (value.version !== 1) return stop('UNSUPPORTED_VERSION');
          if (typeof value.conversationId !== 'string' || !/^[0-9a-f]{64}$/.test(value.conversationId)) return stop('INTEGRITY_FAILURE');
          const receivedSequence = integer(value.receivedSequence, true), receivedAt = integer(value.receivedAt);
          if (value.conversationId !== native.conversationId) { skippedRecords++; continue; }
          totalBytes += bytes.length;
          if (found.length >= maxMessages || totalBytes > maxBytes) return stop('LIMIT_EXCEEDED');
          found.push({ recordId: record.id, conversationId: value.conversationId, receivedSequence, receivedAt, wrap: value.wrap, bytes: bytes.length });
        } catch (error) { return stop(errorCode(error) === 'INVALID_INPUT' ? 'INTEGRITY_FAILURE' : errorCode(error)); }
        finally { bytes?.fill(0); }
      }
      found.sort((left, right) => left.receivedSequence - right.receivedSequence);
      if (new Set(found.map(record => record.recordId)).size !== found.length || found.some((record, index) => record.receivedSequence !== index + 1)) return stop('INTEGRITY_FAILURE');
      return { records: found, skippedRecords };
    }
    async function authenticate(job: Job, wrap: unknown, key: Uint8Array): Promise<Authenticated> {
      const stableWrap = verifyEventSync(wrap, WRAP_LIMITS); guard(job);
      const received = take(await native.receive(stableWrap, key, job.controller.signal)); guard(job);
      const content = new TextEncoder().encode(received.message.content); job.buffers.add(content);
      try {
        const message = take(decodeMessage(content));
        if (!sameBinding(message.binding, binding) || message.sender !== received.message.author ||
            message.recipient !== (message.sender === self ? other : self)) return stop('UNAUTHORIZED');
        return { message, wrap: stableWrap, rumorId: received.message.rumorId };
      } finally { content.fill(0); job.buffers.delete(content); }
    }
    async function history(job: Job, key: Uint8Array): Promise<{ messages: HistoryMessage[]; records: StoredHistory[]; skippedRecords: number }> {
      const stored = await scan(job), messages: HistoryMessage[] = [], ids = new Set<string>();
      for (const record of stored.records) {
        const authenticated = await authenticate(job, record.wrap, key); guard(job);
        const id = `${authenticated.message.sender}:${authenticated.message.messageId}`;
        if (ids.has(id)) return stop('INTEGRITY_FAILURE'); ids.add(id);
        messages.push(Object.freeze({ recordId: record.recordId, receivedSequence: record.receivedSequence, receivedAt: record.receivedAt,
          duplicate: false, rumorId: authenticated.rumorId, direction: authenticated.message.sender === self ? 'outbound' : 'inbound', message: authenticated.message }));
      }
      return { ...stored, messages };
    }
    function existingMessage(messages: readonly HistoryMessage[], message: TextMessageV1): HistoryMessage | undefined {
      const duplicate = messages.find(entry => entry.message.sender === message.sender && entry.message.messageId === message.messageId);
      if (duplicate && JSON.stringify(duplicate.message) !== JSON.stringify(message)) return stop('CONFLICT');
      return duplicate;
    }
    async function persist(job: Job, key: Uint8Array, authenticated: Authenticated): Promise<HistoryReceipt> {
      const stored = await history(job, key); guard(job);
      const duplicate = existingMessage(stored.messages, authenticated.message);
      if (duplicate) {
        return Object.freeze({ recordId: duplicate.recordId, receivedSequence: duplicate.receivedSequence, duplicate: true });
      }
      if (stored.records.length >= maxMessages) return stop('LIMIT_EXCEEDED');
      const receivedAt = nowMs(); if (!Number.isSafeInteger(receivedAt) || receivedAt < 0) return stop('INVALID_INPUT');
      const recordId = randomId(), receivedSequence = stored.records.length + 1;
      const encoded = new TextEncoder().encode(JSON.stringify({ format: HISTORY_FORMAT, version: 1, conversationId: native.conversationId,
        receivedSequence, receivedAt, wrap: authenticated.wrap })); job.buffers.add(encoded);
      try {
        if (encoded.length > MAX_PAYLOAD_BYTES || encoded.length + stored.records.reduce((sum, record) => sum + record.bytes, 0) > maxBytes) return stop('LIMIT_EXCEEDED');
        const session = guard(job);
        if (vaultValue(await vault.read(session.sessionId, recordId)) !== null) return stop('CONFLICT'); guard(job);
        const payload = encodeBase64url(encoded);
        const revision = vaultValue(await vault.commit(session.sessionId, job.revision, [{ op: 'put', record: { id: recordId, kind: 'chat', schemaVersion: 1, payload } }],
          job.controller.signal, () => { guard(job); }));
        job.revision = revision; guard(job);
        return Object.freeze({ recordId, receivedSequence, duplicate: false });
      } finally { encoded.fill(0); job.buffers.delete(encoded); }
    }
    const service: DurableTradeChat = {
      conversationId: native.conversationId,
      send(input, secret, signal) {
        if (closed || !currentLease.current()) return Promise.resolve(failure('LOCKED'));
        if (active) return Promise.resolve(failure('CONFLICT'));
        // Snapshot caller-owned bytes before entering asynchronous work.
        let message: TextMessageV1;
        try { message = take(decodeMessage(input, { binding, sender: self, recipient: other! })); } catch (error) { return Promise.resolve(failure(errorCode(error))); }
        return run(secret, signal, async (job, key) => {
          const encoded = messageBytes(message); job.buffers.add(encoded);
          try {
            // Re-authenticate durable history before expensive seal/wrap generation. An explicit duplicate retry
            // still needs both delivery wraps; only known-impossible new messages and conflicts stop here.
            const preflight = await history(job, key); guard(job);
            if (!existingMessage(preflight.messages, message) && (preflight.records.length >= maxMessages ||
                preflight.records.reduce((sum, record) => sum + record.bytes, 0) >= maxBytes)) return stop('LIMIT_EXCEEDED');
            const sent = take(await native.send(new TextDecoder().decode(encoded), key, job.controller.signal)); guard(job);
            const authenticated = await authenticate(job, sent.selfWrap, key);
            const receipt = await persist(job, key, authenticated); guard(job);
            return Object.freeze({ ...receipt, recipientWrap: sent.recipientWrap, selfWrap: sent.selfWrap });
          } finally { encoded.fill(0); job.buffers.delete(encoded); }
        });
      },
      receive(input, secret, signal) {
        if (closed || !currentLease.current()) return Promise.resolve(failure('LOCKED'));
        if (active) return Promise.resolve(failure('CONFLICT'));
        let stable: NostrEvent;
        try { stable = verifyEventSync(input, WRAP_LIMITS); } catch (error) { return Promise.resolve(failure(errorCode(error))); }
        return run(secret, signal, async (job, key) => persist(job, key, await authenticate(job, stable, key)));
      },
      list(secret, signal) { return run(secret, signal, async (job, key) => {
        // Even an empty history requires the bound messaging identity.
        const publicKey = await provider.publicKey(key); guard(job); if (publicKey !== self) return stop('UNAUTHORIZED');
        const found = await history(job, key); guard(job);
        return Object.freeze({ provenance: 'native-reauthenticated-local-history', economicAuthority: false,
          messages: Object.freeze(found.messages), skippedRecords: found.skippedRecords });
      }); },
      close,
    };
    return { ok: true, value: Object.freeze(service) };
  } catch (error) { chat?.close(); lease?.dispose(); return failure(errorCode(error)); }
}
