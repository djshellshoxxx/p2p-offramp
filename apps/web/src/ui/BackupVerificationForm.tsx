import { LocalPolicyError, localPolicyCode, runBoundedImport } from '../content-policy/local-policy.ts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_BACKUP_BYTES, type AppServices } from '../app-services.ts';
import type { BackupVerificationReceipt } from '../../../../packages/schemas/index.ts';
import { ControlHelp } from './ControlHelp.tsx';
import { messages as m } from './messages.ts';
import { errorMessage } from './routes.ts';

type Notice = { readonly error: boolean; readonly text: string } | null;
/** Explicit file authentication only. No cached display receipt is a current-read or spending capability. */
export function BackupVerificationForm({ services }: { readonly services: AppServices }) {
  const form = useRef<HTMLFormElement>(null), request = useRef<AbortController | null>(null);
  const mounted = useRef(true), generation = useRef(0), selection = useRef(services.selectionScope());
  const [unlocked, setUnlocked] = useState(services.current.state === 'unlocked');
  const [busy, setBusy] = useState<'verify' | 'check' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<{ readonly scope: number; readonly owner: AppServices; readonly value: BackupVerificationReceipt } | null>(null);
  useEffect(() => {
    mounted.current = true; selection.current = services.selectionScope();
    // A replacement facade can reuse the same numeric scope; its previous job/display still belong to another owner.
    setUnlocked(services.current.state === 'unlocked'); setBusy(null); setNotice(null); setReceipt(null);
    const update = () => {
      const next = services.selectionScope();
      setUnlocked(services.current.state === 'unlocked');
      if (selection.current === next) return;
      selection.current = next; generation.current++; request.current?.abort(); request.current = null;
      form.current?.reset(); setReceipt(null); setNotice(null); setBusy(null);
    };
    const stop = services.subscribe(update); update();
    return () => { mounted.current = false; generation.current++; request.current?.abort(); request.current = null; form.current?.reset(); stop(); };
  }, [services]);
  const cancel = () => {
    generation.current++; request.current?.abort(); request.current = null; form.current?.reset();
    setReceipt(null); setBusy(null); setNotice({error:false,text:m.backupVerifyCancelled});
  };
  async function run(kind: 'verify' | 'check', element?: HTMLFormElement) {
    if (busy) return;
    const input = element?.elements.namedItem('verification-passphrase') as HTMLInputElement | undefined;
    let secret = input?.value ?? ''; if (input) input.value = '';
    setReceipt(null); setNotice(null);
    if (services.current.state !== 'unlocked') { secret = ''; setNotice({error:true,text:m.backupVerifyLocked}); return; }
    const file = (element?.elements.namedItem('verification-file') as HTMLInputElement | undefined)?.files?.[0];
    if (kind === 'verify' && !file) { secret = ''; setNotice({error:true,text:m.backupVerifyFileRequired}); return; }
    if (file && file.size > MAX_BACKUP_BYTES) { secret = ''; setNotice({error:true,text:errorMessage('LIMIT_EXCEEDED')}); return; }
    const controller = new AbortController(), mine = ++generation.current, scope = services.selectionScope(), profileId = services.profileId;
    request.current = controller; setBusy(kind);
    const current = () => mounted.current && !controller.signal.aborted && generation.current === mine && services.selectionScope() === scope && services.current.state === 'unlocked' && services.profileId === profileId;
    try {
      if (kind === 'verify') {
        const result = await runBoundedImport('verify-backup', file!, controller.signal, bytes => { if (!current()) throw new LocalPolicyError('CANCELLED'); return services.verifyBackup(bytes,secret,controller.signal); }); secret = '';
        if (!current()) return;
        if (result.ok) setReceipt({scope,owner:services,value:result.value});
        else setNotice({error:true,text:result.error.code === 'CONFLICT' ? m.backupVerifyMismatch : errorMessage(result.error.code)});
      } else {
        const result = await services.checkBackupVerification(controller.signal);
        if (!current()) return;
        if (result.ok && result.value.verification) setReceipt({scope,owner:services,value:result.value.verification});
        else setNotice(result.ok ? {error:false,text:m.backupVerifyNone} : {error:true,text:errorMessage(result.error.code)});
      }
    } catch (error) { if (current()) { const code = localPolicyCode(error); setNotice({error:true,text:errorMessage(code === 'LOCAL_LIMIT_REACHED' ? 'BUSY' : code === 'LIMIT_EXCEEDED' || code === 'INVALID_INPUT' || code === 'CANCELLED' ? code : 'STORAGE_UNAVAILABLE')}); } }
    finally { secret = ''; if (mine === generation.current) { request.current = null; if (mounted.current) setBusy(null); } }
  }
  const visible = receipt?.owner === services && receipt.scope === services.selectionScope() && services.current.state === 'unlocked' && receipt.value.profileId === services.profileId ? receipt.value : null;
  return <form ref={form} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void run('verify',event.currentTarget); }} noValidate autoComplete="off" aria-label={m.backupVerifyTitle} aria-busy={busy !== null}>
    {!unlocked ? <p>{m.backupVerifyLocked}</p> : null}
    <label htmlFor="verification-file">{m.backupVerifyFile}</label>
    <input id="verification-file" name="verification-file" type="file" accept=".json,application/json" onChange={() => { setReceipt(null); setNotice(null); }} disabled={!unlocked || busy !== null} />
    <ControlHelp controlId="verification-file" label={m.backupVerifyFile} />
    <label htmlFor="verification-passphrase">{m.backupVerifyPassphrase}</label>
    <input id="verification-passphrase" name="verification-passphrase" type="password" maxLength={1024} autoComplete="off" onChange={() => { setReceipt(null); setNotice(null); }} readOnly={busy !== null} disabled={!unlocked} />
    <div className="actions">
      <button className="primary" type="submit" disabled={!unlocked || busy !== null}>{m.backupVerify}</button>
      <button type="button" onClick={() => { void run('check'); }} disabled={!unlocked || busy !== null}>{m.backupVerifyCheck}</button>
      {busy ? <button type="button" onClick={cancel}>{m.backupVerifyCancel}</button> : null}
    </div>
    {busy ? <p role="status">{busy === 'verify' ? m.backupVerifying : m.backupVerifyChecking}</p> : null}
    {notice ? <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null}
    {visible ? <div className="notice" role="status"><p>{m.backupVerified(visible.profileId,visible.revision)}</p>
      <dl><dt>{m.backupVerifyEnvelopeDigest}</dt><dd><code>{visible.envelopeSha256}</code></dd><dt>{m.backupVerifyFileDigest}</dt><dd><code>{visible.backupSha256}</code></dd></dl>
    </div> : null}
  </form>;
}
