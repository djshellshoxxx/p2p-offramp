/** OFFLINE reference service. Fresh viewing-only capabilities, never wallet seeds or spending secrets. */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { derivePublic, deriveSharedDigest, publicFromDigest, compressedPoint, parseRecipientUri, publicOf } from './math.ts';
import { contextOf, profileOf, sameContext, MAX_ENTROPY_ATTEMPTS, MAX_VIEW_HANDLES, type LocalProfileId, type OfflineContext } from './profiles.ts';
import { address, bareHex, codeOf, data, diagnostic, failure, hexOf, signalAborted, stop, success, type DiagnosticOnly, type StealthResult } from './shared.ts';
import { metadataOf, type Announcement, type DecodedAnnouncement } from './announcer.ts';
import { beginStore, type EncryptedComparisonStore, type StoreLease } from './store.ts';
import { compareOfflinePages, type ComparisonRequest, type ComparisonReport, type OfflinePageSource } from './pages.ts';
export interface ViewingHandle {
  readonly kind: 'offline-stealth-viewing-handle'; readonly purpose: 'view-only'; readonly profileId: LocalProfileId;
  readonly context: OfflineContext; readonly viewingPublicKeyHex: string; close(): void;
}
export interface MatchReport extends DiagnosticOnly { readonly profileId: LocalProfileId; readonly context: OfflineContext; readonly match: boolean; }
export interface OfflineStealthOptions { readonly profileId: LocalProfileId; readonly context: OfflineContext; readonly isCurrent: () => boolean; }
export interface OfflineStealth {
  readonly kind: 'offline-stealth-comparison'; readonly profileId: LocalProfileId; readonly context: OfflineContext;
  createViewingKey(): StealthResult<ViewingHandle>;
  recipientMetaAddress(handle: ViewingHandle, spendingPublicKeyHex: string): StealthResult<Readonly<{ uri: string } & DiagnosticOnly>>;
  generateAnnouncement(recipientUri: string, opaqueSuffixHex?: string): StealthResult<Announcement>;
  matchAnnouncement(handle: ViewingHandle, spendingPublicKeyHex: string, claim: Announcement): StealthResult<MatchReport>;
  comparePages(handle: ViewingHandle, spendingPublicKeyHex: string, request: ComparisonRequest, source: OfflinePageSource, store: EncryptedComparisonStore, signal?: AbortSignal): Promise<StealthResult<ComparisonReport>>;
  close(): void;
}
interface View { readonly secret: Uint8Array<ArrayBuffer>; readonly publicKey: string; closed: boolean; }
interface Job { readonly controller: AbortController; readonly buffers: Set<Uint8Array>; cancelled: boolean; timedOut: boolean; clockReversed: boolean;
  lastWall?: number; lastMono?: number; startWall?: number; startMono?: number; }
