import { useEffect, useRef, useState } from 'react';
import { MAX_BACKUP_BYTES } from '../../../../packages/schemas/index.ts';
import { SOLANA_LOCALNET_BANNER, parseSolanaLocalnetConfig } from './config.ts';
import { createSolanaRecoveryClient } from './client.ts';
import { discoverSolanaWallets, type DiscoveredSolanaWallet } from './discovery.ts';
import type { RecoveryAction, SolanaBrowserClient, SolanaCommand, SolanaSnapshot, SolanaTradeView } from './protocol.ts';
import './solana-localnet.css';

function download(bytes: Uint8Array, name = 'solana-recovery-encrypted.backup', type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SolanaLocalnetRoot() {
  const client = useRef<SolanaBrowserClient | null>(null), observedProfile = useRef<string | null>(null);
  const active = useRef(true), commandEpoch = useRef(0), pendingRequest = useRef(false), inputEpoch = useRef(0);
  const backupInput = useRef<HTMLInputElement | null>(null), backupBytes = useRef<Uint8Array | null>(null);
  const [wallets, setWallets] = useState<readonly DiscoveredSolanaWallet[]>([]), [choice, setChoice] = useState('');
  const [snapshot, setSnapshot] = useState<SolanaSnapshot | null>(null), [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [passphrase, setPassphrase] = useState(''), [profile, setProfile] = useState('');
  const [proposal, setProposal] = useState(''), [recovery, setRecovery] = useState(''), [role, setRole] = useState<'seller' | 'buyer'>('seller');
  const [backup, setBackup] = useState<Uint8Array | null>(null), [sourcePass, setSourcePass] = useState(''), [newPass, setNewPass] = useState('');
  const [received, setReceived] = useState<Record<string, boolean>>({}), [topUp, setTopUp] = useState<Record<string, string>>({});
  const busy = pending || snapshot?.phase === 'working', open = !!snapshot?.profileId;
  const clearPrivate = () => {
    inputEpoch.current++; backupBytes.current?.fill(0); backupBytes.current = null;
    if (backupInput.current) backupInput.current.value = '';
    setPassphrase(''); setSourcePass(''); setNewPass(''); setReceived({}); setProposal(''); setRecovery(''); setBackup(null); setTopUp({});
  };
  async function request(command: SolanaCommand) {
    const owned = client.current, interrupts = command.type === 'profile.lock' || command.type === 'review.cancel';
    if (!active.current || !owned || pendingRequest.current && !interrupts) {
      if (command.type === 'backup.restore') command.bytes.fill(0);
      return null;
    }
    const generation = ++commandEpoch.current, profileId = owned.snapshot()?.profileId;
    pendingRequest.current = true; setPending(true); setError(null);
    try {
      const response = owned.request(command);
      // postMessage has synchronously cloned the payload; the document retains no submitted bytes.
      if (command.type === 'backup.restore') command.bytes.fill(0);
      const result = await response;
      if (!active.current || generation !== commandEpoch.current || client.current !== owned) return null;
      if (command.type === 'funding.proposal.import' && (!profileId || result.snapshot.profileId !== profileId || owned.snapshot()?.profileId !== profileId)) return null;
      if (!result.ok) setError(result.code);
      else if (result.backupBytes) download(result.backupBytes);
      else if (command.type === 'recovery.export' && result.recoveryJson && profileId &&
        result.snapshot.profileId === profileId && owned.snapshot()?.profileId === profileId) {
        download(new TextEncoder().encode(result.recoveryJson), `solana-escrow-${command.tradeId}.recovery.json`, 'application/json');
      }
      return result;
    } catch { if (active.current && generation === commandEpoch.current) setError('UNAVAILABLE'); return null; }
    finally {
      if (command.type === 'backup.restore') command.bytes.fill(0);
      if (active.current && generation === commandEpoch.current) { pendingRequest.current = false; setPending(false); }
    }
  }
  async function readBackup(file: File | undefined) {
    const generation = ++inputEpoch.current, owned = client.current;
    backupBytes.current?.fill(0); backupBytes.current = null; setBackup(null);
    const current = () => active.current && generation === inputEpoch.current && client.current === owned &&
      !pendingRequest.current && owned?.snapshot()?.profileId === null && owned.snapshot()?.phase !== 'working';
    if (!current()) return;
    if (!file || !file.size || file.size > MAX_BACKUP_BYTES) { setError('BACKUP_TOO_LARGE'); return; }
    let bytes: Uint8Array | null = null;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      if (!current()) return;
      if (bytes.byteLength !== file.size || bytes.byteLength > MAX_BACKUP_BYTES) { setError('BACKUP_TOO_LARGE'); return; }
      backupBytes.current = bytes; setBackup(bytes); bytes = null;
    } catch { if (current()) setError('UNAVAILABLE'); }
    finally { bytes?.fill(0); }
  }
  useEffect(() => {
    active.current = true;
    const stop = discoverSolanaWallets(setWallets);
    const hide = () => { if (document.hidden) { clearPrivate(); void request({ type: 'profile.lock' }); } };
    document.addEventListener('visibilitychange', hide);
    return () => { active.current = false; commandEpoch.current++; clearPrivate(); stop(); document.removeEventListener('visibilitychange', hide); client.current?.dispose(); client.current = null; };
  }, []);
  async function selectWallet() {
    if (client.current) return;
    const selected = wallets.find(w => String(w.id) === choice);
    if (!selected) { setError('Select a Wallet Standard wallet.'); return; }
    try {
      const config = await parseSolanaLocalnetConfig(__P2P_SOLANA_LOCALNET_CONFIG__);
      if (!active.current || client.current) return;
      const created = createSolanaRecoveryClient(config, selected.wallet); client.current = created;
      created.subscribe(next => { if (active.current) {
        if (next.profileId === null || next.profileId !== observedProfile.current) clearPrivate();
        observedProfile.current = next.profileId; setSnapshot(next);
      } });
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
    <header><p className="solana-banner">{SOLANA_LOCALNET_BANNER}</p><h1>Local Solana proposals and recovery</h1>
      <p>Save fixed seller proposals, or import the original recovery document to review finalized escrow settlement with your wallet.</p></header>
    {!client.current && <section><h2>Choose your wallet</h2><div className="solana-field"><label htmlFor="solana-wallet-choice">Wallet Standard wallet</label><select id="solana-wallet-choice" value={choice} onChange={e => setChoice(e.target.value)}>
      <option value="">Select wallet</option>{wallets.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}</select></div>
      <button type="button" onClick={() => void selectWallet()}>Use selected wallet</button>
      {!wallets.length && <p>No compatible wallet has registered with this page.</p>}</section>}
    {client.current && <section><h2>Your encrypted recovery profile</h2>
      {!open ? <><div className="solana-field"><label htmlFor="solana-profile-choice">Profile</label><select id="solana-profile-choice" disabled={busy} value={profile} onChange={e => setProfile(e.target.value)}><option value="">Choose an existing profile</option>
        {snapshot?.profileIds.map(id => <option key={id} value={id}>{id}</option>)}</select></div>
        <label>Profile passphrase<input type="password" disabled={busy} value={passphrase} autoComplete="off" onChange={e => setPassphrase(e.target.value)} /></label>
        <div className="solana-actions"><button disabled={busy || !passphrase} onClick={() => { const p = passphrase; clearPrivate(); void request({ type: 'profile.create', passphrase: p }); }}>Create recovery profile</button>
          <button disabled={busy || !profile || !passphrase} onClick={() => { const p = passphrase; clearPrivate(); void request({ type: 'profile.unlock', profileId: profile, passphrase: p }); }}>Unlock recovery profile</button></div></>
        : <><p>Profile: <code>{snapshot?.profileId}</code></p>{snapshot?.wallet && <p>Connected wallet: <code>{snapshot.wallet.address}</code></p>}<div className="solana-actions"><button onClick={() => { clearPrivate(); void request({ type: 'profile.lock' }); }}>Lock profile</button>
          <button disabled={busy} onClick={() => void request({ type: 'backup.export' })}>Export encrypted backup</button>
          <button disabled={busy} onClick={() => void request({ type: 'refresh' })}>Refresh finalized state</button></div></>}
    </section>}
    {client.current && !open && <section><h2>Restore an encrypted backup</h2>
      <label>Encrypted backup<input ref={backupInput} type="file" disabled={busy} onChange={e => readBackup(e.target.files?.[0])} /></label>
      <label>Backup passphrase<input type="password" disabled={busy} value={sourcePass} autoComplete="off" onChange={e => setSourcePass(e.target.value)} /></label>
      <label>New profile passphrase<input type="password" disabled={busy} value={newPass} autoComplete="off" onChange={e => setNewPass(e.target.value)} /></label>
      <button disabled={busy || !backup || !sourcePass || !newPass} onClick={() => { if (!backup || pendingRequest.current) return; const bytes = backup, s = sourcePass, d = newPass; backupBytes.current = null; clearPrivate(); void request({ type: 'backup.restore', bytes, sourcePassphrase: s, destinationPassphrase: d }); }}>Restore with a fresh key</button>
      <p>Restored transactions are reconciled with finalized chain state. They are never resent automatically.</p>
    </section>}
    {open && <section><h2>Save a seller funding proposal</h2>
      <p>Paste the complete proposal JSON for this local validator. Saving retains the fixed terms in your encrypted profile. Peer acceptance has not been established, and saving does not prepare or send a transaction.</p>
      <div className="solana-field"><label htmlFor="solana-funding-proposal-json">Funding proposal JSON</label><textarea id="solana-funding-proposal-json" rows={5} value={proposal} maxLength={4096} disabled={busy} onChange={e => setProposal(e.target.value)} /></div>
      <button disabled={busy || !proposal} onClick={() => { if (pendingRequest.current) return; const text = proposal; setProposal(''); void request({ type: 'funding.proposal.import', text }); }}>Save seller funding proposal</button>
      <p>Retained trade bindings: {snapshot?.tradeCapacity.used} of {snapshot?.tradeCapacity.limit}. Existing recovery remains available when a restored profile exceeds this admission limit.</p>
    </section>}
    {snapshot?.proposals.map(proposal => <section key={proposal.id} data-proposal-id={proposal.id} data-binding-status={proposal.bindingStatus}>
      <h2>Saved proposal</h2><p>Peer acceptance has not been established. Saving these terms does not prepare or send a transaction.</p>
      {proposal.restored && <p>Original provenance preserved after restore</p>}
      {proposal.bindingStatus === 'configuration-mismatch' && <p>Saved with a different local configuration</p>}
      {proposal.bindingStatus === 'unsupported' && <p>These terms are unsupported by this build</p>}
      {proposal.escrowConflict && <p>Another retained binding uses this escrow</p>}
      {proposal.recoveryRetained && <p>A recovery document is retained; use its settlement section</p>}
      <dl><dt>Terms SHA-256</dt><dd>{proposal.binding.tradeId}</dd><dt>Local network</dt><dd>{proposal.binding.networkId}</dd>
        <dt>Deployment</dt><dd>{proposal.binding.deploymentId}</dd><dt>Escrow</dt><dd>{proposal.escrow ?? 'Unavailable under this configuration'}</dd>
        {[
          ['Network genesis', proposal.terms.genesisHash], ['Immutable program', proposal.terms.programId], ['Order ID', proposal.terms.orderId],
          ['Seller', proposal.terms.seller], ['Buyer', proposal.terms.buyer], ['Asset', 'Native SOL'], ['Mint', 'None'], ['Token program', 'None'],
          ['Private agreement SHA-256', proposal.terms.privateAgreementHash], ['Capabilities SHA-256', proposal.terms.capabilitiesHash],
          ['Seller nonce', proposal.terms.sellerNonce], ['Revision', proposal.terms.revision], ['Principal (lamports)', proposal.terms.amountBaseUnits],
          ['Acceptance deadline (chain seconds)', proposal.terms.acceptBeforeSeconds], ['Escrow expiry (chain seconds)', proposal.terms.escrowExpirySeconds],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>)}
    {open && <section><h2>Import the original recovery document</h2>
      <div className="solana-field"><label htmlFor="solana-recovery-json">Recovery JSON</label><textarea id="solana-recovery-json" rows={5} value={recovery} maxLength={16384} onChange={e => setRecovery(e.target.value)} /></div>
      <div className="solana-field"><label htmlFor="solana-recovery-role">Your role</label><select id="solana-recovery-role" value={role} onChange={e => setRole(e.target.value as 'seller' | 'buyer')}><option value="seller">Seller</option><option value="buyer">Buyer</option></select></div>
      <button disabled={busy || !recovery} onClick={() => void request({ type: 'recovery.import', text: recovery, role })}>Verify and save recovery document</button>
      <p>The document must name this local validator and the original immutable program. The escrow must already be funded.</p>
    </section>}
    {snapshot?.trades.map(trade => <section key={trade.id} data-trade-id={trade.id} data-chain-state={trade.state} data-paid-out={String(trade.paidOut)}>
      <h2>Escrow settlement</h2><dl><dt>Escrow</dt><dd>{trade.escrow}</dd><dt>Terms SHA-256</dt><dd>{trade.id}</dd><dt>Principal</dt><dd>{trade.amountBaseUnits} lamports</dd>
        <dt>Seller</dt><dd>{trade.seller}</dd><dt>Buyer</dt><dd>{trade.buyer}</dd><dt>Finalized state</dt><dd>{trade.state}{trade.paidOut ? ' · paid out' : ''}</dd>
        <dt>Finalized chain time</dt><dd>{trade.chainTimeSeconds ?? 'Unavailable'}</dd><dt>Deadline</dt><dd>{trade.deadlineSeconds}</dd></dl>
      {trade.restored && <p>Recovered into this fresh profile. Original transaction provenance is preserved.</p>}
      <button disabled={busy} onClick={() => void request({ type: 'recovery.export', tradeId: trade.id })}>Export public recovery JSON</button>
      <p>Public file: original trade terms, wallet addresses and deployment identity. Keep an encrypted backup for your private profile and transaction journal.</p>
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
