/** LOCAL encrypted comparison namespace, not an RPC, native-canonicality or scheme1 interoperability profile. */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { address, array, bareHex, data, hash, hexOf, stop, uint } from './shared.ts';
import type { RawAnnouncementLog } from './announcer.ts';
import { contextOf, profileOf, type LocalProfileId, type OfflineContext } from './profiles.ts';
import { compressedPoint } from './math.ts';
export const CURSOR_FORMAT = 'p2p-offramp-offline-stealth-cursor', CANDIDATE_FORMAT = 'p2p-offramp-offline-stealth-candidate';
export const MAX_CANDIDATES = 10000, MAX_LOGS_PER_PAGE = 1000, MAX_BLOCKS = 2000, MAX_PAGES = 10;
export interface ComparisonBinding { readonly profileId: LocalProfileId; readonly context: OfflineContext; readonly viewingPublicKeyHex: string; readonly spendingPublicKeyHex: string; }
export interface ClaimedCursor { readonly blockNumber: bigint; readonly blockHash: string; }
export interface ObservedAnnouncement { readonly blockNumber: bigint; readonly blockHash: string; readonly transactionHash: string; readonly logIndex: bigint; readonly log: RawAnnouncementLog; }
export function bindingOf(input: unknown): ComparisonBinding {
  const raw = data(input, ['profileId', 'context', 'viewingPublicKeyHex', 'spendingPublicKeyHex']);
  const viewingPublicKeyHex = bareHex(raw.viewingPublicKeyHex, 33), spendingPublicKeyHex = bareHex(raw.spendingPublicKeyHex, 33);
  compressedPoint(viewingPublicKeyHex); compressedPoint(spendingPublicKeyHex);
  if (viewingPublicKeyHex === spendingPublicKeyHex) return stop('KEY_PURPOSE_CONFLICT');
  return Object.freeze({ profileId: profileOf(raw.profileId), context: contextOf(raw.context), viewingPublicKeyHex, spendingPublicKeyHex });
}
export const bindingText = (binding: ComparisonBinding): string => JSON.stringify(binding);
export const digestText = (text: string): string => { const bytes = new TextEncoder().encode(text); try { return hexOf(keccak_256(bytes)); } finally { bytes.fill(0); } };
export const scopeHashOf = (binding: ComparisonBinding): string => digestText('offline-stealth-scope/v1\0' + bindingText(binding));
export const cursorIdOf = (scopeHash: string): string => digestText(CURSOR_FORMAT + '\0' + scopeHash).slice(0, 32);
export const candidateKey = (event: ObservedAnnouncement): string => `${event.blockHash}:${event.transactionHash}:${event.logIndex}`;
export const candidateIdOf = (scopeHash: string, event: ObservedAnnouncement): string => digestText(CANDIDATE_FORMAT + '\0' + scopeHash + '\0' + candidateKey(event)).slice(0, 32);
export function cursorOf(input: unknown): ClaimedCursor | null {
  if (input === null) return null; const raw = data(input, ['blockNumber', 'blockHash']); return Object.freeze({ blockNumber: uint(raw.blockNumber), blockHash: hash(raw.blockHash) });
}
export const sameCursor = (a: ClaimedCursor | null, b: ClaimedCursor | null): boolean => a === null || b === null ? a === b : a.blockNumber === b.blockNumber && a.blockHash === b.blockHash;
export function observedOf(input: unknown): ObservedAnnouncement {
  const raw = data(input, ['blockNumber', 'blockHash', 'transactionHash', 'logIndex', 'log']), event = data(raw.log, ['address', 'topics', 'data']);
  const topics = array(event.topics, 4).map(hash); if (topics.length !== 4 || typeof event.data !== 'string' || !event.data.startsWith('0x')) return stop();
  bareHex(event.data.slice(2), 224, 448);
  return Object.freeze({ blockNumber: uint(raw.blockNumber), blockHash: hash(raw.blockHash), transactionHash: hash(raw.transactionHash), logIndex: uint(raw.logIndex),
    log: Object.freeze({ address: address(event.address), topics: Object.freeze(topics), data: event.data }) });
}
export const storedObserved = (event: ObservedAnnouncement) => ({ blockNumber: event.blockNumber.toString(), blockHash: event.blockHash,
  transactionHash: event.transactionHash, logIndex: event.logIndex.toString(), log: event.log });
export const fingerprintOf = (event: ObservedAnnouncement): string => JSON.stringify(storedObserved(event));
export function decodeStoredObserved(input: unknown): ObservedAnnouncement {
  const raw = data(input, ['blockNumber', 'blockHash', 'transactionHash', 'logIndex', 'log']);
  const decimal = (value: unknown): bigint => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) ? uint(BigInt(value)) : stop();
  return observedOf({ ...raw, blockNumber: decimal(raw.blockNumber), logIndex: decimal(raw.logIndex) });
}
