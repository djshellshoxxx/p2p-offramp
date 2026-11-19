// Test-only helpers for peer acceptance: TEST-ONLY wallet seeds and messaging keys derived from public labels (the
// same derivation as contracts/solana/vectors/acceptance.py), bound trades and signed proofs.
import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { solanaPeerAcceptanceRequest, solanaTermsConsentRequest } from '../src/acceptance.ts';
import { bindSolanaTrade } from '../src/bind.ts';
import { base58Encode, bindingOf, CHAIN_TIME, makeRegistry, makeTerms, ok, shaHex, enc } from './support.mjs';

const fromLabel = text => new Uint8Array(createHash('sha256').update(text).digest());
const NAMES = ['seller', 'buyer', 'mallory'];
export const SEEDS = Object.fromEntries(NAMES.map(name =>
  [name, fromLabel(`p2p-offramp TEST-ONLY solana ${name} wallet seed v1`)]));
export const WALLETS = Object.fromEntries(NAMES.map(name => [name, base58Encode(ed25519.getPublicKey(SEEDS[name]))]));
export const KEYS = Object.fromEntries(['seller', 'buyer', 'other'].map(name =>
  [name, Buffer.from(schnorr.getPublicKey(fromLabel(`p2p-offramp TEST-ONLY nostr ${name} key v1`))).toString('hex')]));
export const NOW = CHAIN_TIME;

/** A bound native trade between the TEST-ONLY seller and buyer; `label` makes order id and seller nonce unique. */
export function boundTrade(label = 'unit', changes = {}, registry = makeRegistry(), bindingChanges = {}) {
  const terms = makeTerms('native', { seller: WALLETS.seller, buyer: WALLETS.buyer,
    orderId: shaHex(enc.encode(`order-${label}`)), sellerNonce: shaHex(enc.encode(`nonce-${label}`)), ...changes });
  return ok(bindSolanaTrade(registry, bindingOf(terms, bindingChanges), terms));
}
export function contextFor(role, changes = {}) {
  const other = role === 'seller' ? 'buyer' : 'seller';
  return { role, ownMessagingKey: KEYS[role], counterpartyMessagingKey: KEYS[other], nowSeconds: String(NOW),
    envelopeExpiresAtSeconds: String(NOW + 3600), ...changes };
}
/** Signs the terms consent and a peer acceptance with the role's TEST-ONLY seed. */
export function proofFor(trade, role, draftChanges = {}, seed = SEEDS[role]) {
  const other = role === 'seller' ? 'buyer' : 'seller';
  const request = ok(solanaPeerAcceptanceRequest(trade, { role, ownMessagingKey: KEYS[role],
    counterpartyMessagingKey: KEYS[other], notAfterSeconds: String(NOW + 300), ...draftChanges }));
  const terms = ok(solanaTermsConsentRequest(trade));
  return { statement: { ...request.statement }, termsSignature: ed25519.sign(terms.message, seed),
    acceptanceSignature: ed25519.sign(request.message, seed) };
}
export const ledgerContext = (role, changes = {}) => {
  const { nowSeconds: _, ...context } = contextFor(role, changes);
  return context;
};
