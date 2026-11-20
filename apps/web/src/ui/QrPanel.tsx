import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppServices } from '../app-services.ts';
import type { TradeReviewController } from '../trade/review-controller.ts';
import { GENERATION_TARGET_BYTES, MAX_QR_TEXT_LENGTH, type QrImportReview, type RecoveryFingerprintFormat } from '../../../../packages/qr/index.ts';
import { createQrReviewController } from '../qr/review-controller.ts';
import { createCameraCapture } from '../qr/capture-controller.ts';
import { captureQrFrame, createBrowserQrDecoder } from '../qr/browser-image.ts';
import { trustedQrContext } from '../qr/trusted-context.ts';
import { QrSymbol } from '../qr/display.tsx';
import { copyPublicQrText, downloadPublicQrText } from '../qr/public-export.ts';
import { fixedFailure, type QrAppResult } from '../qr/protocol.ts';
import { qrMessages as q } from './qr-messages.ts';

export function QrReviewDetails({ review }: { readonly review: QrImportReview }) {
  const field = (key: keyof typeof q.fields, value: string) => <div key={key}><dt>{q.fields[key]}</dt><dd><bdi dir="ltr">{value}</bdi></dd></div>;
  return <>
    <p className="warning">{q.unauthenticated}</p>
    <dl className="qr-fields">
      {field('type', q.types[review.type])}{field('authentication', q.unauthenticated)}
      {field('signature', review.signature === 'absent' ? q.signatureAbsent : q.signatureUnverified)}
      {review.signatureProfile ? field('signature-profile', review.signatureProfile) : null}
      {field('request-id', review.requestId)}{field('created-at', String(review.createdAt))}
      {field('expires-at', review.expiresAt === null ? q.noExpiry : String(review.expiresAt))}
      {review.display.filter(item => item.field !== 'expires-at').map(item => field(item.field as keyof typeof q.fields, item.value))}
      {field('payload-sha256', review.payloadSha256)}
      {review.originHint === null ? null : <div><dt>{q.origin}</dt><dd><bdi dir="ltr">{review.originHint}</bdi></dd></div>}
    </dl>
    <ul>{review.warnings.map(warning => <li key={warning}>{q.warnings[warning]}</li>)}</ul>
    {review.type === 'trade-invite' ? <p className="warning">{q.inviteOpen}</p> : null}
  </>;
}

