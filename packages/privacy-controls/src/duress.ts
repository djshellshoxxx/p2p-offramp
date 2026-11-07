/** Explicit LOCAL decoy routing, not a hidden credential detector or spending credential. */
import { decodeBase64url, parseStrictJsonBytes, MAX_VAULT_PROFILES, type CoreErrorCode, type CoreResult, type VaultSession } from '../../schemas/index.ts';
import { Preferences, consentOf, requireVault, type LocalVault, type LocalWrite } from './preferences.ts';
import { codeOf, data, failed, integer, list, LocalGate, ok, passphrase, profileId, stop, unwrap } from './shared.ts';

const DECOY_ID = '59d00000000000000000000000000001', POLICY_ID = '59d00000000000000000000000000002';
const DECOY_FORMAT = 'p2p-offramp-local-decoy', POLICY_FORMAT = 'p2p-offramp-local-duress';
const ACTIONS = Object.freeze(['lock-real-session', 'open-decoy-profile', 'hide-local-notifications'] as const);
export interface DecoyProfile { readonly kind: 'independent-local-decoy'; readonly profileId: string; readonly readOnly: true; }
export interface DecoyCreation { readonly profileId: string; readonly persisted: true; readonly initialized: boolean; readonly decoy: DecoyProfile | null; readonly reason: CoreErrorCode | null; }
const descriptors = new WeakMap<object, { readonly profileId: string; readonly vault: LocalVault }>(), creating = new WeakSet<object>();
const credentialAttempts = new WeakMap<object, Map<string, number[]>>();
const marker = (id: string) => Object.freeze({ format: DECOY_FORMAT, version: 1, profileId: id, demo: true, liveBindings: false });
export async function createDecoyProfile(vaultInput: LocalVault, password: string, signal?: AbortSignal): Promise<CoreResult<DecoyCreation>> {
  if (typeof vaultInput !== 'object' || vaultInput === null) return failed('INVALID_INPUT');
  if (creating.has(vaultInput)) return failed('CONFLICT'); creating.add(vaultInput);
  let session: VaultSession | undefined, prefs: Preferences | undefined, vault: LocalVault | undefined;
  const gate = new LocalGate(() => prefs === undefined || prefs.current() !== null);
  try {
    return await gate.run(async job => {
      vault = requireVault(vaultInput); const secret = passphrase(password); job.guard();
      session = unwrap(await vault.create(secret, job.signal, job.guard)); job.durable();
      // Creation itself is durable. If marker initialization fails, retain a discoverable
      // scalar receipt rather than pretending the encrypted row was rolled back.
      try {
        job.guard(); prefs = new Preferences(vault, session, () => gate.close()); job.guard();
        const found = await prefs.read(DECOY_ID, job); if (found.row) return stop('INTEGRITY_FAILURE');
        const rows = unwrap(await vault.list(session.sessionId)); job.guard(); if (rows.length) return stop('INTEGRITY_FAILURE');
        await prefs.put(DECOY_ID, found.revision, marker(session.profileId), job);
        const descriptor: DecoyProfile = Object.freeze({ kind: 'independent-local-decoy', profileId: session.profileId, readOnly: true });
        descriptors.set(descriptor, { profileId: session.profileId, vault });
        return Object.freeze({ profileId: session.profileId, persisted: true, initialized: true, decoy: descriptor, reason: null });
      } catch (error) { return Object.freeze({ profileId: session.profileId, persisted: true, initialized: false, decoy: null, reason: codeOf(error) }); }
    }, signal);
  } catch (error) { return failed(codeOf(error)); }
  finally {
    prefs?.dispose();
    if (session && vault) { try { vault.lock(session.sessionId); } catch { /* No native session is published. */ } }
    try { gate.close(); } finally { creating.delete(vaultInput); }
  }
}
interface Policy { readonly format: typeof POLICY_FORMAT; readonly version: 1; readonly normalProfileId: string; readonly decoyProfileId: string; readonly revision: number; readonly consentedAt: number; readonly enabled: boolean; readonly actions: readonly string[]; }
function parsePolicy(input: unknown, real: string): Policy {
  const p = data(input, ['format', 'version', 'normalProfileId', 'decoyProfileId', 'revision', 'consentedAt', 'enabled', 'actions']);
  if (p.version !== 1) return stop('UNSUPPORTED_VERSION');
  const normalProfileId = profileId(p.normalProfileId), decoyProfileId = profileId(p.decoyProfileId), actions = list(p.actions, 3);
  if (p.format !== POLICY_FORMAT || normalProfileId !== real || decoyProfileId === real || typeof p.enabled !== 'boolean' ||
    actions.length !== ACTIONS.length || actions.some((action, i) => action !== ACTIONS[i])) return stop('INTEGRITY_FAILURE');
  return Object.freeze({ format: POLICY_FORMAT, version: 1, normalProfileId, decoyProfileId, revision: integer(p.revision, 1), consentedAt: integer(p.consentedAt), enabled: p.enabled, actions: ACTIONS });
}
export interface DuressControllerOptions { readonly vault: LocalVault; readonly normalSession: VaultSession; readonly isCurrent: () => boolean; readonly now: () => number; }
export interface DecoyView { readonly mode: 'decoy-session'; readonly profileId: string; readonly readOnly: true; readonly demo: true; readonly walletAuthority: false; readonly notificationsHidden: true; }
export interface DuressStatus { readonly phase: 'normal-session' | 'switching' | 'decoy-session' | 'locked-error' | 'closed'; readonly enrolled: boolean; readonly generation: number; readonly notificationsHidden: boolean; }
export interface DuressController {
  inspect(): DuressStatus;
  load(signal?: AbortSignal): Promise<CoreResult<Readonly<{ enabled: boolean; policyRevision: number }>>>;
  enrollDuress(decoy: DecoyProfile, consent: unknown, signal?: AbortSignal): Promise<CoreResult<LocalWrite & { readonly policyRevision: number }>>;
  disableDuress(consent: unknown, signal?: AbortSignal): Promise<CoreResult<LocalWrite & { readonly policyRevision: number }>>;
  enterCredential(input: { readonly purpose: 'decoy'; readonly passphrase: string }, expectedPolicyRevision: number, signal?: AbortSignal): Promise<CoreResult<DecoyView>>;
  cancel(): void; lockAll(): void; dispose(): void;
}
export function createDuressController(input: DuressControllerOptions): CoreResult<DuressController> {
  let prefs: Preferences | undefined;
  try {
    const p = data(input, ['vault', 'normalSession', 'isCurrent', 'now']), vault = requireVault(p.vault);
    if (typeof p.isCurrent !== 'function' || typeof p.now !== 'function') return failed('INVALID_INPUT');
    const current = p.isCurrent as () => boolean, now = p.now as () => number;
    const s = data(p.normalSession, ['sessionId', 'profileId', 'revision']), realId = profileId(s.profileId);
    let phase: DuressStatus['phase'] = 'normal-session', generation = 0, policy: Policy | null = null, hidden = false, decoySession: VaultSession | undefined;
    let openingPrefs: Preferences | undefined, openingSession: VaultSession | undefined;
    let previousNow = -1, retired = false;
    let gate: LocalGate;
    const discard = (): void => {
      if (retired) return; retired = true; policy = null; hidden = false; phase = 'closed'; generation++;
      const resident = prefs, provisional = openingPrefs, owned = decoySession ?? openingSession;
      prefs = undefined; openingPrefs = undefined; decoySession = undefined; openingSession = undefined;
      gate.close(); resident?.dispose(); provisional?.dispose();
      if (owned) { try { vault.lock(owned.sessionId); } catch { /* Retired regardless of foreign cleanup. */ } }
    };
    const fresh = (): boolean => {
      if (current() !== true) return false;
      // Only the deliberate lock-to-unlock gap has no native lease. Once native
      // unlock returns, its provisional lease guards every await and publication.
      if (phase === 'switching') return openingPrefs === undefined || openingPrefs.current() !== null;
      return (phase === 'normal-session' || phase === 'decoy-session') && prefs !== undefined && prefs.current() !== null;
    };
    gate = new LocalGate(fresh, discard);
    prefs = new Preferences(vault, p.normalSession as VaultSession, discard); const normal = prefs;
    if (!normal.current()) { discard(); return failed('LOCKED'); }
    let counters = credentialAttempts.get(vault);
    if (!counters) { counters = new Map(); credentialAttempts.set(vault, counters); }
    let attempts = counters.get(realId);
    if (!attempts) { if (counters.size >= MAX_VAULT_PROFILES) { discard(); return failed('LIMIT_EXCEEDED'); } attempts = []; counters.set(realId, attempts); }
    const profileAttempts = attempts;
    function clock(): number { const value = integer(now()); if (value < previousNow) { discard(); return stop('EXPIRED'); } previousNow = value; return value; }
    function requireNormal(): void { if (phase !== 'normal-session' || !normal.current()) return stop('LOCKED'); }
    async function readPolicy(job: Parameters<Parameters<LocalGate['run']>[0]>[0]): Promise<{ policy: Policy | null; revision: number }> {
      requireNormal(); const found = await normal.read(POLICY_ID, job); job.guard();
      const value = found.row ? parsePolicy(found.value, realId) : null; job.guard(); policy = value;
      return { policy: value, revision: found.revision };
    }
    const facade: DuressController = {
      inspect() {
        const owner = phase === 'switching' ? openingPrefs : prefs;
        if (!gate.isClosed && owner && !owner.current()) discard();
        return Object.freeze({ phase: gate.isClosed ? 'closed' : phase, enrolled: policy?.enabled === true, generation, notificationsHidden: hidden });
      },
      load(signal) { return gate.run(async job => { const found = await readPolicy(job); return Object.freeze({ enabled: found.policy?.enabled === true, policyRevision: found.policy?.revision ?? 0 }); }, signal); },
      enrollDuress(decoy, consent, signal) {
        return gate.run(async job => {
          requireNormal(); consentOf(consent); job.guard();
          const d = typeof decoy === 'object' && decoy !== null ? descriptors.get(decoy) : undefined;
          if (!d || d.vault !== vault || d.profileId === realId) return stop('UNAUTHORIZED');
          const found = await readPolicy(job), at = clock(); job.guard();
          const next: Policy = Object.freeze({ format: POLICY_FORMAT, version: 1, normalProfileId: realId, decoyProfileId: d.profileId,
            revision: integer((found.policy?.revision ?? 0) + 1, 1), consentedAt: at, enabled: true, actions: ACTIONS });
          const receipt = await normal.put(POLICY_ID, found.revision, next, job); if (receipt.sessionCurrent && !gate.isClosed) policy = next;
          return Object.freeze({ ...receipt, policyRevision: next.revision });
        }, signal);
      },
      disableDuress(consent, signal) {
        return gate.run(async job => {
          requireNormal(); consentOf(consent); const found = await readPolicy(job); if (!found.policy) return stop('UNAUTHORIZED');
          const at = clock(); job.guard(); const next = Object.freeze({ ...found.policy, revision: integer(found.policy.revision + 1, 1), consentedAt: at, enabled: false });
          const receipt = await normal.put(POLICY_ID, found.revision, next, job); if (receipt.sessionCurrent && !gate.isClosed) policy = next;
          return Object.freeze({ ...receipt, policyRevision: next.revision });
        }, signal);
      },
      enterCredential(credential, expectedPolicyRevision, signal) {
        return gate.run(async job => {
          requireNormal(); const c = data(credential, ['purpose', 'passphrase']); if (c.purpose !== 'decoy') return stop('UNSUPPORTED_PROVIDER');
          const password = passphrase(c.passphrase), expected = integer(expectedPolicyRevision, 1); job.guard();
          const found = await readPolicy(job); if (!found.policy?.enabled || found.policy.revision !== expected) return stop('CONFLICT');
          const decoyId = found.policy.decoyProfileId;
          // Detach only the expected normal-session subscription before our own lock.
          // A subsequent external native lock changes G02's epoch and retires unlock.
          policy = null; generation++; phase = 'switching'; hidden = true; prefs = undefined; job.setRevisionGuard(null);
          normal.dispose();
          vault.lockAll(); job.guard();
          let opened: VaultSession | undefined;
          try {
            const at = clock(); job.guard(); while (profileAttempts.length && at - profileAttempts[0]! >= 60_000) profileAttempts.shift();
            if (profileAttempts.length >= 5) return stop('LIMIT_EXCEEDED'); profileAttempts.push(at);
            opened = unwrap(await vault.unlock(decoyId, password, job.signal)); openingSession = opened; job.guard();
            const decoy = new Preferences(vault, opened, discard); openingPrefs = decoy; decoy.pin(job, opened.revision);
            try {
              if (!decoy.current() || opened.profileId !== decoyId || decoyId === realId) return stop('LOCKED');
              const rows = unwrap(await vault.list(opened.sessionId)); job.guard();
              if (rows.length !== 1 || rows[0]!.id !== DECOY_ID || rows[0]!.kind !== 'preference' || rows[0]!.schemaVersion !== 1) return stop('INTEGRITY_FAILURE');
              const bytes = decodeBase64url(rows[0]!.payload, 1, 1024);
              try { const value = data(parseStrictJsonBytes(bytes, 1024), ['format', 'version', 'profileId', 'demo', 'liveBindings']);
                if (value.format !== DECOY_FORMAT || value.version !== 1 || value.profileId !== decoyId || value.demo !== true || value.liveBindings !== false) return stop('INTEGRITY_FAILURE');
              } finally { bytes.fill(0); }
              await decoy.refresh(opened.revision, job); job.guard(); if (!decoy.current()) return stop('LOCKED');
              // Retain the native lease for the complete idle decoy lifetime.
              prefs = decoy; decoySession = opened; openingPrefs = undefined; openingSession = undefined; opened = undefined; phase = 'decoy-session';
              return Object.freeze({ mode: 'decoy-session', profileId: decoyId, readOnly: true, demo: true, walletAuthority: false, notificationsHidden: true });
            } finally { if (opened) { if (openingPrefs === decoy) openingPrefs = undefined; decoy.dispose(); } }
          } catch (error) { if (!gate.isClosed) { phase = 'locked-error'; hidden = true; } return stop(codeOf(error)); }
          finally { if (opened) { if (openingSession === opened) openingSession = undefined; try { vault.lock(opened.sessionId); } catch { /* Owned handle is never published. */ } } }
        }, signal);
      },
      cancel() { generation++; gate.cancel(); if (phase === 'switching') { try { vault.lockAll(); } catch { /* Native output still fails the cancelled gate. */ } phase = 'locked-error'; } },
      lockAll() { discard(); try { vault.lockAll(); } catch { /* Local ownership remains revoked. */ } },
      dispose: discard,
    };
    return ok(Object.freeze(facade));
  } catch (error) { prefs?.dispose(); return failed(codeOf(error)); }
}
