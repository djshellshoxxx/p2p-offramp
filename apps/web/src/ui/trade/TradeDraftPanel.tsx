import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_DRAFT_INSTRUCTIONS_BYTES, parseTradeDraftInput, type TradeDraftChangeV1, type TradeDraftDefaultsV1 } from '../../../../../packages/schemas/index.ts';
import { DEFAULT_FIELD_NAMES, DRAFT_FIELD_NAMES, type TradeDraftController, type TradeDraftSnapshot } from '../../trade/draft-controller.ts';
import { message, messageGroup } from '../locale/runtime.ts';
import { describeDeadline, formatFiatMinor, formatUnits } from './trade-terms-display.ts';
import { tradeMessages as tradeText } from './trade-messages.ts';
const text = messageGroup('drafts'), labels = messageGroup('draftFields');
const name = (slot: number) => message('drafts', 'templateName', { slot: slot + 1 });
const FIELD_MAX_LENGTH = {
  networkId: 64, deploymentId: 64, assetId: 64, amountBaseUnits: 78, fiatCurrency: 3,
  fiatMinorUnits: 39, fiatScale: 1, seller: 42, buyer: 42, paymentInstructions: MAX_DRAFT_INSTRUCTIONS_BYTES,
  acceptBeforeSeconds: 20, escrowExpirySeconds: 20,
} as const satisfies Record<(typeof DRAFT_FIELD_NAMES)[number], number>;
const numericField = (field: (typeof DRAFT_FIELD_NAMES)[number]) =>
  field === 'amountBaseUnits' || field === 'fiatMinorUnits' || field === 'fiatScale' ||
  field === 'acceptBeforeSeconds' || field === 'escrowExpirySeconds';
function canonicalInputValid(fields: TradeDraftSnapshot['fields']): boolean {
  // Reuse the canonical parser; this display preflight is not controller or chain authority.
  if (!/^[0-6]$/.test(fields.fiatScale)) return false;
  try { parseTradeDraftInput({ ...fields, fiatScale: Number(fields.fiatScale) }); return true; }
  catch { return false; }
}
function instructionByteCount(value: string): number {
  const bytes = new TextEncoder().encode(value);
  try { return bytes.length; } finally { bytes.fill(0); }
}

