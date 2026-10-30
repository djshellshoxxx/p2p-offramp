import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppServices } from '../app-services.ts';
import { messages as m } from './messages.ts';
import { errorMessage, isProfileId, parseRoute } from './routes.ts';
import { Home, Recovery, Settings, UnavailablePage, pageTitle } from './Pages.tsx';
import type { TradeReviewController } from '../trade/review-controller.ts';
import { OffersPage, TradePage, useTradeReview } from './trade/TradePages.tsx';

const locked = Object.freeze({ state: 'locked' as const });
const noSubscription = () => () => {};
const lockedSnapshot = () => locked;
const noScope = () => 0;
const links = [{ page: 'home', text: m.home }, { page: 'offers', text: m.offers }, { page: 'recovery', text: m.recovery }, { page: 'settings', text: m.settings }] as const;

export interface AppProps {
  readonly services: AppServices | null; readonly starting?: boolean; readonly startupError?: string | undefined;
  /** Local terms review session; null when unavailable. Independent of the vault runtime. */
  readonly trade?: TradeReviewController | null;
}

export function App({ services, starting = false, startupError, trade = null }: AppProps) {
  const tradeSnapshot = useTradeReview(trade);
  const syntheticDemo = tradeSnapshot.registry.kind === 'ready' && tradeSnapshot.registry.label === 'synthetic-demo';
  const testnet = tradeSnapshot.registry.kind === 'ready' && tradeSnapshot.registry.label === 'sepolia-testnet';
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  // A confirmed restore may offer an explicit handoff; never persist selection or put it in a route.
  const [restoredProfileId, setRestoredProfileId] = useState('');
  const current = useSyncExternalStore(services?.subscribe ?? noSubscription, services?.getSnapshot ?? lockedSnapshot, lockedSnapshot);
  const scope = useSyncExternalStore(services?.subscribe ?? noSubscription, services?.selectionScope ?? noScope, noScope);
  // Reviews loaded from a profile belong to that selection only: any lock, unlock or switch clears them.
  // Layout effect: a locked or switched profile's loaded reviews are dropped before the browser paints, not one frame later.
  useLayoutEffect(() => { trade?.forgetSaved(); }, [trade, scope]);
  const store = services && current.state === 'unlocked' ? services : null;
  const main = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const initialRoute = useRef(true);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const navigate = () => {
      const next = parseRoute(window.location.hash);
      setRoute(next); setNotice('');
      if (next.page !== 'home') setRestoredProfileId('');
    };
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener('hashchange', navigate);
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    return () => {
      mounted.current = false;
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity);
    };
  }, []);
  useEffect(() => { document.title = `${pageTitle[route.page]} · ${m.appName}`; }, [route.page]);
  useEffect(() => {
    if (initialRoute.current) initialRoute.current = false;
    else title.current?.focus();
  }, [route]);

  async function command(kind: 'lock' | 'status') {
    if (!services || pending) return;
    setPending(kind === 'lock' ? m.locking : m.refreshing); setNotice('');
    try {
      const result = await services[kind]();
      if (mounted.current && !result.ok) setNotice(errorMessage(result.error.code));
    } catch { if (mounted.current) setNotice(errorMessage('PROTOCOL_ERROR')); }
    finally { if (mounted.current) setPending(''); }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); main.current?.focus(); }}>{m.skip}</a>
    <aside className="sidebar">
      <a className="brand" href="#/home"><span className="brand-symbol" aria-hidden="true">↔</span><span>{m.appName}<small>{m.development}</small></span></a>
      <nav aria-label={m.navLabel}>{links.map(link => <a key={link.page} href={`#/${link.page}`} aria-current={route.page === link.page ? 'page' : undefined}>{link.text}</a>)}</nav>
      <div className="sidebar-note"><span className="status-dot" aria-hidden="true" />{m.fundsDisabled}</div>
    </aside>
    <div className="workspace">
      <header className="status-bar">
        <div><strong>{m.fundsDisabled}</strong><span>{m.networkDisabled}</span><span>{online ? m.online : m.offline}</span>
          {syntheticDemo ? <strong className="demo-badge">{m.syntheticDemo}</strong> : null}
          {testnet ? <strong className="demo-badge">{m.testnet}</strong> : null}</div>
        <div className="vault-controls"><span role="status">{current.state === 'unlocked' ? m.unlocked : m.locked}</span>
          {services ? <button type="button" onClick={() => void command('status')} disabled={!!pending}>{m.refresh}</button> : null}
          {services && current.state === 'unlocked' ? <button type="button" onClick={() => void command('lock')} disabled={!!pending}>{m.lock}</button> : null}
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        <p className="eyebrow">{m.development}</p><h1 ref={title} tabIndex={-1}>{pageTitle[route.page]}</h1>
        <p className="network-note">{m.networkHelp}</p>
        {starting ? <p className="notice" role="status">{m.starting}</p> : !services ? <p className="notice error" role="alert">{startupError ? errorMessage(startupError) : m.unavailable}</p> : null}
        {pending ? <p role="status">{pending}</p> : null}
        {notice ? <p className="notice error" role="alert">{notice}</p> : null}
        {route.page === 'home' ? <Home services={services} unlocked={current.state === 'unlocked'} restoredProfileId={restoredProfileId} onSelectionConsumed={() => setRestoredProfileId('')} /> :
          route.page === 'recovery' ? <Recovery services={services} onOpenRestored={id => {
            if (!isProfileId(id)) return;
            setRestoredProfileId(id); window.location.hash = '#/home';
          }} /> : route.page === 'settings' ? <Settings /> :
          route.page === 'offers' ? <OffersPage trade={trade} store={store} /> : route.page === 'trade' ? <TradePage trade={trade} localId={route.localId} store={store} /> :
          <UnavailablePage page={route.page} />}
      </main>
      <footer>{m.footer}</footer>
    </div>
  </div>;
}
