import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startAppServices, type AppServices } from './app-services.ts';
import { App } from './ui/App.tsx';
import { createTradeReviewController, noApprovedRegistry, type RegistrySource, type TradeReviewController } from './trade/review-controller.ts';
import './ui/app.css';

/**
 * Compile-time constants from vite.config.ts: `__P2P_SYNTHETIC_DEMO__` is true only for the `demo` build and
 * `__P2P_TESTNET__` only for the `testnet` build. When false the bundler removes the module entirely; the build-policy
 * scan checks that no synthetic or testnet data reaches any other artifact.
 */
const registrySource: RegistrySource = __P2P_SYNTHETIC_DEMO__
  ? async () => (await import('./demo/synthetic-local.ts')).syntheticDemoSource()
  : __P2P_TESTNET__
    ? async () => (await import('./testnet/sepolia-source.ts')).sepoliaRegistrySource(__P2P_TESTNET_TRUST__)()
    : noApprovedRegistry;

/**
 * One controller for the page lifetime. It is not disposed in an effect cleanup (that would break under StrictMode's
 * double effects); it holds no external resources, and pagehide discards any in-flight local check.
 */
function useTradeReviewController(): TradeReviewController {
  const [trade] = useState(() => createTradeReviewController({ source: registrySource }));
  useEffect(() => {
    void trade.loadRegistry();
    const pagehide = (event: PageTransitionEvent) => { if (!event.persisted) trade.dispose(); };
    window.addEventListener('pagehide', pagehide);
    return () => window.removeEventListener('pagehide', pagehide);
  }, [trade]);
  return trade;
}

function Bootstrap() {
  const trade = useTradeReviewController();
  const [services, setServices] = useState<AppServices | null>(null);
  const [starting, setStarting] = useState(true);
  const [startupError, setStartupError] = useState<string>();
  useEffect(() => {
    trade.setPersistence(services);
    return () => trade.setPersistence(null);
  }, [trade, services]);
  useEffect(() => {
    let ended = false;
    let owned: AppServices | null = null;
    const dispose = () => { ended = true; if (owned) void owned.dispose(); };
    const pagehide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
    window.addEventListener('pagehide', pagehide);
    void (async () => {
      try {
        const result = await startAppServices();
        if (ended) { if (result.ok) await result.value.dispose(); return; }
        if (result.ok) { owned = result.value; setServices(result.value); }
        else setStartupError(result.error.code);
      } catch { if (!ended) setStartupError('PROTOCOL_ERROR'); }
      finally { if (!ended) setStarting(false); }
    })();
    return () => { window.removeEventListener('pagehide', pagehide); dispose(); };
  }, []);
  return <App services={services} starting={starting} startupError={startupError} trade={trade} />;
}

const host = document.getElementById('root');
if (!host) throw new Error('The local application shell could not start.');
createRoot(host).render(<Bootstrap />);
