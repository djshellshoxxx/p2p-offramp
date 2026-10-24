import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startAppServices, type AppServices } from './app-services.ts';
import { App } from './ui/App.tsx';
import './ui/app.css';

function Bootstrap() {
  const [services, setServices] = useState<AppServices | null>(null);
  const [starting, setStarting] = useState(true);
  const [startupError, setStartupError] = useState<string>();
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
  return <App services={services} starting={starting} startupError={startupError} />;
}

const host = document.getElementById('root');
if (!host) throw new Error('The local application shell could not start.');
createRoot(host).render(<Bootstrap />);
