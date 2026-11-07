/** Compiled LOCAL fixture ports only. No production origin binding or sensor/gesture qualification. */
import { EncryptedVaultService } from '../../../storage/src/vault-service.ts';
import { IndexedDbVaultStore } from '../../../storage/src/idb-vault-store.ts';
import { createDisclosureBudget, createLocationConsentController, BUDGET_LOCK_NAME,
  type DisclosureBudget, type LocationConsent, type LocationConsentController, type OriginBudgetCoordinator,
  type ExclusiveBudgetLock, type MeetupResult } from '../../index.ts';
const PASS = 'T69 public native origin-ledger fixture passphrase';
const BASE_WALL_MS = 1_700_000_000_000;
export function value<T>(result: MeetupResult<T>): T { if (!result.ok) throw Error('FIXTURE_' + result.error.code); return result.value; }
function nativeValue<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T { if (!result.ok) throw Error('FIXTURE_' + result.error.code); return result.value; }
export const digest = (n: number): string => n.toString(16).padStart(64, '0');
export async function createOriginLedgerFixture(existingProfileId: string | null = null) {
  if (!navigator.locks || typeof navigator.locks.request !== 'function' || typeof navigator.locks.query !== 'function') throw Error('FIXTURE_WEB_LOCKS_UNAVAILABLE');
  if (existingProfileId !== null && !/^[0-9a-f]{32}$/.test(existingProfileId)) throw Error('FIXTURE_PROFILE');
  const store = new IndexedDbVaultStore(), vault = new EncryptedVaultService(store), budgets = new Set<DisclosureBudget>(), consents = new Set<LocationConsentController>();
  let ownerCurrent = true, fresh = existingProfileId === null, offsetMs = 0, nativeLockCallbacks = 0;
  let session = nativeValue(fresh ? await vault.create(PASS) : await vault.unlock(existingProfileId!, PASS));
  const ledgerProfileId = session.profileId;
  const wallNowMs = (): number => BASE_WALL_MS + offsetMs;
  const monotonicNowMs = (): number => Math.floor(performance.now()) + offsetMs;
  const coordinator: OriginBudgetCoordinator = Object.freeze({
    isLedgerProfile: (id: string): boolean => ownerCurrent && id === ledgerProfileId,
    mayProvisionFresh: (id: string): boolean => fresh && id === ledgerProfileId,
    async withExclusive<T>(name: typeof BUDGET_LOCK_NAME, signal: AbortSignal, work: (lock: ExclusiveBudgetLock) => Promise<T>): Promise<T> {
      if (name !== BUDGET_LOCK_NAME) throw Error('FIXTURE_LOCK_NAME');
      return navigator.locks.request(name, { mode: 'exclusive', signal }, async native => {
        if (!native || native.name !== BUDGET_LOCK_NAME || native.mode !== 'exclusive') throw Error('FIXTURE_NATIVE_LOCK');
        let held = true; nativeLockCallbacks++;
        try {
          const actual = await navigator.locks.query();
          if (actual.held?.filter(lock => lock.name === BUDGET_LOCK_NAME).length !== 1) throw Error('FIXTURE_EXCLUSIVITY');
          return await work(Object.freeze({ isCurrent: () => held && ownerCurrent }));
        } finally { held = false; }
      });
    },
  });
  function makeBudget(): DisclosureBudget {
    const budget = value(createDisclosureBudget({ vault, session, coordinator, isOwnerCurrent: () => ownerCurrent,
      isUserGesture: () => true, wallNowMs, monotonicNowMs })); budgets.add(budget); return budget;
  }
  let budget = makeBudget();
  function consent(trade = 100): LocationConsent {
    // These are explicitly compiled synthetic consent/foreground ports. No browser
    // geolocation permission is requested and no physical user evidence is inferred.
    const controller = value(createLocationConsentController({ isUserGesture: () => true, isForeground: () => true,
      isOwnerCurrent: () => ownerCurrent, wallNowMs, monotonicNowMs })); consents.add(controller);
    return value(controller.grant(value(controller.explain({ tradeHash: digest(trade), recipientKey: digest(500 + trade), radiusM: 500,
      collect: false, shareCoarse: true, mapFetch: false, directNetwork: false }))));
  }
  function closeOwned(): void { for (const b of budgets) b.close(); budgets.clear(); for (const c of consents) c.dispose(); consents.clear(); }
  return Object.freeze({
    vault, store, coordinator, ledgerProfileId, makeBudget, consent, digest,
    get session() { return session; }, get budget() { return budget; }, get nativeLockCallbacks() { return nativeLockCallbacks; },
    claim(cap: LocationConsent) { return { v: 1 as const, lat: 42.6, lon: -5.6, accuracyM: 10, sampledAtMs: wallNowMs(), receivedMonotonicMs: monotonicNowMs(), provenance: 'manual' as const, consentGeneration: cap.generation }; },
    setOffset(ms: number) { if (!Number.isSafeInteger(ms) || ms < 0 || ms > 3 * 86_400_000) throw Error('FIXTURE_CLOCK'); offsetMs = ms; },
    async reopen() { closeOwned(); vault.lockAll(); fresh = false; session = nativeValue(await vault.unlock(ledgerProfileId, PASS)); budget = makeBudget(); },
    close() { if (!ownerCurrent) return; ownerCurrent = false; closeOwned(); vault.dispose(); store.close(); },
  });
}
