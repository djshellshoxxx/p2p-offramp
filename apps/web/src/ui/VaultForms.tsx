import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppServices } from '../app-services.ts';
import { messages as m } from './messages.ts';
import { errorMessage, isProfileId } from './routes.ts';

type Notice = { readonly error: boolean; readonly text: string } | null;
function NoticeText({ notice }: { readonly notice: Notice }) {
  return notice ? <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null;
}

export function UnlockForm({ services, onCancel }: { readonly services: AppServices; readonly onCancel: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    const element = form.current;
    element?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { request.current?.abort(); element?.reset(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const profile = element.elements.namedItem('profile') as HTMLInputElement;
    const passphrase = element.elements.namedItem('passphrase') as HTMLInputElement;
    let secret = passphrase.value;
    passphrase.value = '';
    if (!isProfileId(profile.value)) { secret = ''; setNotice({ error: true, text: m.profileInvalid }); return; }
    const controller = new AbortController();
    request.current = controller; setBusy(true); setNotice(null);
    try {
      const result = await services.unlock(profile.value, secret, controller.signal);
      secret = '';
      if (!controller.signal.aborted) {
        if (result.ok) { request.current = null; onCancel(); }
        else setNotice({ error: true, text: errorMessage(result.error.code) });
      }
    } catch {
      if (!controller.signal.aborted) setNotice({ error: true, text: errorMessage('PROTOCOL_ERROR') });
    } finally {
      secret = ''; passphrase.value = '';
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }

  return <form ref={form} onSubmit={submit} autoComplete="off" noValidate aria-label={m.unlock} aria-busy={busy}>
    <p>{m.unlockHelp}</p>
    <label htmlFor="unlock-profile">{m.profile}</label>
    <input id="unlock-profile" name="profile" type="text" required maxLength={32} pattern="[0-9a-f]{32}" autoCapitalize="none" spellCheck={false} aria-describedby="unlock-profile-help" readOnly={busy} />
    <p id="unlock-profile-help" className="helper">{m.profileHelp}</p>
    <label htmlFor="unlock-passphrase">{m.passphrase}</label>
    <input id="unlock-passphrase" name="passphrase" type="password" required maxLength={1024} autoComplete="off" aria-describedby="unlock-passphrase-help" readOnly={busy} />
    <p id="unlock-passphrase-help" className="helper">{m.passphraseHelp}</p>
    <div className="actions">
      <button className="primary" type="submit" disabled={busy}>{m.submitUnlock}</button>
      <button type="button" onClick={() => { request.current?.abort(); form.current?.reset(); onCancel(); }}>{m.cancel}</button>
    </div>
    {busy ? <p role="status">{m.unlocking}</p> : null}
    <NoticeText notice={notice} />
  </form>;
}

/** The only generated navigation target is a browser-created ciphertext download URL. */
function saveCiphertext(bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url; link.download = 'p2p-offramp-unchecked-backup.json'; link.rel = 'noopener noreferrer';
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

export function ExportForm({ services }: { readonly services: AppServices }) {
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const profile = element.elements.namedItem('profile') as HTMLInputElement;
    const consent = element.elements.namedItem('consent') as HTMLInputElement;
    if (!isProfileId(profile.value)) { setNotice({ error: true, text: m.profileInvalid }); return; }
    if (!consent.checked) { setNotice({ error: true, text: m.consentRequired }); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setNotice(null);
    try {
      const result = await services.exportEncrypted(profile.value, controller.signal);
      if (!controller.signal.aborted) {
        if (!result.ok) setNotice({ error: true, text: errorMessage(result.error.code) });
        else if (result.value.authentication !== 'not-checked') setNotice({ error: true, text: errorMessage('PROTOCOL_ERROR') });
        else { saveCiphertext(result.value.bytes); consent.checked = false; setNotice({ error: false, text: m.exported }); }
      }
    } catch {
      if (!controller.signal.aborted) setNotice({ error: true, text: errorMessage('PROTOCOL_ERROR') });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }

  return <form onSubmit={submit} autoComplete="off" noValidate aria-label={m.backupTitle} aria-busy={busy}>
    <label htmlFor="export-profile">{m.profile}</label>
    <input id="export-profile" name="profile" type="text" required maxLength={32} pattern="[0-9a-f]{32}" autoCapitalize="none" spellCheck={false} aria-describedby="export-profile-help" readOnly={busy} />
    <p id="export-profile-help" className="helper">{m.profileHelp}</p>
    <label className="checkbox-label" htmlFor="export-consent">
      <input id="export-consent" name="consent" type="checkbox" required disabled={busy} />
      <span>{m.consent}</span>
    </label>
    <button className="primary" type="submit" disabled={busy}>{m.export}</button>
    {busy ? <p role="status">{m.exporting}</p> : null}
    <NoticeText notice={notice} />
  </form>;
}
