#!/usr/bin/env node
// Regenerates peer-acceptance-v2-carrier.json: the D1 version 2 carrier vectors (seller offer and buyer accept). Uses
// viem's EIP-712 encoder and signer and noble's BIP-340 key derivation only; it never calls this repository's digest,
// binding or envelope code. Inputs: the public synthetic scenario (test-only keys; never fund them).
// Run from the repository root: node packages/wallet/test/fixtures/peer-acceptance-v2-generate.mjs
// then record the printed SHA-256 in peer-acceptance-v2-README.md and evm-peer-v2-vectors.test.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { hashDomain, hashStruct, hashTypedData, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { schnorr } from '@noble/curves/secp256k1.js';

const require = createRequire(import.meta.url);
const packageVersion = async name => JSON.parse(await readFile(new URL(`../../../../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
const VIEM = require('viem/package.json').version, NOBLE = await packageVersion('@noble/curves');
if (VIEM !== '2.57.10' || NOBLE !== '2.4.0') throw new Error(`pinned viem 2.57.10 and @noble/curves 2.4.0 required, found ${VIEM} / ${NOBLE}`);
const scenario = JSON.parse(await readFile(new URL('../../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const terms = scenario.sets.native.terms, agreement = scenario.sets.native.privateAgreementInput;
const domain = { name: 'P2POfframp', version: '1', chainId: BigInt(scenario.domain.chainId), verifyingContract: scenario.domain.verifyingContract };
const xonly = fill => Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(fill))).toString('hex');
const SELLER_KEY = xonly(1), BUYER_KEY = xonly(2);
const types = {
  TradeTerms: [['v', 'uint8'], ['orderId', 'bytes32'], ['revision', 'uint64'], ['networkId', 'string'], ['deploymentId', 'string'], ['seller', 'address'],
    ['buyer', 'address'], ['assetKind', 'uint8'], ['asset', 'address'], ['amountBaseUnits', 'uint256'], ['privateAgreementHash', 'bytes32'],
    ['capabilitiesHash', 'bytes32'], ['sellerNonce', 'bytes32'], ['acceptBeforeSeconds', 'uint64'], ['escrowExpirySeconds', 'uint64'], ['mode', 'uint8']]
    .map(([name, type]) => ({ name, type })),
  PeerAcceptance: [['v', 'uint8'], ['termsHash', 'bytes32'], ['role', 'uint8'], ['account', 'address'], ['ownMessagingKey', 'bytes32'],
    ['counterpartyMessagingKey', 'bytes32'], ['notAfterSeconds', 'uint64']].map(([name, type]) => ({ name, type })),
};
const tradeMessage = { v: 1, orderId: `0x${terms.orderId}`, revision: BigInt(terms.revision), networkId: terms.networkId, deploymentId: terms.deploymentId,
  seller: terms.seller, buyer: terms.buyer, assetKind: terms.assetKind === 'native' ? 0 : 1, asset: terms.asset, amountBaseUnits: BigInt(terms.amountBaseUnits),
  privateAgreementHash: `0x${terms.privateAgreementHash}`, capabilitiesHash: `0x${terms.capabilitiesHash}`, sellerNonce: `0x${terms.sellerNonce}`,
  acceptBeforeSeconds: BigInt(terms.acceptBeforeSeconds), escrowExpirySeconds: BigInt(terms.escrowExpirySeconds), mode: 0 };
const strip = hex => hex.slice(2);
const termsHash = strip(hashTypedData({ domain, types: { TradeTerms: types.TradeTerms }, primaryType: 'TradeTerms', message: tradeMessage }));
const notAfter = '1699995000', expires = '1699990900';
const ad = `30078:${SELLER_KEY}:p2p-offramp:v1:${terms.orderId}`;
const reviewText = JSON.stringify({ format: 'p2p-offramp/local-terms-review/v1', terms, privateAgreement: agreement });
async function statement(role, own, counterparty) {
  const binding = { v: 1, termsHash, role, account: terms[role], ownMessagingKey: own, counterpartyMessagingKey: counterparty, notAfterSeconds: notAfter };
  const message = { v: 1, termsHash: `0x${termsHash}`, role: role === 'seller' ? 0 : 1, account: binding.account, ownMessagingKey: `0x${own}`,
    counterpartyMessagingKey: `0x${counterparty}`, notAfterSeconds: BigInt(notAfter) };
  const account = privateKeyToAccount(`0x${scenario.testOnlyKeys[role].privateKeyHex}`);
  if (account.address.toLowerCase() !== binding.account) throw new Error('scenario key does not match the terms account');
  const typed = { domain, types: { PeerAcceptance: types.PeerAcceptance }, primaryType: 'PeerAcceptance', message };
  return { role, binding, structHash: strip(hashStruct({ data: message, primaryType: 'PeerAcceptance', types: { PeerAcceptance: types.PeerAcceptance } })),
    digest: strip(hashTypedData(typed)), termsSignature: await account.sign({ hash: `0x${termsHash}` }), bindingSignature: await account.signTypedData(typed) };
}
const seller = await statement('seller', SELLER_KEY, BUYER_KEY), buyer = await statement('buyer', BUYER_KEY, SELLER_KEY);
const acceptance = s => ({ binding: s.binding, termsSignature: s.termsSignature, bindingSignature: s.bindingSignature });
// Canonical field order (the same order as the version 1 envelope).
const offer = JSON.stringify({ v: 2, type: 'terms-offer', ad, orderId: terms.orderId, sender: SELLER_KEY, recipient: BUYER_KEY, nonce: 'a5'.repeat(32),
  expiresAtSeconds: expires, termsHash, body: { terms: reviewText, acceptance: acceptance(seller) } });
const accept = JSON.stringify({ v: 2, type: 'terms-accept', ad, orderId: terms.orderId, sender: BUYER_KEY, recipient: SELLER_KEY, nonce: '5a'.repeat(32),
  expiresAtSeconds: expires, termsHash, body: { revision: terms.revision, acceptance: acceptance(buyer) } });
const sha = text => createHash('sha256').update(text).digest('hex');
const fixture = {
  notice: 'SYNTHETIC D1 version 2 carrier vectors from public scenario keys. Cross-implementation encoding evidence, not independent protocol approval.',
  generator: { script: 'packages/wallet/test/fixtures/peer-acceptance-v2-generate.mjs', viem: VIEM, nobleCurves: NOBLE },
  domain: scenario.domain, terms, messagingKeys: { seller: SELLER_KEY, buyer: BUYER_KEY },
  domainSeparator: strip(hashDomain({ domain, types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } })),
  tradeTermsStructHash: strip(hashStruct({ data: tradeMessage, primaryType: 'TradeTerms', types: { TradeTerms: types.TradeTerms } })),
  termsHash,
  peerAcceptanceTypeHash: strip(keccak256(toHex('PeerAcceptance(uint8 v,bytes32 termsHash,uint8 role,address account,bytes32 ownMessagingKey,bytes32 counterpartyMessagingKey,uint64 notAfterSeconds)'))),
  statements: [seller, buyer],
  envelopes: [{ type: 'terms-offer', text: offer, sha256: sha(offer) }, { type: 'terms-accept', text: accept, sha256: sha(accept) }],
};
const output = JSON.stringify(fixture, null, 2) + '\n';
await writeFile(new URL('./peer-acceptance-v2-carrier.json', import.meta.url), output);
console.log(`peer-acceptance-v2-carrier.json sha256 ${sha(output)}`);
