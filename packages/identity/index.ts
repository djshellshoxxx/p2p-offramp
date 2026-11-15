/** Public G01 provider boundary: the local test provider and its interface only. The vault-backed service stays private. */
export { createLocalNobleIdentityProvider } from './src/noble-provider.ts';
export type { MessagingIdentityProvider } from './src/noble-provider.ts';

/** DATA01 purpose-specific Worker capability. Never exposes raw keys, message text or a generic signer/decryptor. */
export { createIdentityHistoryRetention } from './src/identity-service.ts';
export type { IdentityHistoryRetention, IdentityHistoryContext, IdentityHistoryDependencies } from './src/identity-service.ts';
