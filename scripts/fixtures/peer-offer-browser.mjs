// Browser-only integration fixture. The public ad carries discovery metadata; private terms travel separately.
import { createAdEvent, createOrderBook, createRelayPool, AD_D_PREFIX, AD_KIND } from '../../packages/relay/index.ts';
import { createLocalNobleNostrProvider, createRelayEventCrypto, verifyEventSync } from '../../packages/nostr-crypto/index.ts';
import { loopbackRelayFixture, makeBroker } from '../../packages/relay/test/support/harness.mjs';

const nowSeconds = () => 1_690_000_000;

function openPeer(verifier, relayUrl) {
  const fixture = loopbackRelayFixture([{ wsUrl: relayUrl }]);
  const { broker } = makeBroker({
    endpoints: ['relay-a'], endpointURLs: fixture.endpointURLs, coverage: 'direct', mode: 'ordinary',
  });
  const pool = createRelayPool({ broker, relays: fixture.relays, connect: fixture.connect, verifier, nowSeconds });
  return { pool, close() { pool.close(); broker.dispose(); } };
}

export async function publishOffer(fields, relayUrl) {
  const provider = createLocalNobleNostrProvider();
  const { secretKey } = await provider.generate();
  let signer, peer;
  try {
    signer = await createRelayEventCrypto(provider, secretKey);
    peer = openPeer(signer, relayUrl);
    const event = await createAdEvent(signer, {
      app: 'p2p-offramp', v: 1, ...fields, maker: signer.pubkey, expiresAtSeconds: String(nowSeconds() + 600),
    }, nowSeconds());
    const ack = await peer.pool.publish(event);
    if (!ack.ok) throw Error('Publish failed: ' + ack.error);
    return { author: signer.pubkey, eventId: event.id, acknowledgments: ack.value };
  } finally {
    peer?.close();
    signer?.dispose();
    secretKey.fill(0);
  }
}

export async function subscribeToOrder(orderId, relayUrl) {
  // The buyer only verifies public signatures; it never receives the seller's signing key.
  const verifier = { verifyEvent(event) { try { verifyEventSync(event); return true; } catch { return false; } } };
  const peer = openPeer(verifier, relayUrl);
  const book = createOrderBook({ nowSeconds, verifier });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('No end-of-stored-events frame from fixture relay')), 10_000);
      const subscription = peer.pool.subscribe([
        { kinds: [AD_KIND], '#d': [AD_D_PREFIX + orderId], since: nowSeconds() - 60, limit: 10 },
      ], { onEvent: event => book.ingest(event), onEose: resolve });
      if (!subscription.ok) reject(Error('Subscription failed: ' + subscription.error));
    });
    return { offers: () => book.list(), close: () => peer.close() };
  } catch (error) {
    peer.close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
