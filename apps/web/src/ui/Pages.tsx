import { useEffect, useRef, useState } from 'react';
import type { AppServices } from '../app-services.ts';
import { ExportForm, UnlockForm } from './VaultForms.tsx';
import { messages as m } from './messages.ts';
import type { Route } from './routes.ts';

export const pageTitle: Readonly<Record<Route['page'], string>> = {
  home: m.homeTitle, offers: m.offersTitle, trade: m.tradeTitle,
  recovery: m.recoveryTitle, settings: m.settingsTitle, unknown: m.unknownTitle,
};

export function Home({ services, unlocked }: { readonly services: AppServices | null; readonly unlocked: boolean }) {
  const [showUnlock, setShowUnlock] = useState(false);
  const unlockButton = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    if (previouslyOpen.current && !showUnlock) unlockButton.current?.focus();
    previouslyOpen.current = showUnlock;
  }, [showUnlock]);
  return <>
    <p className="lead">{m.homeIntro}</p>
    <section className="panel" aria-labelledby="available-title">
      <p className="eyebrow">{m.localOnly}</p>
      <h2 id="available-title">{m.readyTitle}</h2>
      <p>{services ? m.readyText : m.unavailable}</p>
      {unlocked ? <p role="status">{m.unlockedHelp}</p> : services ? showUnlock
        ? <UnlockForm services={services} onCancel={() => setShowUnlock(false)} />
        : <button ref={unlockButton} className="primary" type="button" onClick={() => setShowUnlock(true)}>{m.unlock}</button>
        : null}
    </section>
    <section className="plain-section" aria-labelledby="disabled-title">
      <h2 id="disabled-title">{m.disabledTitle}</h2><p>{m.disabledText}</p>
      <a href="#/recovery">{m.openRecovery}<span aria-hidden="true"> →</span></a>
    </section>
  </>;
}

export function Recovery({ services }: { readonly services: AppServices | null }) {
  return <>
    <p className="lead">{m.recoveryIntro}</p>
    <section className="plain-section" aria-labelledby="origin-title"><h2 id="origin-title">{m.originTitle}</h2><p>{m.originHelp}</p></section>
    <section className="panel" aria-labelledby="backup-title">
      <h2 id="backup-title">{m.backupTitle}</h2><p>{m.backupHelp}</p>
      <div className="warning"><strong>{m.unchecked}</strong><p>{m.uncheckedHelp}</p></div>
      {services ? <ExportForm services={services} /> : <p>{m.unavailable}</p>}
    </section>
    <section className="plain-section" aria-labelledby="restore-title"><h2 id="restore-title">{m.restoreTitle}</h2><p>{m.restoreHelp}</p><p>{m.recoveryRisk}</p></section>
  </>;
}

export function Settings() {
  return <><p className="lead">{m.settingsIntro}</p>
    <section className="plain-section" aria-labelledby="privacy-title"><h2 id="privacy-title">{m.privacyTitle}</h2><p>{m.privacyHelp}</p></section>
    <section className="plain-section" aria-labelledby="trust-title"><h2 id="trust-title">{m.trustTitle}</h2><p>{m.trustHelp}</p></section>
    <section className="warning" aria-labelledby="framing-title"><h2 id="framing-title">{m.framingTitle}</h2><p>{m.framingHelp}</p></section>
    <section className="plain-section" aria-labelledby="locale-title"><h2 id="locale-title">{m.localeTitle}</h2><p>{m.localeHelp}</p></section>
  </>;
}

export function UnavailablePage({ page }: { readonly page: 'offers' | 'trade' | 'unknown' }) {
  const intro = page === 'offers' ? m.offersIntro : page === 'trade' ? m.tradeIntro : m.unknownHelp;
  return <section className="empty-state"><p className="lead">{intro}</p>
    {page === 'offers' ? <p>{m.offersHelp}</p> : page === 'trade' ? <p>{m.tradeHelp}</p> : null}
    <div className="actions"><a href="#/home">{m.returnHome}</a><a href="#/recovery">{m.openRecovery}</a></div>
  </section>;
}
