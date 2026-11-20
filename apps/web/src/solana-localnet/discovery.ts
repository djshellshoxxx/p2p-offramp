/** Wallet Standard event discovery, pinned interface: wallet-standard/wallet-standard@c49b56d6 core/app and core/base/window. */
import type { BrowserSolanaWallet } from './wallet-bridge.ts';
export interface DiscoveredSolanaWallet { readonly id: number; readonly name: string; readonly wallet: BrowserSolanaWallet }
export function discoverSolanaWallets(onChange: (wallets: readonly DiscoveredSolanaWallet[]) => void): () => void {
  const wallets = new Map<BrowserSolanaWallet, DiscoveredSolanaWallet>(); let next = 0, closed = false;
  const emit = () => { if (!closed) onChange([...wallets.values()]); };
  const api = Object.freeze({ register(...inputs: BrowserSolanaWallet[]) {
    const added: BrowserSolanaWallet[] = [];
    for (const wallet of inputs.slice(0, 16)) {
      if (closed || wallets.size >= 16 || !wallet || typeof wallet !== 'object' || wallets.has(wallet)) continue;
      try {
        const name = wallet.name;
        if (typeof name !== 'string' || !name || name.length > 80) continue;
        wallets.set(wallet, { id: ++next, name, wallet }); added.push(wallet);
      } catch { /* One hostile discovery record cannot connect or sign. */ }
    }
    emit(); return () => { for (const wallet of added) wallets.delete(wallet); emit(); };
  } });
  const register = (event: Event) => {
    try { const callback = (event as CustomEvent<unknown>).detail; if (typeof callback === 'function') callback(api); } catch { /* No permission is granted. */ }
  };
  window.addEventListener('wallet-standard:register-wallet', register);
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  emit();
  return () => { closed = true; window.removeEventListener('wallet-standard:register-wallet', register); wallets.clear(); };
}
