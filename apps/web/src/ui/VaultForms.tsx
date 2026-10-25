import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_BACKUP_BYTES, MAX_VAULT_PROFILES, type AppServices, type RuntimeInventory } from '../app-services.ts';
import { messages as m } from './messages.ts';
import { errorMessage, isProfileId } from './routes.ts';

type Notice = { readonly error: boolean; readonly text: string } | null;
function NoticeText({ notice }: { readonly notice: Notice }) {
  return notice ? <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null;
}

/** Loads the opaque local inventory once; the text field stays the authoritative, editable input. */
function useInventory(services: AppServices): { readonly inventory: RuntimeInventory | null; readonly failed: boolean } {
  const [state, setState] = useState<{ inventory: RuntimeInventory | null; failed: boolean }>({ inventory: null, failed: false });
  useEffect(() => {
    const controller = new AbortController();
    void services.listProfiles(controller.signal).then(result => {
      if (!controller.signal.aborted) setState(result.ok ? { inventory: result.value, failed: false } : { inventory: null, failed: true });
    }, () => { if (!controller.signal.aborted) setState({ inventory: null, failed: true }); });
    return () => { controller.abort(); };
  }, [services]);
  return state;
}

function ProfileChoices({ inventory, failed, target, disabled }: { readonly inventory: RuntimeInventory | null; readonly failed: boolean;
  readonly target: string; readonly disabled: boolean }) {
  const choose = (id: string) => {
    const input = document.getElementById(target);
    if (input instanceof HTMLInputElement) { input.value = id; input.focus(); }
  };
  if (failed) return <p className="helper">{m.inventoryUnavailable}</p>;
  if (!inventory) return null;
  if (inventory.profileIds.length === 0) return <p className="helper">{m.inventoryEmpty}</p>;
  return <fieldset className="profile-choices" disabled={disabled}>
    <legend>{m.inventoryTitle(inventory.profileIds.length, MAX_VAULT_PROFILES)}</legend>
    <ul>{inventory.profileIds.map(id => <li key={id}><button type="button" onClick={() => choose(id)} aria-label={m.useProfile(id)}><code>{id}</code></button></li>)}</ul>
    {inventory.truncated ? <p className="helper">{m.inventoryTruncated}</p> : null}
  </fieldset>;
}

