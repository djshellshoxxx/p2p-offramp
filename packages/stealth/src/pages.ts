/** Bounded LOCAL fixture pages. Supplied anchors are claims; this module obtains no native canonicality. */
import { decodeLog, type DecodedAnnouncement } from './announcer.ts';
import { profileOf, contextOf, sameContext, type LocalProfileId, type OfflineContext } from './profiles.ts';
import { address, array, data, diagnostic, hash, stop, uint, type DiagnosticOnly } from './shared.ts';
import { candidateKey, cursorOf, fingerprintOf, MAX_BLOCKS, MAX_CANDIDATES, MAX_LOGS_PER_PAGE, MAX_PAGES, observedOf, sameCursor,
  type ClaimedCursor, type ObservedAnnouncement } from './records.ts';
import type { StoreLease } from './store.ts';
export interface ComparisonRequest {
  readonly profileId: LocalProfileId; readonly context: OfflineContext; readonly expectedAnnouncer: string;
  readonly fromBlock: bigint; readonly toBlock: bigint; readonly anchorHash: string; readonly expectedCursor: ClaimedCursor | null;
}
export interface OfflinePageQuery extends ComparisonRequest { readonly token: string | null; }
export interface OfflinePageSource { readOfflinePage(query: Readonly<OfflinePageQuery>, signal: AbortSignal): Promise<unknown>; }
export interface ComparisonReport extends DiagnosticOnly { readonly profileId: LocalProfileId; readonly context: OfflineContext;
  readonly cursor: ClaimedCursor; readonly pages: number; readonly compared: number; readonly added: number; readonly tracked: number; }