function Defaults({ defaults }: { readonly defaults: TradeDraftDefaultsV1 }) {
  return <dl className="template-defaults">{DEFAULT_FIELD_NAMES.map(field => <div key={field}><dt>{labels[field]}</dt><dd>{defaults[field]}</dd></div>)}</dl>;
}
function ChangePreview({ drafts, snapshot }: { readonly drafts: TradeDraftController; readonly snapshot: TradeDraftSnapshot }) {
  const [consent, setConsent] = useState(false);
  const preview = snapshot.preview;
  if (!preview) return null;
  const change = preview.change, prior = snapshot.library?.library;
  const before = change.slot === null ? undefined : prior?.templates.find(item => item.slot === change.slot);
  return <section className="notice" aria-label={text.previewTitle}>
    <h3>{text.previewTitle}</h3>
    <p>{change.kind === 'put-template' ? text.previewPut : change.kind === 'remove-template' ? text.removeTemplate : text.previewDefault}</p>
    <p>{change.slot === null ? text.clearRepeatDefault : name(change.slot)}</p>
    {change.kind === 'set-repeat-default' ? <p>{text.oldValues}: {prior?.repeatDefaultSlot === null || prior?.repeatDefaultSlot === undefined ? text.none : name(prior.repeatDefaultSlot)}<br />
      {text.newValues}: {change.slot === null ? text.none : name(change.slot)}</p> : <>
      <h4>{text.oldValues}</h4>{before ? <Defaults defaults={before.defaults} /> : <p>{text.none}</p>}
      <h4>{text.newValues}</h4>{change.kind === 'put-template' ? <Defaults defaults={change.defaults} /> : <p>{text.none}</p>}
    </>}
    {change.kind === 'set-repeat-default' && before ? <Defaults defaults={before.defaults} /> : null}
    <p>{message('drafts', 'affectedTemplates', { count: preview.affectedTemplateCount })}</p>
    {preview.clearsRepeatDefault ? <p>{text.repeatDefaultRemoved}</p> : null}
    <p>{text.backupLimits}</p><p>{text.previewExpires}</p>
    <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.currentTarget.checked)} />{text.reviewChange}</label>
    <div className="actions"><button type="button" disabled={!consent || snapshot.busy !== null} onClick={() => { void drafts.commit(consent); }}>{text.confirmChange}</button>
      <button type="button" onClick={() => { void drafts.cancel(); }}>{text.cancel}</button></div>
  </section>;
}
function FreshDraftForm({ drafts, snapshot }: { readonly drafts: TradeDraftController; readonly snapshot: TradeDraftSnapshot }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [consent, setConsent] = useState({ generation: snapshot.generation, amounts: false, identities: false, empty: false });
  const amounts = consent.generation === snapshot.generation && consent.amounts, identities = consent.generation === snapshot.generation && consent.identities, empty = consent.generation === snapshot.generation && consent.empty;
  const check = (field: 'amounts' | 'identities' | 'empty', value: boolean) => setConsent({ generation: snapshot.generation, amounts, identities, empty, [field]: value });
  const [slot, setSlot] = useState(0), identity = drafts.currentIdentity();
  const disabled = snapshot.busy !== null || snapshot.preview !== null;
  const fields = snapshot.fields;
  const valid = canonicalInputValid(fields);
  const reviewReady = !disabled && !!identity && valid && amounts && identities && (fields.paymentInstructions !== '' || empty);
  const hasDeadlines = fields.acceptBeforeSeconds !== '' || fields.escrowExpirySeconds !== '';
  // A single display clock while deadline values are visible; no chain clock or authority.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!hasDeadlines) return;
    const timer = setInterval(() => setClockTick(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [hasDeadlines]);
  const now = String(Math.floor(Date.now() / 1000));
  const crypto = identity ? formatUnits(fields.amountBaseUnits, identity.assetDecimals) : null;
  const fiat = /^[0-6]$/.test(fields.fiatScale) ? formatFiatMinor(fields.fiatMinorUnits, Number(fields.fiatScale), fields.fiatCurrency) : null;
  const acceptance = describeDeadline(fields.acceptBeforeSeconds, now);
  const expiry = describeDeadline(fields.escrowExpirySeconds, now);
  const bytes = instructionByteCount(fields.paymentInstructions);
  const previews: Partial<Record<(typeof DRAFT_FIELD_NAMES)[number], string | undefined>> = {
    amountBaseUnits: crypto?.ok && identity ? `${crypto.value} ${identity.defaults.assetId}` : undefined,
    fiatMinorUnits: fiat?.ok ? fiat.value : undefined,
    acceptBeforeSeconds: fields.acceptBeforeSeconds ? (acceptance.ok ? acceptance.value.text : text.invalid) : undefined,
    escrowExpirySeconds: fields.escrowExpirySeconds ? (expiry.ok ? expiry.value.text : text.invalid) : undefined,
    paymentInstructions: `${bytes}/${MAX_DRAFT_INSTRUCTIONS_BYTES}`,
  };
  const fieldInputs = DRAFT_FIELD_NAMES.map(field => {
    const id = `draft-${field}`, preview = previews[field], description = preview === undefined ? undefined : `${id}-preview`;
    const overLimit = field === 'paymentInstructions' && bytes > MAX_DRAFT_INSTRUCTIONS_BYTES;
    return <div key={field}>
      <label htmlFor={id}>{labels[field]}
        {field === 'paymentInstructions' ? <textarea id={id} name={field} value={fields[field]} autoComplete="off" spellCheck={false} disabled={disabled}
          maxLength={FIELD_MAX_LENGTH[field]} aria-describedby={description} aria-invalid={overLimit || undefined}
          onChange={event => drafts.edit(field, event.currentTarget.value)} /> :
          <input id={id} name={field} type="text" value={fields[field]} autoComplete="off" spellCheck={false} disabled={disabled}
            inputMode={numericField(field) ? 'numeric' : 'text'} maxLength={FIELD_MAX_LENGTH[field]} dir="ltr" aria-describedby={description}
            onChange={event => drafts.edit(field, event.currentTarget.value)} />}
      </label>
      {preview !== undefined ? <p id={description} className={overLimit ? 'notice error' : 'helper'} role={overLimit ? 'alert' : undefined}>
        {overLimit ? text.invalid + ' ' : null}<bdi dir="ltr">{preview}</bdi></p> : null}
    </div>;
  });
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewReady) return;
    const route = window.location.hash;
    const id = await drafts.review({ amounts, identities, emptyInstructions: empty });
    const current = drafts.getSnapshot();
    // A late review cannot replace a route chosen after leaving the form or retiring its private draft.
    if (mounted.current && id && current.unlocked && current.generation === snapshot.generation && window.location.hash === route) window.location.hash = `#/trade/${id}`;
  }
  return <form aria-label={text.title} onSubmit={event => { void review(event); }}>
    <p>{text.savedAmountsNeedReview}</p>
    <div className="draft-fields">{fieldInputs}</div>
    {hasDeadlines ? <p className="helper">{tradeText.clockNote}</p> : null}
    <section aria-label={text.identityTitle}><h3>{text.identityTitle}</h3>
      {identity ? <dl><dt>{text.chainId}</dt><dd>{identity.chainId}</dd><dt>{labels.deploymentId}</dt><dd>{identity.deploymentAddress}</dd>
        <dt>{labels.assetId}</dt><dd>{identity.assetAddress ?? text.nativeAsset}</dd><dt>{text.assetDecimals}</dt><dd>{identity.assetDecimals}</dd></dl> : <p>{text.unavailable}</p>}
    </section>
    <label className="checkbox-label"><input type="checkbox" checked={amounts} disabled={disabled} onChange={event => check('amounts', event.currentTarget.checked)} />{text.confirmAmounts}</label>
    <label className="checkbox-label"><input type="checkbox" checked={identities} disabled={disabled} onChange={event => check('identities', event.currentTarget.checked)} />{text.confirmIdentities}</label>
    {snapshot.fields.paymentInstructions === '' ? <label className="checkbox-label"><input type="checkbox" checked={empty} disabled={disabled} onChange={event => check('empty', event.currentTarget.checked)} />{text.confirmEmptyInstructions}</label> : null}
    {amounts && identities && !valid ? <p role="alert" className="notice error">{text.invalid}</p> : null}
    <div className="actions"><button className="primary" type="submit" disabled={!reviewReady}>{text.review}</button></div>
    <fieldset disabled={disabled || snapshot.library === null}><legend>{text.saveTemplate}</legend>
      <label htmlFor="template-slot">{text.slotLabel}</label><select id="template-slot" value={slot} onChange={event => setSlot(Number(event.currentTarget.value))}>
        {Array.from({ length: 8 }, (_, index) => <option value={index} key={index}>{name(index)}</option>)}
      </select>{' '}<button type="button" onClick={() => { void drafts.previewPut(slot); }}>{text.saveTemplate}</button>
    </fieldset>
  </form>;
}
export function TradeDraftPanel({ drafts }: { readonly drafts: TradeDraftController }) {
  const snapshot = useSyncExternalStore(drafts.subscribe, drafts.getSnapshot, drafts.getSnapshot);
  const disabled = snapshot.busy !== null || snapshot.preview !== null;
  const library = snapshot.library?.library;
  const plan = (change: TradeDraftChangeV1) => { void drafts.preview(change); };
  return <section className="panel trade-draft-panel" aria-labelledby="draft-title">
    <h2 id="draft-title">{text.title}</h2><p>{text.help}</p>
    {snapshot.status === 'failed' ? <p role="alert">{text.operationFailed}</p> : null}
    {!snapshot.unlocked ? <p>{text.locked}</p> : <>
      <section aria-label={text.templatesTitle}><h3>{text.templatesTitle}</h3><p>{text.backupLimits}</p>
        <div className="actions"><button type="button" disabled={disabled} onClick={() => { void drafts.load(); }}>{text.loadTemplates}</button>
          <button type="button" disabled={disabled} onClick={() => drafts.startBlank()}>{text.newBlank}</button>
          {library?.repeatDefaultSlot !== null && library?.repeatDefaultSlot !== undefined ? <>
            <button type="button" disabled={disabled} onClick={() => drafts.applyRepeatDefault()}>{text.useRepeatDefault}</button>
            <button type="button" disabled={disabled} onClick={() => plan({ kind: 'set-repeat-default', slot: null })}>{text.clearRepeatDefault}</button>
          </> : null}
        </div>
        {library ? library.templates.length === 0 ? <p role="status">{text.templatesEmpty}</p> :
          <ul className="templates-list">{library.templates.map(template => <li key={template.slot} data-template-slot={template.slot}>
            <h4>{name(template.slot)}{library.repeatDefaultSlot === template.slot ? ` · ${text.repeatSelected}` : ''}</h4>
            <Defaults defaults={template.defaults} />
            <div className="actions"><button type="button" disabled={disabled} onClick={() => drafts.apply(template.slot)}>{text.useTemplate}</button>
              <button type="button" disabled={disabled} onClick={() => plan({ kind: 'remove-template', slot: template.slot })}>{text.removeTemplate}</button>
              <button type="button" disabled={disabled || library.repeatDefaultSlot === template.slot} onClick={() => plan({ kind: 'set-repeat-default', slot: template.slot })}>{text.setRepeatDefault}</button>
            </div>
          </li>)}</ul> : null}
      </section>
      {snapshot.preview ? <ChangePreview key={snapshot.preview.previewId} drafts={drafts} snapshot={snapshot} /> : null}
      {snapshot.busy ? <p role="status">{text.busy}{' '}<button type="button" onClick={() => { void drafts.cancel(); }}>{text.cancel}</button></p> : null}
      {snapshot.status === 'saved' ? <p role="status">{text.saved}</p> : null}
      <FreshDraftForm drafts={drafts} snapshot={snapshot} />
    </>}
  </section>;
}
