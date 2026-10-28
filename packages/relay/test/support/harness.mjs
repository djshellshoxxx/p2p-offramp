// Shared test fixtures: a G05 broker backed by a fixture registry, an in-memory socket, signed-ad helpers. TEST ONLY.
import { SessionTransportPolicy } from '../../../transport/src/policy.ts';
import { createAdEvent, AD_KIND } from '../../src/ad.ts';
import { makeCrypto, makeKey, signWith } from './crypto-double.mjs';

export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export async function until(predicate, timeoutMs = 3000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition'); await wait(5); }
}

export class FixtureRegistry {
  constructor(endpoints) { this.endpoints = new Set(endpoints); this.coverage = 'verified-private'; this.consent = true; this.listeners = new Set(); this.grants = new Set(); }
  inspect(channel) { return { channel, coverage: this.coverage, adapterId: 'fixture-adapter', expiresAt: this.coverage === 'unknown' || this.coverage === 'unsupported' ? null : 1e15 }; }
  capture(binding, owner) {
    if (!this.endpoints.has(binding.endpointId) || binding.channel !== 'relay') return null;
    let live = true; const listeners = new Set();
    const data = { version: 1, request: { ...binding }, endpoint: { id: binding.endpointId, channel: 'relay', url: 'wss://fixture.example/', adapterId: 'fixture-adapter', methods: ['read', 'publish'] }, evidence: this.inspect('relay'), directConsent: this.consent };
    const grant = { owner, snapshot: () => data, current: o => live && o === owner, subscribeInvalidation: l => { listeners.add(l); return () => listeners.delete(l); }, dispose: () => { live = false; } };
    return grant;
  }
  subscribeInvalidation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
export function makeBroker({ endpoints = ['relay-a', 'relay-b', 'relay-c'], coverage = 'verified-private', mode = 'strict', empty = false } = {}) {
  const registry = new FixtureRegistry(endpoints); registry.coverage = coverage;
  const broker = empty ? new SessionTransportPolicy() : new SessionTransportPolicy({ trustedRegistry: registry });
  broker.setMode(mode);
  return { broker, registry };
}
export const FAST = { backoffCeilingsMs: [3, 3, 3, 3, 3, 3], stableMs: 150, connectTimeoutMs: 800, publishTimeoutMs: 800 };

export const seller = makeKey('seller');
export const sellerCrypto = makeCrypto(seller);
export const NOW = 1_800_000_000;
export const ORDER = 'a'.repeat(64);
export function adFor(over = {}) {
  return { app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:8453', assetId: 'erc20:usdc', amountMin: '10000000', amountMax: '500000000',
    currency: 'EUR', railClass: 'bank-transfer', expiresAtSeconds: String(NOW + 1800), maker: seller.pubkey, ...over };
}
export async function signedAd(over = {}, createdAt = NOW) { return createAdEvent(sellerCrypto, adFor(over), createdAt); }
export { AD_KIND, makeCrypto, makeKey, signWith };

/** In-memory socket with a scriptable peer; `connector` hands them out in order and records attempts. */
export function memoryNetwork() {
  const net = { sockets: [], attempts: 0 };
  net.connector = () => {
    net.attempts++;
    const socket = { onopen: null, onmessage: null, onclose: null, onerror: null, sent: [], closed: false,
      send(text) { this.sent.push(JSON.parse(text)); }, close() { this.closed = true; },
      deliver(text) { this.onmessage?.({ data: text }); } };
    net.sockets.push(socket);
    queueMicrotask(() => socket.onopen?.({}));
    return socket;
  };
  return net;
}