function tokenOf(input: unknown): string | null { return input === null ? null : typeof input === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(input) ? input : stop(); }
function requestOf(input: unknown): ComparisonRequest {
  const r = data(input, ['profileId', 'context', 'expectedAnnouncer', 'fromBlock', 'toBlock', 'anchorHash', 'expectedCursor']);
  const fromBlock = uint(r.fromBlock), toBlock = uint(r.toBlock);
  if (toBlock < fromBlock || toBlock - fromBlock >= BigInt(MAX_BLOCKS)) return stop('CAPACITY_EXCEEDED');
  return Object.freeze({ profileId: profileOf(r.profileId), context: contextOf(r.context), expectedAnnouncer: address(r.expectedAnnouncer),
    fromBlock, toBlock, anchorHash: hash(r.anchorHash), expectedCursor: cursorOf(r.expectedCursor) });
}
export async function compareOfflinePages(options: {
  readonly input: unknown; readonly profileId: LocalProfileId; readonly context: OfflineContext; readonly source: unknown; readonly store: StoreLease;
  readonly signal: AbortSignal; readonly guard: () => void; readonly matches: (claim: DecodedAnnouncement) => boolean;
}): Promise<ComparisonReport> {
  const { guard, store, signal } = options; guard();
  const request = requestOf(options.input), source = data(options.source, ['readOfflinePage']); guard();
  if (typeof source.readOfflinePage !== 'function') return stop(); const read = source.readOfflinePage as OfflinePageSource['readOfflinePage'];
  if (request.profileId !== options.profileId) return stop('PROFILE_MISMATCH');
  if (!sameContext(request.context, options.context)) return stop('CONTEXT_MISMATCH');
  const snapshot = await store.read(); guard(); store.guard(); guard();
  if (!sameCursor(snapshot.cursor, request.expectedCursor) || snapshot.cursor && request.fromBlock !== snapshot.cursor.blockNumber + 1n) return stop('CURSOR_CONFLICT');
  const seen = new Map<string, string>(), additions: ObservedAnnouncement[] = []; let compared = 0;
  const compare = (event: ObservedAnnouncement): boolean => {
    guard(); if (compared >= MAX_CANDIDATES) return stop('CAPACITY_EXCEEDED');
    const decoded = decodeLog(options.profileId, options.context, request.expectedAnnouncer, event.log); guard(); compared++;
    const matched = options.matches(decoded); guard(); return matched;
  };
  const yieldToCancellation = async (): Promise<void> => { await new Promise<void>(resolve => setTimeout(resolve, 0)); guard(); store.guard(); guard(); };
  // Never import an encrypted candidate's match flag: authenticate its bytes and compare under this live viewing capability.
  for (const event of snapshot.candidates) {
    if (!compare(event)) return stop('INTEGRITY_FAILURE'); seen.set(candidateKey(event), fingerprintOf(event));
    if (compared % 32 === 0) await yieldToCancellation();
  }
  let token: string | null = null, pages = 0, prior: ObservedAnnouncement | undefined;
  const tokens = new Set<string>(), blockHashes = new Map<bigint, string>(), locators = new Map<string, string>();
  while (true) {
    guard(); store.guard(); guard(); if (pages >= MAX_PAGES) return stop('CAPACITY_EXCEEDED');
    const pageInput = await Reflect.apply(read, options.source, [Object.freeze({ ...request, token }), signal]); guard(); store.guard(); guard();
    const page = data(pageInput, ['profileId', 'context', 'fromBlock', 'toBlock', 'anchorHash', 'token', 'nextToken', 'complete', 'logs']);
    if (profileOf(page.profileId) !== options.profileId) return stop('PROFILE_MISMATCH');
    if (!sameContext(contextOf(page.context), options.context)) return stop('CONTEXT_MISMATCH');
    if (uint(page.fromBlock) !== request.fromBlock || uint(page.toBlock) !== request.toBlock || hash(page.anchorHash) !== request.anchorHash || tokenOf(page.token) !== token) return stop('INTEGRITY_FAILURE');
    const next = tokenOf(page.nextToken), logs = array(page.logs, MAX_LOGS_PER_PAGE); guard(); store.guard(); guard();
    if (typeof page.complete !== 'boolean' || page.complete !== (next === null)) return stop('INCOMPLETE_PAGE');
    if (next !== null && tokens.has(next)) return stop('INCOMPLETE_PAGE');
    for (const input of logs) {
      const event = observedOf(input); guard(); store.guard(); guard();
      if (event.blockNumber < request.fromBlock || event.blockNumber > request.toBlock || event.blockNumber === request.toBlock && event.blockHash !== request.anchorHash) return stop('INTEGRITY_FAILURE');
      if (prior && (event.blockNumber < prior.blockNumber || event.blockNumber === prior.blockNumber && event.logIndex < prior.logIndex)) return stop('INTEGRITY_FAILURE');
      const blockHash = blockHashes.get(event.blockNumber); if (blockHash && blockHash !== event.blockHash) return stop('INTEGRITY_FAILURE');
      if (blockHashes.size >= MAX_BLOCKS && !blockHashes.has(event.blockNumber)) return stop('CAPACITY_EXCEEDED'); blockHashes.set(event.blockNumber, event.blockHash);
      const key = candidateKey(event), fingerprint = fingerprintOf(event), previous = seen.get(key); prior = event;
      const locator = `${event.blockNumber}:${event.logIndex}`, previousLocator = locators.get(locator);
      if (previousLocator !== undefined && previousLocator !== key) return stop('INTEGRITY_FAILURE');
      if (previous !== undefined) { if (previous !== fingerprint) return stop('INTEGRITY_FAILURE'); continue; }
      // Apply caps after all untrusted parsing callbacks and before allocation or expensive scalar multiplication.
      guard(); if (seen.size >= MAX_CANDIDATES || compared >= MAX_CANDIDATES) return stop('CAPACITY_EXCEEDED'); seen.set(key, fingerprint); locators.set(locator, key);
      if (compare(event)) { if (snapshot.candidates.length + additions.length >= MAX_CANDIDATES) return stop('CAPACITY_EXCEEDED'); additions.push(event); }
      if (compared % 32 === 0) await yieldToCancellation();
    }
    guard(); pages++;
    if (page.complete) break;
    if (next === null) return stop('INCOMPLETE_PAGE'); tokens.add(next); token = next;
  }
  const cursor = Object.freeze({ blockNumber: request.toBlock, blockHash: request.anchorHash });
  guard(); store.guard(); guard(); await store.commit(snapshot, Object.freeze(additions), cursor); guard(); store.guard(); guard();
  return diagnostic({ profileId: options.profileId, context: options.context, cursor, pages, compared, added: additions.length, tracked: snapshot.candidates.length + additions.length });
}
