/**
 * Localnet build profile root (A3 placeholder). Rendered by main.tsx only when `__P2P_LOCALNET__` (the library-only
 * localnet build); every other build removes the lazy import and refuses this subtree. The journey lane replaces the body
 * with the localnet wallet/offer/fund/confirm/release/refund journey. Test funds only; ReleaseEnabled stays 0.
 */
import { useEffect, useState } from 'react';
import { EvmChainReader } from '../../../../packages/chain-evm/localnet.ts';
import { createEvmTxLifecycle, createTradeAuthority, RELEASE_ENABLED } from '../../../../packages/domain/localnet.ts';
import { CandidatePeerReplayLedger, EvmWalletAdapter } from '../../../../packages/wallet/localnet.ts';
import { createTermsExchange } from '../../../../packages/exchange/index.ts';
import { createRelayPool } from '../../../../packages/relay/index.ts';
import { LOCALNET_BANNER, loadInjectedLocalnetConfig, type LocalnetConfig } from './config.ts';

/** Placeholder copy (English only, localnet build only); the journey lane moves user-facing copy into its catalog. */
const COPY = Object.freeze({
  banner: LOCALNET_BANNER,
  checking: 'Checking the local test network configuration.',
  ready: 'Local test network configuration verified. Release stays disabled (ReleaseEnabled 0); nothing has connected.',
  refused: 'The local test network configuration was refused. Nothing was started.',
});
/**
 * Build-pipeline probe only: referencing the localnet modules keeps them in the module graph, so the localnet build policy
 * (module allowlist, relay WebSocket token, @noble license credits) is exercised end to end. Nothing is constructed here.
 */
const LOCALNET_MODULES_PRESENT = [EvmChainReader, createEvmTxLifecycle, createTradeAuthority, EvmWalletAdapter, CandidatePeerReplayLedger, createTermsExchange, createRelayPool]
  .every(value => typeof value === 'function') && RELEASE_ENABLED === 0;

type ConfigState = { readonly kind: 'checking' } | { readonly kind: 'ready'; readonly config: LocalnetConfig } | { readonly kind: 'refused' };

export function LocalnetRoot() {
  const [state, setState] = useState<ConfigState>({ kind: 'checking' });
  useEffect(() => {
    let ended = false;
    loadInjectedLocalnetConfig().then(config => { if (!ended) setState({ kind: 'ready', config }); }, () => { if (!ended) setState({ kind: 'refused' }); });
    return () => { ended = true; };
  }, []);
  const status = state.kind === 'ready' && LOCALNET_MODULES_PRESENT ? COPY.ready : state.kind === 'checking' ? COPY.checking : COPY.refused;
  return (
    <main data-profile="localnet" data-release-enabled="0">
      <p role="alert">{COPY.banner}</p>
      <p role="status">{status}</p>
    </main>
  );
}
