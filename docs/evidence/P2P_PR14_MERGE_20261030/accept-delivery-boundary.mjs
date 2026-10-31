// Review evidence for local negotiation semantics; actual source with synthetic crypto/review.
import assert from 'node:assert/strict';
import { keys, secret, termsBytes, options, loadExchange } from '../P2P_EXCHANGE_FINISH_20261030/lifecycle-harness.mjs';
const harness = await loadExchange(), observations = [];
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
try {
  for (const receiptAt of [149, 150, 151]) {
    const clocks = { buyer: 100, seller: 100 };
    const make = (publicKey, role) => harness.createTermsExchange({
      ...options({ publicKey: async () => publicKey }), selfPublicKey: publicKey, now: () => clocks[role],
    });
    const buyer = make(keys.self, 'buyer'), seller = make(keys.seller, 'seller');
    try {
      const take = value(await buyer.take('fixture', keys.addressA, secret));
      value(await seller.receive(take.recipientWrap, secret));
      const offer = value(await seller.offer(take.sessionId, termsBytes, secret));
      value(await buyer.receive(offer.recipientWrap, secret));
      clocks.buyer = 149;
      const accept = value(await buyer.accept(take.sessionId, termsBytes, secret));
      clocks.seller = receiptAt;
      const result = await seller.receive(accept.recipientWrap, secret);
      const row = { acceptedAt: 149, acceptBefore: 150, receiptAt, result: result.ok ? 'SUCCESS' : result.code,
        buyerState: buyer.session(take.sessionId).state, sellerState: seller.session(take.sessionId).state };
      assert.equal(row.buyerState, 'accepted');
      assert.equal(row.result, receiptAt < 150 ? 'SUCCESS' : 'EXPIRED');
      assert.equal(row.sellerState, receiptAt < 150 ? 'accepted' : 'offered');
      observations.push(row);
    } finally { buyer.close(); seller.close(); }
  }
  console.log(JSON.stringify({ qualification: 'actual exchange source with synthetic crypto/review; local records, no delivery guarantee or custody evidence', observations }, null, 2));
} finally { harness.close(); }