const nativeAddListener = EventTarget.prototype.addEventListener, nativeRemoveListener = EventTarget.prototype.removeEventListener;
function claimOf(input: unknown, profileId: LocalProfileId, context: OfflineContext): Announcement {
  const raw = data(input, ['profileId', 'context', 'schemeId', 'stealthAddress', 'ephemeralPublicKeyHex', 'metadataHex', 'diagnosticOnly', 'economicAuthority']);
  if (profileOf(raw.profileId) !== profileId) return stop('PROFILE_MISMATCH');
  if (!sameContext(contextOf(raw.context), context)) return stop('CONTEXT_MISMATCH');
  if (raw.schemeId !== 1) return stop('UNSUPPORTED_SCHEME'); if (raw.diagnosticOnly !== true || raw.economicAuthority !== false) return stop();
  const ephemeralPublicKeyHex = bareHex(raw.ephemeralPublicKeyHex, 33); compressedPoint(ephemeralPublicKeyHex);
  return diagnostic({ profileId, context, schemeId: 1 as const, stealthAddress: address(raw.stealthAddress), ephemeralPublicKeyHex, metadataHex: metadataOf(raw.metadataHex).metadataHex });
}
export function createOfflineStealth(input: OfflineStealthOptions): StealthResult<OfflineStealth> {
  try {
    const raw = data(input, ['profileId', 'context', 'isCurrent']), profileId = profileOf(raw.profileId), context = contextOf(raw.context);
    if (typeof raw.isCurrent !== 'function') return failure('INVALID_INPUT'); const current = raw.isCurrent as () => boolean;
    let closed = false, active: Job | undefined;
    const views = new WeakMap<object, View>(), ownedViews = new Set<View>(), boundStores = new Set<AbortSignal>();
    const wipeJob = (job: Job): void => { for (const bytes of job.buffers) bytes.fill(0); };
    const revoke = (view: View): void => { if (view.closed) return; view.closed = true; view.secret.fill(0); ownedViews.delete(view); };
    const close = (): void => {
      if (closed) return; closed = true;
      for (const view of ownedViews) revoke(view);
      if (active) { wipeJob(active); active.controller.abort(); }
      for (const signal of boundStores) {
        try { Reflect.apply(nativeRemoveListener, signal, ['abort', close]); } catch { /* Each lifetime is retired independently. */ }
      }
      boundStores.clear();
    };
    function admit(): Job {
      if (active) return stop('CONFLICT'); if (closed) return stop('LOCKED');
      const job: Job = { controller: new AbortController(), buffers: new Set(), cancelled: false, timedOut: false, clockReversed: false }; active = job; return job;
    }
    function guard(job: Job, view?: View): void {
      if (closed || active !== job || view?.closed) return stop('LOCKED');
      if (job.timedOut) return stop('TIMEOUT'); if (job.cancelled) return stop('CANCELLED');
      let wall = NaN, mono = NaN; try { wall = Date.now(); mono = performance.now(); } catch { /* Refuse unavailable local clocks. */ }
      if (closed || active !== job || view?.closed) return stop('LOCKED');
      if (!Number.isFinite(wall) || !Number.isFinite(mono) || wall < 0 || mono < 0 || job.lastWall !== undefined && wall < job.lastWall || job.lastMono !== undefined && mono < job.lastMono) {
        job.clockReversed = true; close(); return stop('CLOCK_REVERSED');
      }
      job.lastWall = wall; job.lastMono = mono; job.startWall ??= wall; job.startMono ??= mono;
      if (wall - job.startWall > 30_000 || mono - job.startMono > 30_000) { job.timedOut = true; wipeJob(job); job.controller.abort(); return stop('TIMEOUT'); }
      let live = false; try { live = current() === true; } catch { /* Never expose callback exceptions. */ }
      // This check MUST follow the final owner callback: it may synchronously close this service.
      if (closed || active !== job || view?.closed || !live) { close(); return stop('LOCKED'); }
      if (job.timedOut) return stop('TIMEOUT'); if (job.cancelled || job.controller.signal.aborted) return stop('CANCELLED');
    }
    const release = (job: Job): void => { wipeJob(job); job.buffers.clear(); if (active === job) active = undefined; };
    function sync<T>(work: (job: Job) => T): StealthResult<T> {
      let job: Job | undefined;
      try { job = admit(); guard(job); const value = work(job); guard(job); return success(value); }
      catch (error) { return failure(codeOf(error)); } finally { if (job) release(job); }
    }
    function viewOf(handle: unknown, job: Job): View {
      guard(job); if (typeof handle !== 'object' || handle === null) return stop('INVALID_HANDLE');
      const view = views.get(handle); if (!view) return stop('INVALID_HANDLE'); guard(job, view); return view;
    }
    function spendOf(input: unknown, view: View, job: Job): string {
      const spend = bareHex(input, 33); compressedPoint(spend); guard(job, view);
      if (spend === view.publicKey) return stop('KEY_PURPOSE_CONFLICT'); return spend;
    }
    function entropy(job: Job): Uint8Array<ArrayBuffer> {
      guard(job); let native: Crypto, fill: Crypto['getRandomValues'];
      try { native = globalThis.crypto; fill = native.getRandomValues; } catch { return stop('RNG_UNAVAILABLE'); }
      guard(job); if (typeof fill !== 'function') return stop('RNG_UNAVAILABLE');
      for (let attempt = 0; attempt < MAX_ENTROPY_ATTEMPTS; attempt++) {
        guard(job); const bytes = new Uint8Array(32); job.buffers.add(bytes);
        try { const output = Reflect.apply(fill, native, [bytes]); if (output !== bytes) return stop('RNG_UNAVAILABLE'); }
        catch (error) { if (codeOf(error) === 'RNG_UNAVAILABLE') throw error; return stop('RNG_UNAVAILABLE'); }
        guard(job); if (secp256k1.utils.isValidSecretKey(bytes)) return bytes;
        bytes.fill(0); job.buffers.delete(bytes);
      }
      return stop('ENTROPY_EXHAUSTED');
    }
    function match(job: Job, view: View, spend: string, claim: Announcement | DecodedAnnouncement): boolean {
      guard(job, view);
      const derived = deriveSharedDigest(profileId, view.secret, claim.ephemeralPublicKeyHex, bytes => { job.buffers.add(bytes); });
      try {
        guard(job, view); if (claim.metadataHex.slice(0, 2) !== hexOf(derived.digest.subarray(0, 1))) return false;
        const expected = publicFromDigest(spend, derived.digest); guard(job, view); return claim.stealthAddress === expected.address;
      }
      finally { derived.preimage.fill(0); derived.digest.fill(0); job.buffers.delete(derived.preimage); job.buffers.delete(derived.digest); }
    }
    const facade: OfflineStealth = {
      kind: 'offline-stealth-comparison', profileId, context, close,
      createViewingKey() {
        return sync(job => {
          guard(job); if (ownedViews.size >= MAX_VIEW_HANDLES) return stop('CAPACITY_EXCEEDED');
          const secret = entropy(job), publicKey = publicOf(secret); guard(job);
          if (ownedViews.size >= MAX_VIEW_HANDLES) return stop('CAPACITY_EXCEEDED');
          const view: View = { secret, publicKey, closed: false }; ownedViews.add(view);
          const handle: ViewingHandle = Object.freeze({ kind: 'offline-stealth-viewing-handle', purpose: 'view-only', profileId, context,
            viewingPublicKeyHex: publicKey, close() { revoke(view); if (active) { wipeJob(active); active.controller.abort(); } } });
          views.set(handle, view); guard(job, view);
          // Transfer only to the private live handle after all callbacks. Public output contains no scalar.
          job.buffers.delete(secret); return handle;
        });
      },
      recipientMetaAddress(handle, spendingPublicKeyHex) {
        return sync(job => { const view = viewOf(handle, job), spend = spendOf(spendingPublicKeyHex, view, job); guard(job, view);
          return diagnostic({ uri: 'st:eth:0x' + spend + view.publicKey }); });
      },
      generateAnnouncement(recipientUri, opaqueSuffixHex = '') {
        return sync(job => {
          const recipient = parseRecipientUri(recipientUri), suffix = bareHex(opaqueSuffixHex, 0, 255); guard(job);
          const ephemeral = entropy(job), ephemeralPublicKeyHex = publicOf(ephemeral); guard(job);
          const derived = derivePublic(profileId, ephemeral, recipient.viewingPublicKeyHex, recipient.spendingPublicKeyHex, bytes => { job.buffers.add(bytes); });
          guard(job);
          return diagnostic({ profileId, context, schemeId: 1 as const, stealthAddress: derived.address, ephemeralPublicKeyHex, metadataHex: derived.viewTagHex + suffix });
        });
      },
      matchAnnouncement(handle, spendingPublicKeyHex, inputClaim) {
        return sync(job => { const view = viewOf(handle, job), spend = spendOf(spendingPublicKeyHex, view, job), claim = claimOf(inputClaim, profileId, context); guard(job, view);
          return diagnostic({ profileId, context, match: match(job, view, spend, claim) }); });
      },
      async comparePages(handle, spendingPublicKeyHex, request, source, encryptedStore, signal) {
        let job: Job | undefined, lease: StoreLease | undefined, timer: ReturnType<typeof setTimeout> | undefined;
        let cancel: (() => void) | undefined, logicalAbort: (() => void) | undefined;
        let drain: Promise<StealthResult<ComparisonReport>> | undefined;
        const cleanup = (): void => {
          if (timer !== undefined) clearTimeout(timer); if (signal && cancel) Reflect.apply(nativeRemoveListener, signal, ['abort', cancel]);
          if (job && logicalAbort) Reflect.apply(nativeRemoveListener, job.controller.signal, ['abort', logicalAbort]);
          lease?.release(); if (job) release(job);
        };
        try {
          job = admit(); guard(job); const physical = job, view = viewOf(handle, physical), spend = spendOf(spendingPublicKeyHex, view, physical);
          if (signalAborted(signal)) return failure('CANCELLED');
          cancel = () => { physical.cancelled = true; wipeJob(physical); physical.controller.abort(); };
          if (signal) Reflect.apply(nativeAddListener, signal, ['abort', cancel, { once: true }]); guard(physical, view);
          // beginStore reserves its slot before session/owner callbacks; close synchronously wipes this service's view keys.
          lease = beginStore(encryptedStore, { profileId, context, viewingPublicKeyHex: view.publicKey, spendingPublicKeyHex: spend }, close);
          // A completed job releases physical admission, not its vault lifetime.
          // Retain one bounded, deduplicated edge until this service closes.
          if (!boundStores.has(lease.signal)) {
            if (boundStores.size >= MAX_VIEW_HANDLES) return failure('CAPACITY_EXCEEDED');
            boundStores.add(lease.signal);
            Reflect.apply(nativeAddListener, lease.signal, ['abort', close, { once: true }]);
          }
          if (signalAborted(lease.signal)) close();
          const guardAll = (): void => { guard(physical, view); lease!.guard(); guard(physical, view); };
          guardAll(); timer = setTimeout(() => { physical.timedOut = true; wipeJob(physical); physical.controller.abort(); }, 30_000);
          const retired = new Promise<StealthResult<ComparisonReport>>(resolve => {
            logicalAbort = () => resolve(failure(physical.clockReversed ? 'CLOCK_REVERSED' : physical.timedOut ? 'TIMEOUT' : closed || view.closed ? 'LOCKED' : 'CANCELLED'));
            Reflect.apply(nativeAddListener, physical.controller.signal, ['abort', logicalAbort, { once: true }]);
            if (physical.controller.signal.aborted) logicalAbort();
          });
          // Cancellation releases the logical caller promptly; neither the service slot nor vault-store slot
          // is released until the actual ignored source/storage promise drains.
          drain = compareOfflinePages({ input: request, profileId, context, source, store: lease, signal: physical.controller.signal,
            guard: guardAll, matches: claim => match(physical, view, spend, claim) })
            .then(value => { guardAll(); return success(value); })
            .catch(error => failure<ComparisonReport>(codeOf(error)))
            .finally(cleanup);
          return await Promise.race([drain, retired]);
        } catch (error) { return failure(codeOf(error)); }
        finally { if (!drain) cleanup(); }
      },
    };
    return success(Object.freeze(facade));
  } catch (error) { return failure(codeOf(error)); }
}
