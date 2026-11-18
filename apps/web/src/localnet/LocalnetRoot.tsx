/** Explicit localnet journey; the build policy excludes this subtree from ordinary artifacts. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_BACKUP_BYTES } from '../../../../packages/schemas/index.ts';
import type { Eip1193Provider } from '../../../../packages/wallet/localnet.ts';
import { createLocalnetClient } from './client.ts';
import { LOCALNET_BANNER, loadInjectedLocalnetConfig, type LocalnetConfig } from './config.ts';
import type { LocalnetClient, LocalnetResult, LocalnetSnapshot, LocalnetTradeView } from './protocol.ts';
import { runLocalnetUiCommand, type LocalnetUiCommand } from './ui-command.ts';
import './localnet.css';

type Send = (command: LocalnetUiCommand) => Promise<LocalnetResult | undefined>;
const labels = { offer: 'Offer these terms', accept: 'Accept these terms', fund: 'Fund escrow', release: 'Release to buyer', refund: 'Refund to seller' };
const safeCode = (code: string) => /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'OPERATION_REFUSED';

function ProfileForms({ snapshot, busy, send }: { snapshot: LocalnetSnapshot; busy: boolean; send: Send }) {
  const [createPass, setCreatePass] = useState(''), [unlockPass, setUnlockPass] = useState('');
  const [profile, setProfile] = useState(snapshot.profileIds[0] ?? '');
  const create = (event: FormEvent) => { event.preventDefault(); const passphrase = createPass; setCreatePass(''); void send({ type: 'profile.create', passphrase }); };
  const unlock = (event: FormEvent) => { event.preventDefault(); const passphrase = unlockPass; setUnlockPass(''); void send({ type: 'profile.unlock', profileId: profile, passphrase }); };
  return <section className="panel" aria-labelledby="profile-title">
    <h2 id="profile-title">Your encrypted profile</h2>
    <p>Your profile keeps private terms, messages, and recovery records in this browser. Your external wallet holds the keys that control funds.</p>
    <div className="localnet-columns">
      <form onSubmit={create}>
        <h3>Create a profile</h3>
        <label htmlFor="localnet-create-pass">New profile passphrase</label>
        <input id="localnet-create-pass" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={createPass} onChange={event => setCreatePass(event.target.value)} />
        <p className="helper">Use at least 12 characters. Keep the passphrase with your encrypted backup.</p>
        <button className="primary" disabled={busy} type="submit">Create profile</button>
      </form>
      {snapshot.profileIds.length > 0 && <form onSubmit={unlock}>
        <h3>Open an existing profile</h3>
        <label htmlFor="localnet-profile">Stored profile</label>
        <select id="localnet-profile" value={profile} onChange={event => setProfile(event.target.value)} required>
          <option value="" disabled>Choose a profile</option>
          {snapshot.profileIds.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        <label htmlFor="localnet-unlock-pass">Profile passphrase</label>
        <input id="localnet-unlock-pass" type="password" autoComplete="current-password" maxLength={1024} required value={unlockPass} onChange={event => setUnlockPass(event.target.value)} />
        <div className="actions"><button disabled={busy} type="submit">Unlock profile</button></div>
      </form>}
    </div>
  </section>;
}

function BackupPanel({ unlocked, busy, send }: { unlocked: boolean; busy: boolean; send: Send }) {
  const [sourcePass, setSourcePass] = useState(''), [destinationPass, setDestinationPass] = useState('');
  const [file, setFile] = useState<File | null>(null), [notice, setNotice] = useState('');
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const exportBackup = async () => {
    const result = await send({ type: 'backup.export' });
    if (!result?.ok || !result.backupBytes) return;
    const bytes = Uint8Array.from(result.backupBytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a'); link.href = url; link.download = 'p2p-offramp-profile.backup.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Encrypted backup downloaded. A download alone does not verify its passphrase or recovery contents.');
  };
  const restore = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || restoring) return;
    if (file.size === 0 || file.size > MAX_BACKUP_BYTES) { setNotice('Choose a supported encrypted backup no larger than 12 MiB.'); return; }
    const selected = file, sourcePassphrase = sourcePass, destinationPassphrase = destinationPass;
    setSourcePass(''); setDestinationPass(''); setFile(null); if (fileInput.current) fileInput.current.value = '';
    setRestoring(true); setNotice('');
    try {
      const result = await send(async () => ({ type: 'backup.restore', bytes: new Uint8Array(await selected.arrayBuffer()),
        sourcePassphrase, destinationPassphrase }));
      if (result?.ok) setNotice('Backup restored into a fresh profile. Connect your wallet and refresh chain state before acting.');
    } catch { setNotice('The backup file could not be read.'); }
    finally { setRestoring(false); }
  };
  return <section className="panel" aria-labelledby="backup-title">
    <h2 id="backup-title">Backup and recovery</h2>
    {unlocked && <button disabled={busy} onClick={() => { void exportBackup(); }}>Download encrypted backup</button>}
    <details><summary>Restore an encrypted backup</summary>
      <p className="helper">Restoring creates a fresh profile with a new encryption key. Chain state is checked again before any transaction.</p>
      <form onSubmit={event => { void restore(event); }}>
        <label htmlFor="localnet-backup-file">Encrypted backup file</label>
        <input ref={fileInput} id="localnet-backup-file" type="file" accept=".json,application/json,application/octet-stream" required onChange={event => setFile(event.target.files?.[0] ?? null)} />
        <label htmlFor="localnet-source-pass">Backup source passphrase</label>
        <input id="localnet-source-pass" type="password" autoComplete="off" maxLength={1024} required value={sourcePass} onChange={event => setSourcePass(event.target.value)} />
        <label htmlFor="localnet-restore-pass">Restored profile passphrase</label>
        <input id="localnet-restore-pass" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={destinationPass} onChange={event => setDestinationPass(event.target.value)} />
        <div className="actions"><button disabled={busy || restoring} type="submit">Restore to a fresh profile</button></div>
      </form>
    </details>
    {notice && <p role="status" className="notice">{notice}</p>}
  </section>;
}

function Market({ config, snapshot, busy, send }: { config: LocalnetConfig; snapshot: LocalnetSnapshot; busy: boolean; send: Send }) {
  const assets = config.network.assets.filter(asset => asset.kind === 'native');
  const [assetId, setAssetId] = useState(assets[0]?.id ?? ''), [amount, setAmount] = useState('10000000000000000'), [currency, setCurrency] = useState('USD');
  return <section className="panel" aria-labelledby="market-title">
    <h2 id="market-title">Local offers</h2>
    <p>Publish a public sell offer or request terms from another profile. Only the chosen trade's private messages carry payment instructions.</p>
    <form onSubmit={event => { event.preventDefault(); void send({ type: 'ad.publish', assetId, amountBaseUnits: amount, currency }); }}>
      <div className="localnet-columns">
        <div><label htmlFor="localnet-asset">Asset</label><select id="localnet-asset" value={assetId} onChange={event => setAssetId(event.target.value)}>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.id} · {asset.decimals} decimals</option>)}</select></div>
        <div><label htmlFor="localnet-amount">Amount in base units</label><input id="localnet-amount" type="text" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={78} required value={amount} onChange={event => setAmount(event.target.value)} /></div>
        <div><label htmlFor="localnet-currency">Fiat currency</label><input id="localnet-currency" type="text" pattern="[A-Z]{3}" maxLength={3} required value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></div>
      </div>
      <div className="actions"><button disabled={busy || !snapshot.wallet || !assetId} type="submit">Publish sell offer</button></div>
    </form>
    <div className="localnet-list" aria-label="Available offers">
      {snapshot.ads.length === 0 && <p className="helper">No verified offers received.</p>}
      {snapshot.ads.map(ad => <article className="localnet-item" key={ad.key} data-ad-key={ad.key}>
        <h3>{ad.amountBaseUnits} base units · {ad.assetId} / {ad.currency}</h3>
        <p className="helper">Maker <code>{ad.maker}</code></p>
        {ad.own ? <p>Your offer</p> : <button disabled={busy || !snapshot.wallet} onClick={() => { void send({ type: 'ad.take', adKey: ad.key }); }}>Request private terms</button>}
      </article>)}
    </div>
  </section>;
}

function Sessions({ snapshot, busy, send }: { snapshot: LocalnetSnapshot; busy: boolean; send: Send }) {
  const [fiatMinorUnits, setFiat] = useState('1000'), [paymentInstructions, setPayment] = useState('');
  const selected = snapshot.sessions.find(session => session.selected);
  return <section className="panel" aria-labelledby="sessions-title">
    <h2 id="sessions-title">Private negotiations</h2>
    {snapshot.sessions.length === 0 && <p className="helper">A request for terms starts a private negotiation.</p>}
    <ul className="localnet-session-list">{snapshot.sessions.map(session => <li key={session.id}>
      <button data-session-key={session.id} disabled={busy} aria-pressed={session.selected} onClick={() => { void send({ type: 'session.select', sessionId: session.id }); }}>{session.role} · {session.state} · {session.id.slice(0, 12)}</button>
    </li>)}</ul>
    {selected && <div data-session-id={selected.id}>
      <p>Buyer wallet <code>{selected.buyerAddress}</code></p>
      {selected.role === 'seller' && !selected.tradeId && <form onSubmit={event => {
        event.preventDefault(); void send({ type: 'review.prepare', action: 'offer', sessionId: selected.id, fiatMinorUnits, fiatScale: 2, paymentInstructions });
      }}>
        <label htmlFor="localnet-fiat">Fiat amount in minor units</label>
        <input id="localnet-fiat" type="text" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={30} required value={fiatMinorUnits} onChange={event => setFiat(event.target.value)} />
        <p className="helper">Scale 2: 1000 minor units means 10.00 in the offer's currency.</p>
        <label htmlFor="localnet-payment">Private payment instructions</label>
        <textarea id="localnet-payment" rows={4} maxLength={4000} required value={paymentInstructions} onChange={event => setPayment(event.target.value)} />
        <div className="actions"><button disabled={busy || !snapshot.wallet} type="submit">Review terms to offer</button></div>
      </form>}
      {selected.role === 'buyer' && selected.tradeId && <button disabled={busy || !snapshot.wallet || selected.state === 'accepted'} onClick={() => { void send({ type: 'review.prepare', action: 'accept', sessionId: selected.id }); }}>Review terms to accept</button>}
    </div>}
  </section>;
}

function Trade({ trade, busy, send }: { trade: LocalnetTradeView; busy: boolean; send: Send }) {
  const [fiatReceived, setFiatReceived] = useState(false), [text, setText] = useState('');
  const prepare = (action: 'fund' | 'release' | 'refund') => {
    const confirmed = fiatReceived; setFiatReceived(false);
    void send({ type: 'review.prepare', action, tradeId: trade.id, ...(action === 'release' ? { fiatReceiptConfirmed: confirmed } : {}) });
  };
  return <article className="panel" data-trade-id={trade.id}>
    <h3>{trade.role === 'seller' ? 'Your sale' : 'Your purchase'} · <span data-testid="chain-state">{trade.chainState ?? 'unverified'}</span></h3>
    <p className="helper">Trade <code>{trade.id}</code>{trade.restored ? ' · Restored profile' : ''}</p>
    <dl className="localnet-facts">
      <dt>Asset and amount</dt><dd>{trade.amountBaseUnits} base units · {trade.assetId}</dd>
      <dt>Seller wallet</dt><dd><code>{trade.seller}</code></dd>
      <dt>Buyer wallet</dt><dd><code>{trade.buyer}</code></dd>
      <dt>Fiat amount</dt><dd>{trade.fiatMinorUnits} minor units · {trade.fiatCurrency} · scale {trade.fiatScale}</dd>
      <dt>Acceptance deadline</dt><dd>{trade.acceptBeforeSeconds} Unix seconds</dd>
      <dt>Refund deadline</dt><dd>{trade.escrowExpirySeconds} Unix seconds</dd>
      <dt>Peer acceptance</dt><dd>{trade.peerAcceptance}</dd>
    </dl>
    <h4>Private payment instructions</h4><p className="localnet-preserve" data-testid="payment-instructions">{trade.paymentInstructions}</p>
    {trade.role === 'buyer' && <p className="helper">Refresh and verify that escrow is funded before following the agreed payment instructions. A chat message is not evidence of a bank payment.</p>}
    {trade.canRelease && <label className="checkbox-label"><input type="checkbox" checked={fiatReceived} onChange={event => setFiatReceived(event.target.checked)} />I checked my bank account and received the agreed fiat payment.</label>}
    <div className="actions">
      <button disabled={busy || !trade.canFund} onClick={() => prepare('fund')}>Review funding</button>
      <button disabled={busy || !trade.canRelease || !fiatReceived} onClick={() => prepare('release')}>Review release</button>
      <button disabled={busy || !trade.canRefund} onClick={() => prepare('refund')}>Review refund</button>
    </div>
    {trade.intents.length > 0 && <details><summary>Transaction recovery status</summary><ul>{trade.intents.map(intent => <li key={intent.id}>{intent.action} · {intent.state}{intent.hash && <> · <code>{intent.hash}</code></>}</li>)}</ul><p className="helper">An uncertain submission must be reconciled before another transaction can be prepared.</p></details>}
    <h4>Encrypted trade messages</h4>
    <ol className="localnet-messages" aria-label="Trade messages">{trade.chat.map(message => <li key={message.id}><strong>{message.direction === 'outbound' ? 'You' : 'Peer'}:</strong> <span className="localnet-preserve">{message.text}</span></li>)}</ol>
    <form onSubmit={event => { event.preventDefault(); const body = text; setText(''); void send({ type: 'chat.send', tradeId: trade.id, text: body }); }}>
      <label htmlFor={`chat-${trade.id}`}>Message to peer</label><textarea id={`chat-${trade.id}`} rows={2} maxLength={4000} required value={text} onChange={event => setText(event.target.value)} />
      <div className="actions"><button disabled={busy || !text.trim()} type="submit">Send encrypted message</button></div>
    </form>
  </article>;
}

export function LocalnetRoot() {
  const [config, setConfig] = useState<LocalnetConfig | null>(null), [snapshot, setSnapshot] = useState<LocalnetSnapshot | null>(null);
  const [startup, setStartup] = useState('Checking the local test network configuration.'), [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false), [clock, setClock] = useState(Date.now());
  const client = useRef<LocalnetClient | null>(null), pendingRef = useRef(false), epoch = useRef(0);
  useEffect(() => {
    let ended = false, owned: LocalnetClient | null = null, unsubscribe = () => {};
    void (async () => {
      try {
        const loaded = await loadInjectedLocalnetConfig(); if (ended) return;
        const provider = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
        if (!provider || typeof provider.request !== 'function') { setStartup('Connect an external EVM wallet extension, then reload this local test page.'); return; }
        owned = createLocalnetClient(loaded, provider); client.current = owned; setConfig(loaded);
        unsubscribe = owned.subscribe(value => { if (!ended) setSnapshot(value); });
        const result = await owned.request({ type: 'status' });
        if (!ended) { setSnapshot(result.snapshot); setStartup(''); }
      } catch { if (!ended) setStartup('The local test configuration or profile service could not start. Reload after checking the local harness.'); }
    })();
    const hide = () => {
      if (document.visibilityState !== 'hidden') return;
      const generation = ++epoch.current;
      pendingRef.current = false; setPending(false); setSnapshot(null);
      void owned?.request({ type: 'profile.lock' }).then(result => {
        if (!ended && generation === epoch.current) setSnapshot(result.snapshot);
      }, () => { if (!ended && generation === epoch.current) setStartup('The profile session ended. Reload to reopen it.'); });
    };
    document.addEventListener('visibilitychange', hide);
    return () => { ended = true; epoch.current++; document.removeEventListener('visibilitychange', hide); unsubscribe(); owned?.dispose(); client.current = null; };
  }, []);
  useEffect(() => { if (!snapshot?.review) return; const timer = setInterval(() => setClock(Date.now()), 500); return () => clearInterval(timer); }, [snapshot?.review]);
  const send: Send = async command => {
    const owned = client.current;
    const interrupts = typeof command !== 'function' && (command.type === 'profile.lock' || command.type === 'review.cancel');
    if (!owned || (pendingRef.current && !interrupts)) return undefined;
    const profileId = owned.snapshot()?.profileId;
    const generation = ++epoch.current;
    pendingRef.current = true; setPending(true); setError(null);
    try {
      const result = await runLocalnetUiCommand(command,
        () => generation === epoch.current && client.current === owned && owned.snapshot()?.profileId === profileId,
        prepared => owned.request(prepared));
      if (!result || generation !== epoch.current) return undefined;
      setSnapshot(result.snapshot); if (!result.ok) setError(safeCode(result.code));
      return result;
    } catch { if (generation === epoch.current) setError('SERVICE_UNAVAILABLE'); return undefined; }
    finally { if (generation === epoch.current) { pendingRef.current = false; setPending(false); } }
  };
  const unlocked = snapshot?.profileId !== null && snapshot?.profileId !== undefined && snapshot.phase !== 'locked';
  const busy = pending || snapshot?.phase === 'working', review = snapshot?.review;
  return <main className="localnet-journey" data-profile="localnet" data-release-enabled="0">
    <p className="warning" role="note">{LOCALNET_BANNER}</p>
    <h1>Trade on your local network</h1>
    <p className="lead">Separate buyer and seller profiles, private terms, and an external wallet for every signature and transaction.</p>
    {startup && <p role="status">{startup}</p>}
    {error && <p className="notice error" role="alert">The operation was refused: <code>{error}</code>. Review the current profile, wallet, and trade state before trying again.</p>}
    {snapshot && config && <>
      <section className="localnet-status" aria-label="Current session" data-profile-id={snapshot.profileId ?? ''}>
        <p>Profile: <strong>{unlocked ? 'unlocked' : 'locked'}</strong> · Relay: <span data-testid="relay-state">{snapshot.relay}</span></p>
        {unlocked && <><p className="helper">Profile <code>{snapshot.profileId}</code><br />Messaging identity <code>{snapshot.publicKey}</code></p>
          <p>Wallet: <code data-testid="wallet-account">{snapshot.wallet?.account ?? 'not connected'}</code></p>
          <div className="actions"><button disabled={busy} onClick={() => { void send({ type: 'wallet.connect' }); }}>Connect wallet</button><button disabled={busy || !snapshot.wallet} onClick={() => { void send({ type: 'refresh' }); }}>Refresh chain and messages</button><button onClick={() => { void send({ type: 'profile.lock' }); }}>Lock profile</button></div></>}
      </section>
      {!unlocked && <ProfileForms snapshot={snapshot} busy={busy} send={send} />}
      {unlocked && <div key={snapshot.profileId} data-private="localnet-profile">
        {review && <section className="panel localnet-review" role="region" aria-label="Wallet action review">
          <h2>Review: {labels[review.action]}</h2>
          <dl className="localnet-facts">{review.fields.map((field, index) => <div key={index}><dt>{field.label}</dt><dd className="localnet-preserve">{field.value}</dd></div>)}</dl>
          <p>{review.walletRequests.length} wallet {review.walletRequests.length === 1 ? 'prompt' : 'prompts'} will follow your confirmation. Check each wallet request against these terms.</p>
          {clock >= review.expiresAtMs && <p role="alert">This review expired. Cancel it and prepare a fresh review.</p>}
          <div className="actions"><button className="primary" data-testid="review-confirm" disabled={busy || clock >= review.expiresAtMs} onClick={() => { void send({ type: 'review.confirm', reviewId: review.id }); }}>Confirm and open wallet</button><button onClick={() => { void send({ type: 'review.cancel' }); }}>Cancel review</button></div>
        </section>}
        <Market config={config} snapshot={snapshot} busy={busy || Boolean(review)} send={send} />
        <Sessions snapshot={snapshot} busy={busy || Boolean(review)} send={send} />
        <section aria-labelledby="trades-title"><h2 id="trades-title">Your trades</h2>{snapshot.trades.length === 0 && <p className="helper">Agreed terms and recovery records will appear here.</p>}{snapshot.trades.map(trade => <Trade key={trade.id} trade={trade} busy={busy || Boolean(review)} send={send} />)}</section>
      </div>}
      <BackupPanel key={snapshot.profileId ?? 'locked'} unlocked={unlocked} busy={busy} send={send} />
    </>}
  </main>;
}
