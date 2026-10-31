/** Explicit unapproved local fixture. No private key enters the browser, no default-app trust is configured. */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { verifyRelease } from '../../packages/security/index.ts';
import { createDiagnostics } from '../../packages/diagnostics/index.ts';
import { DiagnosticsPanel } from '../../apps/web/src/ui/DiagnosticsPanel.tsx';
import '../../apps/web/src/ui/app.css';
export async function mountDiagnosticsFixture(corpus) {
  let current = true;
  const proof = await verifyRelease(Uint8Array.from(corpus.bytes), corpus.envelope, [corpus.key], 0, {
    channel: corpus.channel, nowSeconds: () => 1500, isCurrent: () => current,
    assets: corpus.assets.map(asset => ({ path: asset.path, bytes: Uint8Array.from(asset.bytes) })),
  });
  if (!proof.ok) throw new Error('DIAGNOSTICS_FIXTURE_PROOF_REFUSED');
  const storage = { read: () => localStorage.getItem('fixture-diagnostics'), write: value => localStorage.setItem('fixture-diagnostics', value), clear: () => localStorage.removeItem('fixture-diagnostics') };
  const service = createDiagnostics({ release: proof.value, storage, storageSchema: 1, nowSeconds: () => 1500 });
  for (const errorCode of ['TIMEOUT', 'LOCKED']) {
    const result = service.record({ module: 'runtime', errorCode, operation: 'unlock', routeState: 'unsupported', chainNamespace: 'none' });
    if (!result.ok) throw new Error('DIAGNOSTICS_FIXTURE_RECORD_REFUSED');
  }
  createRoot(document.getElementById('root')).render(createElement(DiagnosticsPanel, { service }));
  window.revokeDiagnosticsFixture = () => { current = false; };
  return { verifiedFixture: true, tradingEnabled: false, approvedRelease: false };
}
