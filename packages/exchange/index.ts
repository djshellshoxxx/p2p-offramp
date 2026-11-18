/** Public boundary: NIP-17 encrypted G16 terms exchange. Relay and chat data are communication only; chain observation is authority. */
export { createRelayEventCrypto } from '../nostr-crypto/index.ts';
export * from './src/messages.ts';
export * from './src/machine.ts';
export * from './src/exchange.ts';
/** D1 version 2 carrier and the injected verifier/replay port types. No wallet or chain code lives in this package. */
export * from './src/peer-acceptance.ts';
