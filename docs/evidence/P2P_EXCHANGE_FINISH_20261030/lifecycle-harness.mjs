// Actual exchange source with fixed synthetic crypto/review; no cryptographic qualification.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as fixture from './synthetic-fixtures.mjs';
export const keys = { self: 'a'.repeat(64), seller: 'b'.repeat(64), order: 'c'.repeat(64), hash: 'd'.repeat(64),
  addressA: `0x${'1'.repeat(40)}`, addressB: `0x${'2'.repeat(40)}` };
export const secret = new Uint8Array(32);
export const termsBytes = new TextEncoder().encode('{}');
export function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
export async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture timeout')), 2000); })]); }
  finally { clearTimeout(timer); }
}
export function options(provider, seller = keys.seller) {
  return { selfPublicKey: keys.self, provider, registry: {}, hashTerms: () => keys.hash, now: () => 100,
    ads: { revalidate: () => ({ ok: true, ad: { author: seller, ad: { maker: seller, orderId: keys.order,
      expiresAtSeconds: '1000', amountMin: '1', amountMax: '100' } } }) } };
}
export async function loadExchange() {
  const fixtureUrl = new URL('./synthetic-fixtures.mjs', import.meta.url).href;
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '../../domain/index.ts' || specifier === '../../nostr-crypto/index.ts') return { url: fixtureUrl, shortCircuit: true };
    return next(specifier, context);
  } });
  const source = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'packages/exchange/src/exchange.ts');
  const { createTermsExchange } = await import(pathToFileURL(source).href);
  const { adAddress, encodeEnvelope, envelopeTags } = await import(new URL('./messages.ts', pathToFileURL(source)).href);
  function incoming(type, sender, recipient, body, termsHash, seller = keys.seller) {
    const envelope = { v: 1, type, ad: adAddress(seller, keys.order), orderId: keys.order,
      sender, recipient, nonce: 'e'.repeat(64), expiresAtSeconds: '900', termsHash, body };
    return { rumor: fixture.createUnsignedEvent(sender, { kind: 14, created_at: 100, tags: envelopeTags(envelope), content: encodeEnvelope(envelope) }) };
  }
  return { createTermsExchange, incoming, reviewed: fixture.reviewed, close: () => hooks.deregister() };
}
