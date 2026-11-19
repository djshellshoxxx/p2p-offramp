import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/app.css';

const host = document.getElementById('root');
if (!host) throw new Error('The local application shell could not start.');
// Compile-time selection keeps each artifact's native worker and dependency graph independent.
const Root = __P2P_LOCALNET__
  ? lazy(async () => ({ default: (await import('./localnet/LocalnetRoot.tsx')).LocalnetRoot }))
  : lazy(async () => ({ default: (await import('./OfflineRoot.tsx')).OfflineRoot }));
createRoot(host).render(<Suspense fallback={null}><Root /></Suspense>);
