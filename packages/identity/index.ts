/** Public G01 provider boundary: the local test provider and its interface only. The vault-backed service stays private. */
export { createLocalNobleIdentityProvider } from './src/noble-provider.ts';
export type { MessagingIdentityProvider } from './src/noble-provider.ts';
