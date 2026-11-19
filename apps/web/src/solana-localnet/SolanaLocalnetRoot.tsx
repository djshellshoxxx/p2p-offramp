import { useEffect, useRef, useState } from 'react';
import { MAX_BACKUP_BYTES } from '../../../../packages/schemas/index.ts';
import { SOLANA_LOCALNET_BANNER, parseSolanaLocalnetConfig } from './config.ts';
import { createSolanaRecoveryClient } from './client.ts';
import { discoverSolanaWallets, type DiscoveredSolanaWallet } from './discovery.ts';
import type { RecoveryAction, SolanaBrowserClient, SolanaCommand, SolanaSnapshot, SolanaTradeView } from './protocol.ts';
import './solana-localnet.css';

function download(bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'solana-recovery-encrypted.backup'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SolanaLocalnetRoot() {
  const client = useRef<SolanaBrowserClient | null>(null);
  const [wallets, setWallets] = useState<readonly DiscoveredSolanaWallet[]>([]), [choice, setChoice] = useState('');
  const [snapshot, setSnapshot] = useState<SolanaSnapshot | null>(null), [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState(''), [profile, setProfile] = useState('');
  const [recovery, setRecovery] = useState(''), [role, setRole] = useState<'seller' | 'buyer'>('seller');
  const [backup, setBackup] = useState<Uint8Array | null>(null), [sourcePass, setSourcePass] = useState(''), [newPass, setNewPass] = useState('');
  const [received, setReceived] = useState<Record<string, boolean>>({}), [topUp, setTopUp] = useState<Record<string, string>>({});
  const busy = snapshot?.phase === 'working', open = !!snapshot?.profileId;
  const clearPrivate = () => { setPassphrase(''); setSourcePass(''); setNewPass(''); setReceived({}); setRecovery(''); setBackup(null); setTopUp({}); };
  async function request(command: SolanaCommand) {
    setError(null);
    try {
      const result = await client.current!.request(command);
      if (!result.ok) setError(result.code);
      else if (result.backupBytes) download(result.backupBytes);
      return result;
    } catch { setError('UNAVAILABLE'); return null; }
  }
  useEffect(() => {
    const stop = discoverSolanaWallets(setWallets);
    const hide = () => { if (document.hidden) { clearPrivate(); void client.current?.request({ type: 'profile.lock' }); } };
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); document.removeEventListener('visibilitychange', hide); client.current?.dispose(); };
  }, []);
  async function selectWallet() {
    if (client.current) return;
    const selected = wallets.find(w => String(w.id) === choice);
    if (!selected) { setError('Select a Wallet Standard wallet.'); return; }
    try {
      const config = await parseSolanaLocalnetConfig(__P2P_SOLANA_LOCALNET_CONFIG__);
      const created = createSolanaRecoveryClient(config, selected.wallet); client.current = created;
      created.subscribe(next => { setSnapshot(next); if (next.profileId === null) clearPrivate(); });
      await request({ type: 'status' });
    } catch { setError('This wallet does not support localnet sign-only transactions and change notifications.'); }
  }
  async function prepare(trade: SolanaTradeView, action: RecoveryAction, rebuildOf?: string) {
    const confirmed = received[trade.id] === true; setReceived({});
    await request({ type: 'review.prepare', tradeId: trade.id, action,
      ...(action === 'release' ? { fiatReceiptConfirmed: confirmed } : {}),
      ...(action === 'payout' ? { maxRentTopUpLamports: topUp[trade.id] ?? '0' } : {}),
      ...(rebuildOf ? { rebuildOf } : {}) });
  }
  return <main className="solana-recovery" aria-busy={busy} data-release-enabled="0" data-profile-id={snapshot?.profileId ?? ''}
    data-phase={snapshot?.phase ?? 'locked'} data-wallet-account={snapshot?.wallet?.address ?? ''} data-wallet-trade={snapshot?.wallet?.tradeId ?? ''}>
    <header><p className="solana-banner">{SOLANA_LOCALNET_BANNER}</p><h1>Recover a funded Solana escrow</h1>
      <p>Import the original recovery document, check finalized chain state, and review each settlement transaction with your wallet.</p></header>
    {!client.current && <section><h2>Choose your wallet</h2><label>Wallet Standard wallet<select value={choice} onChange={e => setChoice(e.target.value)}>
      <option value="">Select wallet</option>{wallets.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}</select></label>
      <button type="button" onClick={() => void selectWallet()}>Use selected wallet</button>
      {!wallets.length && <p>No compatible wallet has registered with this page.</p>}</section>}
    {client.current && <section><h2>Your encrypted recovery profile</h2>
      {!open ? <><label>Profile<select value={profile} onChange={e => setProfile(e.target.value)}><option value="">Choose an existing profile</option>
        {snapshot?.profileIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
        <label>Profile passphrase<input type="password" value={passphrase} autoComplete="off" onChange={e => setPassphrase(e.target.value)} /></label>
        <div className="solana-actions"><button disabled={busy || !passphrase} onClick={() => { const p = passphrase; clearPrivate(); void request({ type: 'profile.create', passphrase: p }); }}>Create recovery profile</button>
          <button disabled={busy || !profile || !passphrase} onClick={() => { const p = passphrase; clearPrivate(); void request({ type: 'profile.unlock', profileId: profile, passphrase: p }); }}>Unlock recovery profile</button></div></>
        : <><p>Profile: <code>{snapshot?.profileId}</code></p>{snapshot?.wallet && <p>Connected wallet: <code>{snapshot.wallet.address}</code></p>}<div className="solana-actions"><button onClick={() => { clearPrivate(); void request({ type: 'profile.lock' }); }}>Lock profile</button>
          <button disabled={busy} onClick={() => void request({ type: 'backup.export' })}>Export encrypted backup</button>
          <button disabled={busy} onClick={() => void request({ type: 'refresh' })}>Refresh finalized state</button></div></>}
    </section>}
    {client.current && !open && <section><h2>Restore an encrypted backup</h2>
      <label>Encrypted backup<input type="file" onChange={async e => { const file = e.target.files?.[0]; if (!file || file.size > MAX_BACKUP_BYTES) { setError('BACKUP_TOO_LARGE'); return; } setBackup(new Uint8Array(await file.arrayBuffer())); }} /></label>
      <label>Backup passphrase<input type="password" value={sourcePass} autoComplete="off" onChange={e => setSourcePass(e.target.value)} /></label>
      <label>New profile passphrase<input type="password" value={newPass} autoComplete="off" onChange={e => setNewPass(e.target.value)} /></label>
      <button disabled={busy || !backup || !sourcePass || !newPass} onClick={() => { if (!backup) return; const bytes = backup, s = sourcePass, d = newPass; setBackup(null); clearPrivate(); void request({ type: 'backup.restore', bytes, sourcePassphrase: s, destinationPassphrase: d }); }}>Restore with a fresh key</button>
      <p>Restored transactions are reconciled with finalized chain state. They are never resent automatically.</p>
    </section>}
    {open && <section><h2>Import the original recovery document</h2>
      <label>Recovery JSON<textarea rows={5} value={recovery} maxLength={16384} onChange={e => setRecovery(e.target.value)} /></label>
      <label>Your role<select value={role} onChange={e => setRole(e.target.value as 'seller' | 'buyer')}><option value="seller">Seller</option><option value="buyer">Buyer</option></select></label>
      <button disabled={busy || !recovery} onClick={() => void request({ type: 'recovery.import', text: recovery, role })}>Verify and save recovery document</button>
      <p>The document must name this local validator and the original immutable program. The escrow must already be funded.</p>
    </section>}
    {snapshot?.trades.map(trade => <section key={trade.id} data-trade-id={trade.id} data-chain-state={trade.state} data-paid-out={String(trade.paidOut)}>
      <h2>Escrow settlement</h2><dl><dt>Escrow</dt><dd>{trade.escrow}</dd><dt>Terms SHA-256</dt><dd>{trade.id}</dd><dt>Principal</dt><dd>{trade.amountBaseUnits} lamports</dd>
        <dt>Seller</dt><dd>{trade.seller}</dd><dt>Buyer</dt><dd>{trade.buyer}</dd><dt>Finalized state</dt><dd>{trade.state}{trade.paidOut ? ' · paid out' : ''}</dd>
        <dt>Finalized chain time</dt><dd>{trade.chainTimeSeconds ?? 'Unavailable'}</dd><dt>Deadline</dt><dd>{trade.deadlineSeconds}</dd></dl>
      {trade.restored && <p>Recovered into this fresh profile. Original transaction provenance is preserved.</p>}
      <button disabled={busy} onClick={() => void request({ type: 'wallet.connect', tradeId: trade.id })}>Connect {trade.role} wallet</button>
      {trade.role === 'seller' && <label className="solana-check"><input type="checkbox" checked={received[trade.id] === true} onChange={e => setReceived({ ...received, [trade.id]: e.target.checked })} />I checked my bank account and received the agreed fiat payment.</label>}
      <div className="solana-actions"><button disabled={busy || !trade.canRelease || !received[trade.id]} onClick={() => void prepare(trade, 'release')}>Review release</button>
        <button disabled={busy || !trade.canRefund} onClick={() => void prepare(trade, 'refund')}>Review refund</button>
        <button disabled={busy || !trade.canPayout} onClick={() => void prepare(trade, 'payout')}>Review separate payout</button></div>
      {trade.rentTopUpLamports !== null && <label>Maximum rent top-up (lamports; required: {trade.rentTopUpLamports})<input value={topUp[trade.id] ?? '0'} inputMode="numeric" onChange={e => setTopUp({ ...topUp, [trade.id]: e.target.value })} /></label>}
      {trade.payoutBlockedBy.length > 0 && <p>Payout condition: {trade.payoutBlockedBy.join(', ')}</p>}
      <ul>{trade.intents.map(intent => <li key={intent.id}>{intent.action}: {intent.state} {intent.signature && <code>{intent.signature}</code>}
        {intent.state === 'dropped' && ['release', 'refund', 'payout'].includes(intent.action) && <button disabled={busy || (intent.action === 'release' && !received[trade.id])}
          onClick={() => void prepare(trade, intent.action as RecoveryAction, intent.id)}>Review a new {intent.action} after this definitive drop</button>}</li>)}</ul>
    </section>)}
    {snapshot?.review && <section aria-labelledby="solana-review-title" data-review-id={snapshot.review.id}><h2 id="solana-review-title">Review this exact transaction</h2>
      <dl>{snapshot.review.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      <p>Your wallet signs only this message. The client records the transaction signature before one broadcast attempt.</p>
      <button disabled={busy} onClick={() => void request({ type: 'review.confirm', reviewId: snapshot.review!.id })}>Confirm and sign in wallet</button>
      <button onClick={() => void request({ type: 'review.cancel' })}>Cancel transaction review</button></section>}
    {(error || snapshot?.error) && <p role="alert">{error ?? snapshot?.error}</p>}
  </main>;
}
