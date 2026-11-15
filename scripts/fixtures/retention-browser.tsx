/** LOCALPROOF entry: actual UI and AppServices, with separate development-only fixture controls. */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startAppServices, type AppServices } from '../../apps/web/src/app-services.ts';
import { RetentionPanel } from '../../apps/web/src/ui/RetentionPanel.tsx';
import { Recovery, Home } from '../../apps/web/src/ui/Pages.tsx';
import { parseRuntimeMessage, type RuntimeRetentionPreview, type RuntimeRetentionDelete, type RuntimeRestore } from '../../packages/schemas/index.ts';

const PASS = 'Synthetic local retention browser passphrase';
const good = <T,>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T => {
  if (!result.ok) throw Error(result.error.code); return result.value;
};
const worker = () => new Worker('/retention-worker.js', { type: 'module' });
const primary = worker();
interface FixtureStats { readonly profileId: string; readonly revision: number; readonly writes: number; readonly journalPutWrites: number;
  readonly factories: number; readonly total: number; readonly identity: number; readonly journal: number; readonly review: number; readonly chat: number; }
const seen = { previews: [] as RuntimeRetentionPreview[], deletes: [] as RuntimeRetentionDelete[], restores: [] as RuntimeRestore[] };
primary.addEventListener('message', ({ data }) => {
  const message = parseRuntimeMessage(data);
  if (message.kind !== 'response' || !message.result.ok) return;
  if (message.operation === 'planRetention' || message.operation === 'reviewRetention') seen.previews.push(message.result.value as RuntimeRetentionPreview);
  if (message.operation === 'deleteReviewedRecords') seen.deletes.push(message.result.value as RuntimeRetentionDelete);
  if (message.operation === 'restore') seen.restores.push(message.result.value as RuntimeRestore);
});
async function fixture(target: Worker, operation: string, kind?: string): Promise<FixtureStats> {
  const channel = new MessageChannel();
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { channel.port1.close(); fail(Error('FIXTURE_TIMEOUT')); }, 120_000);
    channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); try { done(good(data)); } catch (error) { fail(error); } };
    target.postMessage({ fixture: 'retention-localproof', operation, kind }, [channel.port2]);
  });
}
const services = good(await startAppServices({ createWorker: () => primary, lifecycle: false }));
let selected = '';
const harness = {
  seen,
  async create() { const result = good(await services.create(PASS)); selected = result.profileId; return result; },
  seed: () => fixture(primary, 'seed'), stats: () => fixture(primary, 'stats'),
  mutate: (kind: string) => fixture(primary, 'mutate', kind),
  async lock() { return good(await services.lock()); },
  async unlock(profileId = selected) {
    selected = profileId;
    // Cancellation deliberately locks the real runtime. Wait for that ordered control reply,
    // then issue one explicit unlock; never retry a mutation or a native send.
    for (let i = 0; i < 100; i++) {
      const status = await services.status();
      if (status.ok) return good(await services.unlock(profileId, PASS));
      if (status.error.code !== 'BUSY') throw Error(status.error.code);
      await new Promise(done => setTimeout(done, 20));
    }
    throw Error('FIXTURE_CONTROL_NOT_DRAINED');
  },
  async restore(encoded: string) {
    good(await services.lock());
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    try { const result = good(await services.restore(bytes, PASS, PASS)); selected = result.newProfileId; await harness.unlock(); return result; }
    finally { bytes.fill(0); }
  },
  async export() {
    if (!services.profileId) throw Error('LOCKED');
    const result = good(await services.exportEncrypted(services.profileId));
    const url = URL.createObjectURL(new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'old-retention-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0); result.bytes.fill(0);
  },
  async secondWorkerWrite() {
    const profileId = services.profileId; if (!profileId) throw Error('LOCKED');
    const other = good(await startAppServices({ createWorker: worker, lifecycle: false }));
    try {
      good(await other.unlock(profileId, PASS));
      const configuration = await (await fetch('/configuration.json')).json();
      const changed = structuredClone(configuration.document); changed.terms.sellerNonce = 'ab'.repeat(32);
      const bytes = new TextEncoder().encode(JSON.stringify(changed));
      try { return good(await other.saveTermsReview('file', bytes)); } finally { bytes.fill(0); }
    } finally { await other.dispose(); }
  },
  async staleDelete(preview: RuntimeRetentionPreview) {
    return services.deleteReviewedRecords({ previewId: preview.previewId, expectedRevision: preview.revision,
      consentRevision: preview.revision, reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true });
  },
};
declare global { interface Window { __retention: typeof harness; } }
window.__retention = harness;
function App({ services }: { services: AppServices }) {
  const [notice, setNotice] = useState('Ready'), [restored, setRestored] = useState(''), [unlocked, setUnlocked] = useState(false), [recovery, setRecovery] = useState(false);
  useEffect(() => services.subscribe(() => setUnlocked(services.current.state === 'unlocked')), [services]);
  const action = async (name: 'create' | 'seed' | 'export' | 'lock' | 'unlock') => {
    try { await harness[name](); setNotice(name + ' complete'); } catch (error) { setNotice(error instanceof Error ? error.message : 'FIXTURE_FAILED'); }
  };
  return <main>
    <h1>LOCALPROOF native retention</h1>
    <div>{(['create', 'seed', 'export', 'lock', 'unlock'] as const).map(name =>
      <button key={name} data-fixture={name} onClick={() => { void action(name); }}>{name} fixture</button>)}</div>
    <p data-fixture-status="">{notice}</p>
    <RetentionPanel services={services} />
    <button data-fixture="show-recovery" onClick={() => setRecovery(true)}>Show actual recovery UI</button>
    {recovery ? <div data-fixture-recovery=""><Recovery services={services} onOpenRestored={setRestored} /></div> : null}
    {restored ? <div data-fixture-home=""><Home services={services} unlocked={unlocked} restoredProfileId={restored} onSelectionConsumed={() => setRestored('')} /></div> : null}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App services={services} />);
