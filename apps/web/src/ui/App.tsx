import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppServices } from '../app-services.ts';
import { messages as m } from './messages.ts';
import { errorMessage, parseRoute } from './routes.ts';
import { Home, Recovery, Settings, UnavailablePage, pageTitle } from './Pages.tsx';
import type { TradeReviewController } from '../trade/review-controller.ts';
import { OffersPage, TradePage, useTradeReview } from './trade/TradePages.tsx';

const locked = Object.freeze({ state: 'locked' as const });
const noSubscription = () => () => {};
const lockedSnapshot = () => locked;
const links = [{ page: 'home', text: m.home }, { page: 'offers', text: m.offers }, { page: 'recovery', text: m.recovery }, { page: 'settings', text: m.settings }] as const;

export interface AppProps {
  readonly services: AppServices | null; readonly starting?: boolean; readonly startupError?: string | undefined;
  /** Local terms review session; encrypted save/load use its injected session-bound persistence port. */
  readonly trade?: TradeReviewController | null;
}

export function App({ services, starting = false, startupError, trade = null }: AppProps) {
  const tradeSnapshot = useTradeReview(trade);
  const syntheticDemo = tradeSnapshot.registry.kind === 'ready' && tradeSnapshot.registry.label === 'synthetic-demo';
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const current = useSyncExternalStore(services?.subscribe ?? noSubscription, services?.getSnapshot ?? lockedSnapshot, lockedSnapshot);
  const main = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const initialRoute = useRef(true);
  const mounted = useRef(true);
  const commandSequence = useRef(0);
  const locking = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const navigate = () => { setRoute(parseRoute(window.location.hash)); setNotice(''); };
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
    if (!services || (kind === 'status' && pending) || (kind === 'lock' && locking.current)) return;
    const sequence = ++commandSequence.current;
    if (kind === 'lock') locking.current = true;
    setPending(kind === 'lock' ? m.locking : m.refreshing); setNotice('');
    try {
      const result = await services[kind]();
      if (mounted.current && sequence === commandSequence.current && !result.ok) setNotice(errorMessage(result.error.code));
    } catch { if (mounted.current && sequence === commandSequence.current) setNotice(errorMessage('PROTOCOL_ERROR')); }
    finally {
      if (kind === 'lock') locking.current = false;
      if (mounted.current && sequence === commandSequence.current) setPending('');
    }
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
          {syntheticDemo ? <strong className="demo-badge">{m.syntheticDemo}</strong> : null}</div>
        <div className="vault-controls"><span role="status">{current.state === 'unlocked' ? m.unlocked : m.locked}</span>
          {services ? <button type="button" onClick={() => void command('status')} disabled={!!pending}>{m.refresh}</button> : null}
          {services && current.state === 'unlocked' ? <button type="button" onClick={() => void command('lock')} disabled={pending === m.locking}>{m.lock}</button> : null}
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        <p className="eyebrow">{m.development}</p><h1 ref={title} tabIndex={-1}>{pageTitle[route.page]}</h1>
        <p className="network-note">{m.networkHelp}</p>
        {starting ? <p className="notice" role="status">{m.starting}</p> : !services ? <p className="notice error" role="alert">{startupError ? errorMessage(startupError) : m.unavailable}</p> : null}
        {pending ? <p role="status">{pending}</p> : null}
        {notice ? <p className="notice error" role="alert">{notice}</p> : null}
        {route.page === 'home' ? <Home services={services} unlocked={current.state === 'unlocked'} /> :
          route.page === 'recovery' ? <Recovery services={services} /> : route.page === 'settings' ? <Settings /> :
          route.page === 'offers' ? <OffersPage trade={trade} /> : route.page === 'trade' ? <TradePage trade={trade} localId={route.localId} /> :
          <UnavailablePage page={route.page} />}
      </main>
      <footer>{m.footer}</footer>
    </div>
  </div>;
}
