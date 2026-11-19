import type { AppServices } from '../app-services.ts';
import type { TradeReviewController } from '../trade/review-controller.ts';
import type { QrTrustedContext } from './review-controller.ts';

const owners = new WeakMap<object, number>(); let nextOwner = 0;
/** Read only the current application owner and registry-reviewed terms; a scanned chain never changes this list. */
export function trustedQrContext(services: AppServices | null, trade: TradeReviewController | null): QrTrustedContext {
  let owner = 0;
  if (services) { owner = owners.get(services) ?? ++nextOwner; owners.set(services, owner); }
  const state = trade?.getSnapshot(), registry = state?.registry;
  const now = Math.floor(Date.now() / 1000);
  const ready = registry?.kind === 'ready' && (registry.trust === null || registry.trust.expiresAt > now + 60);
  const chains = ready ? [...new Set(state!.reviews.map(item => `evm:${item.review.network.chainId}`))].sort() : [];
  return Object.freeze({ scope: `${owner}:${services?.selectionScope() ?? 0}:${registry?.kind ?? 'none'}:${ready ? registry.label : ''}:${ready && registry.trust ? `${registry.trust.keyId}:${registry.trust.sequence}:${registry.trust.expiresAt}` : ''}`,
    chains: Object.freeze(chains) });
}
