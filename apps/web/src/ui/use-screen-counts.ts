import { useLayoutEffect, useState } from 'react';
import { createScreenCounts, type ScreenCategory, type ScreenCountsController } from '../analytics/screen-counts.ts';

/** Retire before paint on selection changes; StrictMode replay gets a fresh off session. */
export function useScreenCounts(owner: object | null, scope: number, category: ScreenCategory | null): ScreenCountsController {
  const [session, setSession] = useState(createScreenCounts);
  const [visibilityRevision, setVisibilityRevision] = useState(0);
  useLayoutEffect(() => {
    if (session.controller.getSnapshot().retired) { setSession(createScreenCounts()); return; }
    const visibility = () => {
      if (document.visibilityState !== 'visible') session.observer.commit(null, false);
      setVisibilityRevision(value => value + 1);
    };
    const hide = () => session.observer.retire();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) { session.observer.retire(); setSession(createScreenCounts()); }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
      session.observer.retire();
    };
  }, [session, owner, scope]);
  useLayoutEffect(() => { session.observer.commit(category, document.visibilityState === 'visible'); }, [session, category, visibilityRevision]);
  return session.controller;
}
