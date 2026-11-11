import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { MAX_DRAFT_INSTRUCTIONS_BYTES, parseTradeDraftInput, type TradeDraftDefaultsV1 } from '../../../../../packages/schemas/index.ts';
import type { TradeDraftChangePreview } from '../../../../../packages/personalization/index.ts';
import type { TradeDraftController, TradeDraftField } from '../../trade/draft-controller.ts';
import { formatUnits, formatFiatMinor, describeDeadline } from './trade-terms-display.ts';
import { tradeMessages as t } from './trade-messages.ts';

export interface TradeDraftCopy {
  readonly title: string; readonly help: string; readonly locked: string; readonly unavailable: string;
  readonly templatesTitle: string; readonly templatesEmpty: string; readonly loadTemplates: string; readonly newBlank: string;
  readonly useTemplate: string; readonly useRepeatDefault: string; readonly saveTemplate: string; readonly removeTemplate: string;
  readonly setRepeatDefault: string; readonly clearRepeatDefault: string; readonly slotLabel: string; readonly review: string; readonly cancel: string;
  readonly previewTitle: string; readonly reviewChange: string; readonly confirmChange: string; readonly backupLimits: string;
  readonly savedAmountsNeedReview: string; readonly confirmAmounts: string; readonly confirmIdentities: string; readonly confirmEmptyInstructions: string;
  readonly busy: string; readonly saved: string; readonly choose: string; readonly identityTitle: string; readonly invalid: string;
  readonly oldValues: string; readonly newValues: string; readonly repeatDefaultRemoved: string;
  readonly fields: Readonly<Record<TradeDraftField, string>>;
  /** Receives a zero-based local slot; the source-catalog adapter supplies the human number. */
  readonly templateName: (slot: number) => string; readonly affectedTemplates: (count: number) => string; readonly error: (code: string) => string;
}
const DEFAULT_FIELDS = ['networkId', 'deploymentId', 'assetId', 'amountBaseUnits', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale'] as const;
function Summary({ values, copy }: { readonly values: TradeDraftDefaultsV1; readonly copy: TradeDraftCopy }) {
  return <dl className="terms">{DEFAULT_FIELDS.map(field => <div key={field}><dt>{copy.fields[field]}</dt><dd><bdi dir="ltr">{String(values[field])}</bdi></dd></div>)}</dl>;
}
export function TradeDraftEditor({ controller, copy, onOpenReview }: {
  readonly controller: TradeDraftController; readonly copy: TradeDraftCopy; readonly onOpenReview: (localId: string) => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [slot, setSlot] = useState(0), [consentedPreview, setConsentedPreview] = useState<TradeDraftChangePreview | null>(null), [localError, setLocalError] = useState(false);
  const mounted = useRef(true), owner = useRef(controller);
  owner.current = controller;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const f = state.form, disabled = state.busy || !state.unlocked;
  const choice = state.choices.find(item => item.networkId === f.networkId && item.deploymentId === f.deploymentId && item.assetId === f.assetId);
  let valid = false;
  try { if (/^[0-6]$/.test(f.fiatScale)) { parseTradeDraftInput({ ...f, fiatScale: Number(f.fiatScale) }); valid = choice !== undefined; } } catch { /* Form remains incomplete. */ }
  const edit = (field: TradeDraftField, value: string) => { setLocalError(false); controller.edit(field, value); };
  const select = (field: 'networkId' | 'deploymentId' | 'assetId', values: readonly string[]) => <>
    <label htmlFor={`draft-${field}`}>{copy.fields[field]}</label>
    <select id={`draft-${field}`} name={field} value={f[field]} onChange={event => edit(field, event.currentTarget.value)}>
      <option value="">{copy.choose}</option>
      {f[field] && !values.includes(f[field]) ? <option value={f[field]} disabled>{f[field]} — {copy.unavailable}</option> : null}
      {[...new Set(values)].map(value => <option key={value} value={value}>{value}</option>)}
    </select>
  </>;
  const input = (field: Exclude<TradeDraftField, 'networkId' | 'deploymentId' | 'assetId' | 'paymentInstructions'>, maximum: number, numeric = true) => <>
    <label htmlFor={`draft-${field}`}>{copy.fields[field]}</label>
    <input id={`draft-${field}`} name={field} type="text" inputMode={numeric ? 'numeric' : 'text'} autoComplete="off" spellCheck={false}
      dir="ltr" maxLength={maximum} value={f[field]} onChange={event => edit(field, event.currentTarget.value)} />
  </>;
  async function submit(event: FormEvent) {
    event.preventDefault(); const source = controller, localId = await source.review();
    if (localId && mounted.current && owner.current === source) onOpenReview(localId);
  }
  const save = () => { try { void controller.planChange({ kind: 'put-template', slot, defaults: controller.currentDefaults() }); } catch { setLocalError(true); } };
  const preview = state.preview, previous = preview && preview.change.kind !== 'set-repeat-default' ? state.library?.library.templates.find(entry => entry.slot === preview.change.slot)?.defaults : undefined;
  const amount = choice ? formatUnits(f.amountBaseUnits, choice.decimals) : null;
  const fiat = /^[0-6]$/.test(f.fiatScale) ? formatFiatMinor(f.fiatMinorUnits, Number(f.fiatScale), f.fiatCurrency) : null;
  const deviceSeconds = String(Math.floor(Date.now() / 1000));
  const acceptance = describeDeadline(f.acceptBeforeSeconds, deviceSeconds), expiry = describeDeadline(f.escrowExpirySeconds, deviceSeconds);
  const instructionBytes = new TextEncoder().encode(f.paymentInstructions).length;
  return <section className="panel" aria-labelledby="draft-editor-title">
    <h2 id="draft-editor-title">{copy.title}</h2><p>{copy.help}</p>
    {!state.unlocked ? <p className="notice" role="status">{copy.locked}</p> : <>
      <section aria-labelledby="draft-templates-title">
        <h3 id="draft-templates-title">{copy.templatesTitle}</h3><p className="helper">{copy.backupLimits}</p>
        <div className="actions">
          <button type="button" disabled={disabled} onClick={() => void controller.loadTemplates()}>{copy.loadTemplates}</button>
          <button type="button" disabled={disabled} onClick={() => controller.startBlank()}>{copy.newBlank}</button>
          <button type="button" disabled={disabled || state.library?.library.repeatDefaultSlot === null || !state.library} onClick={() => controller.useRepeatDefault()}>{copy.useRepeatDefault}</button>
          <button type="button" disabled={disabled || state.library?.library.repeatDefaultSlot === null || !state.library} onClick={() => void controller.planChange({ kind: 'set-repeat-default', slot: null })}>{copy.clearRepeatDefault}</button>
        </div>
        {state.library && !state.library.library.templates.length ? <p>{copy.templatesEmpty}</p> : state.library ? <ul className="session-list">{state.library.library.templates.map(entry => <li key={entry.slot}>
          <strong>{copy.templateName(entry.slot)}</strong>{' '}<bdi dir="ltr">{entry.defaults.amountBaseUnits} {entry.defaults.assetId} · {entry.defaults.fiatMinorUnits} / {entry.defaults.fiatScale} {entry.defaults.fiatCurrency}</bdi>
          <div className="actions"><button type="button" disabled={disabled} onClick={() => controller.useTemplate(entry.slot)}>{copy.useTemplate}</button>
            <button type="button" disabled={disabled} onClick={() => void controller.planChange({ kind: 'set-repeat-default', slot: entry.slot })}>{copy.setRepeatDefault}</button>
            <button type="button" disabled={disabled} onClick={() => void controller.planChange({ kind: 'remove-template', slot: entry.slot })}>{copy.removeTemplate}</button></div>
        </li>)}</ul> : null}
        <label htmlFor="draft-template-slot">{copy.slotLabel}</label><select id="draft-template-slot" value={slot} disabled={disabled} onChange={event => setSlot(Number(event.currentTarget.value))}>
          {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>{copy.templateName(index)}</option>)}</select>
        <button type="button" disabled={disabled || !state.library} onClick={save}>{copy.saveTemplate}</button>
      </section>
      {preview ? <section className="plain-section" aria-labelledby="draft-change-title">
        <h3 id="draft-change-title">{copy.previewTitle}</h3><p>{copy.affectedTemplates(preview.affectedTemplateCount)}</p>
        <p>{preview.change.slot !== null ? copy.templateName(preview.change.slot) + ': ' : ''}{preview.change.kind === 'put-template' ? copy.saveTemplate : preview.change.kind === 'remove-template' ? copy.removeTemplate : preview.change.slot === null ? copy.clearRepeatDefault : copy.setRepeatDefault}</p>
        {previous ? <><h4>{copy.oldValues}</h4><Summary values={previous} copy={copy} /></> : null}
        {preview.change.kind === 'put-template' ? <><h4>{copy.newValues}</h4><Summary values={preview.change.defaults} copy={copy} /></> : null}
        {preview.clearsRepeatDefault ? <p className="warning">{copy.repeatDefaultRemoved}</p> : null}<p>{copy.backupLimits}</p>
        <label className="checkbox-label"><input type="checkbox" checked={consentedPreview === preview} disabled={disabled} onChange={event => setConsentedPreview(event.currentTarget.checked ? preview : null)} />{copy.reviewChange}</label>
        <button type="button" disabled={disabled || consentedPreview !== preview} onClick={() => void controller.commitChange(consentedPreview === preview)}>{copy.confirmChange}</button>
        <button type="button" disabled={disabled} onClick={() => controller.cancel()}>{copy.cancel}</button>
      </section> : null}
      {!state.choices.length ? <p className="notice" role="status">{copy.unavailable}</p> : null}
      <p className="warning" role="note">{copy.savedAmountsNeedReview}</p>
      <form aria-label={copy.title} aria-busy={state.busy} noValidate onSubmit={event => void submit(event)}>
        <fieldset disabled={disabled}>
          {select('networkId', state.choices.map(item => item.networkId))}
          {select('deploymentId', state.choices.filter(item => item.networkId === f.networkId).map(item => item.deploymentId))}
          {select('assetId', state.choices.filter(item => item.networkId === f.networkId && item.deploymentId === f.deploymentId).map(item => item.assetId))}
          {input('amountBaseUnits', 78)}{amount?.ok ? <p className="helper"><bdi dir="ltr">{amount.value} {choice?.assetId}</bdi></p> : null}
          {input('fiatCurrency', 3, false)}{input('fiatScale', 1)}{input('fiatMinorUnits', 39)}
          {fiat?.ok ? <p className="helper"><bdi dir="ltr">{fiat.value}</bdi></p> : null}
          {input('seller', 42, false)}{input('buyer', 42, false)}
          <label htmlFor="draft-paymentInstructions">{copy.fields.paymentInstructions}</label>
          <textarea id="draft-paymentInstructions" name="paymentInstructions" maxLength={MAX_DRAFT_INSTRUCTIONS_BYTES} autoComplete="off" spellCheck={false}
            aria-describedby="draft-instruction-bound" value={f.paymentInstructions} onChange={event => edit('paymentInstructions', event.currentTarget.value)} />
          <p className={instructionBytes > MAX_DRAFT_INSTRUCTIONS_BYTES ? 'notice error' : 'helper'} role={instructionBytes > MAX_DRAFT_INSTRUCTIONS_BYTES ? 'alert' : undefined} id="draft-instruction-bound">
            {instructionBytes > MAX_DRAFT_INSTRUCTIONS_BYTES ? copy.invalid + ' ' : ''}<bdi dir="ltr">{instructionBytes}/{MAX_DRAFT_INSTRUCTIONS_BYTES}</bdi></p>
          {!f.paymentInstructions ? <label className="checkbox-label"><input type="checkbox" checked={state.emptyInstructionsConfirmed} onChange={event => controller.confirmEmptyInstructions(event.currentTarget.checked)} />{copy.confirmEmptyInstructions}</label> : null}
          {input('acceptBeforeSeconds', 20)}{f.acceptBeforeSeconds ? <p className="helper"><bdi dir="ltr">{acceptance.ok ? acceptance.value.text : copy.invalid}</bdi></p> : null}
          {input('escrowExpirySeconds', 20)}
          {f.escrowExpirySeconds ? <p className="helper"><bdi dir="ltr">{expiry.ok ? expiry.value.text : copy.invalid}</bdi></p> : null}
          {choice ? <section className="plain-section" aria-labelledby="draft-identity-title"><h3 id="draft-identity-title">{copy.identityTitle}</h3>
            <dl className="terms"><dt>{t.chainId}</dt><dd><bdi dir="ltr">{choice.chainId}</bdi></dd><dt>{t.environment}</dt><dd>{choice.environment}</dd>
              <dt>{t.contract}</dt><dd><code className="exact"><bdi dir="ltr">{choice.escrowAddress}</bdi></code></dd>
              {choice.assetAddress ? <><dt>{t.tokenAddress}</dt><dd><code className="exact"><bdi dir="ltr">{choice.assetAddress}</bdi></code></dd></> : null}
              <dt>{t.amount}</dt><dd><bdi dir="ltr">{amount?.ok ? t.baseUnits(f.amountBaseUnits, choice.decimals) : copy.invalid}</bdi></dd></dl></section> : null}
          <label className="checkbox-label"><input type="checkbox" checked={state.amountsConfirmed} onChange={event => controller.confirmAmounts(event.currentTarget.checked)} />{copy.confirmAmounts}</label>
          <label className="checkbox-label"><input type="checkbox" checked={state.identitiesConfirmed} onChange={event => controller.confirmIdentities(event.currentTarget.checked)} />{copy.confirmIdentities}</label>
          <div className="actions"><button type="submit" disabled={disabled || !valid || !state.amountsConfirmed || !state.identitiesConfirmed || !f.paymentInstructions && !state.emptyInstructionsConfirmed}>{copy.review}</button></div>
        </fieldset>
      </form>
      {state.busy ? <p role="status">{copy.busy} <button type="button" onClick={() => controller.cancel()}>{copy.cancel}</button></p> : null}
      {state.status === 'saved' ? <p role="status">{copy.saved}</p> : null}
      {state.code ? <p className="notice error" role="alert">{copy.error(state.code)}</p> : localError ? <p className="notice error" role="alert">{copy.invalid}</p> : null}
    </>}
  </section>;
}