export function UnlockForm({ services, onCancel }: { readonly services: AppServices; readonly onCancel: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { inventory, failed } = useInventory(services);
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
    <ProfileChoices inventory={inventory} failed={failed} target="unlock-profile" disabled={busy} />
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
  const { inventory, failed } = useInventory(services);
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
    <ProfileChoices inventory={inventory} failed={failed} target="export-profile" disabled={busy} />
    <label className="checkbox-label" htmlFor="export-consent">
      <input id="export-consent" name="consent" type="checkbox" required disabled={busy} />
      <span>{m.consent}</span>
    </label>
    <button className="primary" type="submit" disabled={busy}>{m.export}</button>
    {busy ? <p role="status">{m.exporting}</p> : null}
    <NoticeText notice={notice} />
  </form>;
}

/** Reads and clears named password fields so secrets never sit in React state or the DOM after submit. */
function takeSecrets(element: HTMLFormElement, names: readonly string[]): string[] {
  return names.map(name => {
    const input = element.elements.namedItem(name) as HTMLInputElement; const value = input.value; input.value = ''; return value;
  });
}

export function CreateForm({ services, onDone }: { readonly services: AppServices; readonly onDone: (profileId: string | null) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const { inventory } = useInventory(services);
  const full = inventory !== null && (inventory.truncated || inventory.profileIds.length >= MAX_VAULT_PROFILES);
  useEffect(() => {
    const element = form.current;
    element?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { request.current?.abort(); element?.reset(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const consent = element.elements.namedItem('consent') as HTMLInputElement;
    let [secret = '', repeat = ''] = takeSecrets(element, ['passphrase', 'confirm']);
    if (secret !== repeat) { secret = ''; repeat = ''; setNotice({ error: true, text: m.passphraseMismatch }); return; }
    repeat = '';
    if (!consent.checked) { secret = ''; setNotice({ error: true, text: m.createConsentRequired }); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setNotice(null);
    try {
      const result = await services.create(secret, controller.signal);
      secret = '';
      // The unlocked notification can unmount this form before the result arrives. A success is a durable
      // profile whose public ID must still be reported; a real cancellation yields CANCELLED, never ok.
      if (result.ok) { request.current = null; onDone(result.value.profileId); }
      else if (!controller.signal.aborted) setNotice({ error: true, text: errorMessage(result.error.code) });
    } catch {
      if (!controller.signal.aborted) setNotice({ error: true, text: errorMessage('PROTOCOL_ERROR') });
    } finally {
      secret = '';
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }

  return <form ref={form} onSubmit={submit} autoComplete="off" noValidate aria-label={m.create} aria-busy={busy}>
    <p>{m.createHelp}</p>
    {full ? <p className="notice error" role="alert">{m.capacityReached(MAX_VAULT_PROFILES)}</p> : null}
    <label htmlFor="create-passphrase">{m.newPassphrase}</label>
    <input id="create-passphrase" name="passphrase" type="password" required minLength={12} maxLength={1024} autoComplete="new-password" aria-describedby="create-passphrase-help" readOnly={busy} />
    <p id="create-passphrase-help" className="helper">{m.newPassphraseHelp}</p>
    <label htmlFor="create-confirm">{m.confirmPassphrase}</label>
    <input id="create-confirm" name="confirm" type="password" required minLength={12} maxLength={1024} autoComplete="new-password" readOnly={busy} />
    <label className="checkbox-label" htmlFor="create-consent">
      <input id="create-consent" name="consent" type="checkbox" required disabled={busy} />
      <span>{m.createConsent}</span>
    </label>
    <div className="actions">
      <button className="primary" type="submit" disabled={busy || full}>{m.submitCreate}</button>
      <button type="button" onClick={() => { request.current?.abort(); form.current?.reset(); onDone(null); }}>{m.cancel}</button>
    </div>
    {busy ? <p role="status">{m.creating}</p> : null}
    <NoticeText notice={notice} />
  </form>;
}

/** Outcomes after which the destination add may already have committed (G03: reconcile before retry). */
const UNCERTAIN_RESTORE = new Set(['CANCELLED', 'TIMEOUT', 'STORAGE_UNAVAILABLE', 'LOCKED', 'PROTOCOL_ERROR']);

export function RestoreForm({ services }: { readonly services: AppServices }) {
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [reconciled, setReconciled] = useState<readonly string[] | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /** Fresh inventory only; never attributes a listed profile to the uncertain job. */
  async function reconcile() {
    if (checking) return;
    setChecking(true);
    try {
      const result = await services.listProfiles();
      if (!mounted.current) return;
      if (result.ok) { setReconciled(result.value.profileIds); setUncertain(false); setNotice(null); }
      else setNotice({ error: true, text: errorMessage(result.error.code) });
    } catch { if (mounted.current) setNotice({ error: true, text: errorMessage('PROTOCOL_ERROR') }); }
    finally { if (mounted.current) setChecking(false); }
  }
  useEffect(() => { const element = form.current; return () => { request.current?.abort(); element?.reset(); }; }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const fileInput = element.elements.namedItem('file') as HTMLInputElement;
    const consent = element.elements.namedItem('consent') as HTMLInputElement;
    let [source = '', secret = '', repeat = ''] = takeSecrets(element, ['source', 'passphrase', 'confirm']);
    const clear = () => { source = ''; secret = ''; repeat = ''; };
    const file = fileInput.files?.[0];
    if (!file) { clear(); setNotice({ error: true, text: m.restoreFileRequired }); return; }
    // Size is checked before reading so an oversized file is never loaded into memory.
    if (file.size > MAX_BACKUP_BYTES) { clear(); setNotice({ error: true, text: errorMessage('LIMIT_EXCEEDED') }); return; }
    if (secret !== repeat) { clear(); setNotice({ error: true, text: m.passphraseMismatch }); return; }
    if (!consent.checked) { clear(); setNotice({ error: true, text: m.restoreConsentRequired }); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setNotice(null); setReconciled(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (controller.signal.aborted) return;
      const result = await services.restore(bytes, source, secret, controller.signal);
      clear(); bytes.fill(0);
      if (!controller.signal.aborted) {
        if (result.ok) { element.reset(); setNotice({ error: false, text: m.restored(result.value.newProfileId, result.value.records) }); }
        else if (UNCERTAIN_RESTORE.has(result.error.code)) { setUncertain(true); setNotice(null); }
        else setNotice({ error: true, text: errorMessage(result.error.code) });
      }
    } catch {
      if (!controller.signal.aborted) setUncertain(true);
    } finally {
      clear();
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }

  return <form ref={form} onSubmit={submit} autoComplete="off" noValidate aria-label={m.restoreTitle} aria-busy={busy}>
    <label htmlFor="restore-file">{m.restoreFile}</label>
    <input id="restore-file" name="file" type="file" accept=".json,application/json" required disabled={busy} aria-describedby="restore-file-help" />
    <p id="restore-file-help" className="helper">{m.restoreFileHelp}</p>
    <label htmlFor="restore-source">{m.sourcePassphrase}</label>
    <input id="restore-source" name="source" type="password" required maxLength={1024} autoComplete="off" readOnly={busy} />
    <label htmlFor="restore-passphrase">{m.newPassphrase}</label>
    <input id="restore-passphrase" name="passphrase" type="password" required minLength={12} maxLength={1024} autoComplete="new-password" aria-describedby="restore-passphrase-help" readOnly={busy} />
    <p id="restore-passphrase-help" className="helper">{m.restorePassphraseHelp}</p>
    <label htmlFor="restore-confirm">{m.confirmPassphrase}</label>
    <input id="restore-confirm" name="confirm" type="password" required minLength={12} maxLength={1024} autoComplete="new-password" readOnly={busy} />
    <label className="checkbox-label" htmlFor="restore-consent">
      <input id="restore-consent" name="consent" type="checkbox" required disabled={busy} />
      <span>{m.restoreConsent}</span>
    </label>
    <div className="actions">
      <button className="primary" type="submit" disabled={busy || uncertain}>{m.submitRestore}</button>
      {busy ? <button type="button" onClick={() => { request.current?.abort(); setBusy(false); setUncertain(true); setNotice(null); }}>{m.cancel}</button> : null}
    </div>
    {busy ? <p role="status">{m.restoring}</p> : null}
    {uncertain ? <div className="notice error" role="alert"><p>{m.restoreUncertain}</p>
      <button type="button" onClick={() => void reconcile()} disabled={checking}>{m.reconcile}</button></div> : null}
    {reconciled ? <div role="status"><p>{m.reconciledTitle(reconciled.length)}</p>
      <ul className="profile-list">{reconciled.map(id => <li key={id}><code>{id}</code></li>)}</ul></div> : null}
    <NoticeText notice={notice} />
  </form>;
}