export function QrPanel({ services, trade, scope }: { readonly services: AppServices | null; readonly trade: TradeReviewController | null; readonly scope: number }) {
  const video = useRef<HTMLVideoElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null);
  const context = useRef(() => trustedQrContext(services, trade)); context.current = () => trustedQrContext(services, trade);
  const generation = useRef(0);
  const createBundle = () => {
    const decoder = createBrowserQrDecoder();
    const controller = createQrReviewController({ context: () => context.current(), decodeImage: decoder.decodeImage, decodePixels: decoder.decodePixels });
    let retired = false, previewEpoch = 0;
    const camera = createCameraCapture<MediaStream>({
      async request() {
        if (typeof navigator.mediaDevices?.getUserMedia !== 'function') throw Error('Camera unavailable.');
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' },
          width: { ideal: 1280, max: 1600 }, height: { ideal: 960, max: 1200 } } });
      },
      attach(stream) {
        const target = video.current, current = ++previewEpoch;
        if (!target) throw Error('Preview unavailable.');
        target.srcObject = stream;
        void target.play().catch(() => { if (!retired && current === previewEpoch) camera.cancel(); });
      },
      detach() { previewEpoch++; if (video.current) { video.current.pause(); video.current.srcObject = null; } },
    });
    return { controller, camera, decoder, get retired() { return retired; }, dispose() {
      if (retired) return; retired = true; camera.dispose(); controller.dispose(); decoder.dispose();
    } };
  };
  const [bundle, setBundle] = useState(createBundle);
  const snapshot = useSyncExternalStore(bundle.controller.subscribe, bundle.controller.getSnapshot, bundle.controller.getSnapshot);
  const camera = useSyncExternalStore(bundle.camera.subscribe, bundle.camera.getSnapshot, bundle.camera.getSnapshot);
  const [text, setText] = useState(''), [notice, setNotice] = useState(''), [showSymbol, setShowSymbol] = useState(false);
  const [fileEpoch, setFileEpoch] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null), [publicFile, setPublicFile] = useState<File | null>(null);
  const [fingerprintFile, setFingerprintFile] = useState<File | null>(null), [compareFile, setCompareFile] = useState<File | null>(null);
  const [format, setFormat] = useState<RecoveryFingerprintFormat>('p2p-offramp-backup/v1');
  const clearInputs = () => { setText(''); setImageFile(null); setPublicFile(null); setFingerprintFile(null); setCompareFile(null); setFileEpoch(value => value + 1); };
  const discard = () => {
    generation.current++; bundle.camera.cancel(); bundle.controller.cancel(); bundle.decoder.cancel();
    clearInputs(); setShowSymbol(false); setNotice('');
  };
  useLayoutEffect(() => {
    if (bundle.retired) { setBundle(createBundle()); return; }
    const hidden = () => { if (document.visibilityState !== 'visible') discard(); };
    const hide = () => discard();
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', hide);
    return () => {
      generation.current++; bundle.dispose();
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', hide);
    };
  }, [bundle]);
  useLayoutEffect(() => { discard(); }, [bundle, services, scope]);
  useLayoutEffect(() => {
    if (snapshot.phase === 'review') reviewHeading.current?.focus();
    const expiry = snapshot.review?.expiresAt;
    if (expiry === null || expiry === undefined) return;
    const timer = setInterval(() => {
      if (Math.floor(Date.now() / 1000) + 60 >= expiry) { discard(); setNotice(q.errors.EXPIRED); }
    }, 1000);
    return () => clearInterval(timer);
  }, [bundle, snapshot.review?.requestId, snapshot.phase]);
  async function run(action: () => Promise<QrAppResult>) {
    const current = ++generation.current;
    bundle.camera.cancel(); clearInputs(); setShowSymbol(false); setNotice('');
    try {
      const result = await action();
      if (current === generation.current && !bundle.retired && !result.ok) setNotice(q.errors[result.code]);
    } catch (error) { if (current === generation.current && !bundle.retired) setNotice(q.errors[fixedFailure(error).code]); }
  }
  async function cameraStart() {
    discard(); const current = generation.current;
    const result = await bundle.camera.start();
    if (current === generation.current && !bundle.retired && !result.ok) setNotice(q.errors[result.code]);
  }
  function capture() {
    try {
      if (!video.current) return;
      const pixels = captureQrFrame(video.current);
      void run(() => bundle.controller.reviewPixels(pixels));
    } catch (error) { bundle.camera.cancel(); setNotice(q.errors[fixedFailure(error).code]); }
  }
  async function copy() {
    const ready = bundle.controller.confirmedText();
    if (!ready.ok) { setNotice(q.errors[ready.code]); return; }
    const current = generation.current, result = await copyPublicQrText(ready.value);
    if (current === generation.current && !bundle.retired) setNotice(result.ok ? q.copied : q.copyUnavailable);
  }
  function download() {
    const ready = bundle.controller.confirmedText();
    if (!ready.ok) { setNotice(q.errors[ready.code]); return; }
    try { downloadPublicQrText(ready.value); } catch (error) { setNotice(q.errors[fixedFailure(error).code]); }
  }
  return <section className="panel qr-panel" aria-labelledby="qr-title" data-qr-phase={snapshot.phase} data-qr-confirmed={snapshot.confirmed ? 'true' : 'false'}>
    <h2 id="qr-title">{q.title}</h2><p>{q.intro}</p><p>{q.physical}</p><p>{q.chainScope}</p>
    <h3>{q.captureTitle}</h3><p>{q.cameraHelp}</p>
    <video ref={video} className="qr-camera" muted playsInline aria-label={q.cameraPreview} hidden={camera.state !== 'live'} />
    <div className="actions">
      <button type="button" disabled={snapshot.busy || camera.state === 'requesting' || camera.state === 'live'} onClick={() => void cameraStart()}>{q.cameraStart}</button>
      <button type="button" disabled={snapshot.busy || camera.state !== 'live'} onClick={capture}>{q.cameraCapture}</button>
      <button type="button" disabled={camera.state === 'idle'} onClick={() => bundle.camera.cancel()}>{q.cameraStop}</button>
    </div>
    {camera.state === 'requesting' ? <p role="status">{q.cameraPending}</p> : null}
    <div className="qr-input-grid" key={fileEpoch}>
      <div><label htmlFor="qr-image-file">{q.imageFile}</label><input id="qr-image-file" type="file" accept="image/png,image/jpeg" disabled={snapshot.busy} onChange={event => setImageFile(event.currentTarget.files?.[0] ?? null)} />
        <p>{q.imageLimits}</p><button type="button" disabled={snapshot.busy || !imageFile} onClick={() => { const selected = imageFile; if (selected) void run(() => bundle.controller.reviewImage(selected)); }}>{q.imageRead}</button></div>
      <div><label htmlFor="qr-public-file">{q.publicFile}</label><input id="qr-public-file" type="file" accept="text/plain,.txt" disabled={snapshot.busy} onChange={event => setPublicFile(event.currentTarget.files?.[0] ?? null)} />
        <p>{q.fileLimits}</p><button type="button" disabled={snapshot.busy || !publicFile} onClick={() => { const selected = publicFile; if (selected) void run(() => bundle.controller.readEnvelopeFile(selected)); }}>{q.publicFileRead}</button></div>
    </div>
    <form onSubmit={event => { event.preventDefault(); const entered = text; void run(() => bundle.controller.reviewText(entered)); }}>
      <label htmlFor="qr-public-text">{q.text}</label><textarea id="qr-public-text" value={text} maxLength={MAX_QR_TEXT_LENGTH + 1} spellCheck={false} autoComplete="off" disabled={snapshot.busy} onChange={event => setText(event.currentTarget.value)} />
      <p>{q.textHelp}</p><button type="submit" disabled={snapshot.busy || text.length === 0}>{q.textRead}</button>
    </form>
    <h3>{q.fingerprintTitle}</h3><p>{q.fingerprintHelp}</p>
    <label htmlFor="qr-fingerprint-format">{q.fingerprintFormat}</label><select id="qr-fingerprint-format" value={format} disabled={snapshot.busy} onChange={event => setFormat(event.currentTarget.value as RecoveryFingerprintFormat)}>
      <option value="p2p-offramp-backup/v1">{q.formatBackup}</option><option value="p2p-offramp/offline-recovery-references/v1">{q.formatReferences}</option>
    </select>
    <label htmlFor="qr-fingerprint-file">{q.fingerprintFile}</label><input id="qr-fingerprint-file" key={`fingerprint-${fileEpoch}`} type="file" disabled={snapshot.busy} onChange={event => setFingerprintFile(event.currentTarget.files?.[0] ?? null)} />
    <button type="button" disabled={snapshot.busy || !fingerprintFile} onClick={() => { const selected = fingerprintFile, selectedFormat = format; if (selected) void run(() => bundle.controller.createFingerprint(selected, selectedFormat)); }}>{q.fingerprintCreate}</button>
    <div className="actions"><button type="button" onClick={discard}>{q.cancel}</button></div>
    {snapshot.busy ? <p role="status">{q.busy}</p> : null}
    {notice || snapshot.error || camera.error ? <p className="notice" role="alert">{notice || q.errors[snapshot.error ?? camera.error ?? 'UNAVAILABLE']}</p> : null}
    {snapshot.review ? <section className="qr-review" aria-labelledby="qr-review-title">
      <h3 id="qr-review-title" ref={reviewHeading} tabIndex={-1}>{q.reviewTitle}</h3><QrReviewDetails review={snapshot.review} />
      {!snapshot.confirmed ? <button type="button" disabled={snapshot.busy} onClick={() => void run(() => bundle.controller.confirm())}>{q.confirm}</button> : <>
        <p role="status">{q.confirmed}</p>
        <div className="actions"><button type="button" disabled={snapshot.busy} onClick={() => { const result = bundle.controller.confirmedText(); if (result.ok) setShowSymbol(true); else setNotice(q.errors[result.code]); }}>{q.display}</button>
          <button type="button" disabled={snapshot.busy} onClick={() => void copy()}>{q.copy}</button><button type="button" disabled={snapshot.busy} onClick={download}>{q.download}</button></div>
        {showSymbol && snapshot.matrix ? <><QrSymbol matrix={snapshot.matrix} label={q.symbolLabel} />
          {snapshot.review.envelopeBytes > GENERATION_TARGET_BYTES ? <p>{q.generationTarget}</p> : null}</> : null}
        {snapshot.review.type === 'recovery-fingerprint' ? <div className="qr-compare"><h4>{q.compareTitle}</h4><p>{q.compareHelp}</p>
          <label htmlFor="qr-compare-file">{q.compareFile}</label><input id="qr-compare-file" key={`compare-${fileEpoch}`} type="file" disabled={snapshot.busy} onChange={event => setCompareFile(event.currentTarget.files?.[0] ?? null)} />
          <button type="button" disabled={snapshot.busy || !compareFile} onClick={() => { const selected = compareFile; if (selected) void run(() => bundle.controller.compareFingerprint(selected)); }}>{q.compare}</button>
          {snapshot.comparison ? <p role="status" data-qr-comparison={snapshot.comparison}>{snapshot.comparison === 'match' ? q.match : q.different}</p> : null}
        </div> : null}
      </>}
    </section> : null}
  </section>;
}
