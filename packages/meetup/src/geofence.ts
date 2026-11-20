/** MEET13 local claim reducer. No sensor/watch, transport, event emission or settlement interface. */
import { parseTradeBinding, type TradeBinding } from "../../schemas/index.ts";
import { readConsent, type LocationConsent } from "./consent.ts";
import {
  parseClaim,
  assessClaim,
  type LocationClaim,
} from "./location-claim.ts";
import {
  data,
  list,
  integer,
  finite,
  hex,
  result,
  stop,
  type MeetupResult,
} from "./shared.ts";
export interface FenceScope {
  readonly binding: TradeBinding;
  readonly tradeHash: string;
  readonly termsHash: string;
  readonly accountKey: string;
  readonly peerKey: string;
}
export interface FencePlan {
  readonly v: 1;
  readonly planHash: string;
  readonly centerLatE6: number;
  readonly centerLonE6: number;
  readonly enterM: 50;
  readonly exitM: 100;
  readonly dwellMs: 30000;
}
export type FenceState =
  | "outside"
  | "uncertain"
  | "entering"
  | "dwelling"
  | "arrival-prompt"
  | "arrival-confirmed"
  | "leaving"
  | "ended";
export interface FenceObservation {
  readonly state: FenceState;
  readonly provenance: "browser-reported";
  readonly confirmedByUser: boolean;
  readonly generation: number;
  readonly reason: string | null;
  readonly physicalPresenceVerified: false;
  readonly economicAuthority: false;
}
export interface FenceController {
  step(planHash: string, sample: unknown): MeetupResult<FenceObservation>;
  tick(): MeetupResult<FenceObservation>;
  confirmArrival(generation: number): MeetupResult<FenceObservation>;
  confirmDeparture(generation: number): MeetupResult<FenceObservation>;
  inspect(): FenceObservation;
  end(): void;
}
export function parseFencePlan(input: unknown): MeetupResult<FencePlan> {
  return result(() => {
    const p = data(input, [
      "v",
      "planHash",
      "centerLatE6",
      "centerLonE6",
      "enterM",
      "exitM",
      "dwellMs",
    ]);
    if (p.v !== 1 || p.enterM !== 50 || p.exitM !== 100 || p.dwellMs !== 30000)
      return stop("UNSUPPORTED_VERSION");
    return Object.freeze({
      v: 1,
      planHash: hex(p.planHash, 64),
      centerLatE6: integer(p.centerLatE6, -90e6, 90e6),
      centerLonE6: integer(p.centerLonE6, -180e6, 179999999),
      enterM: 50,
      exitM: 100,
      dwellMs: 30000,
    });
  });
}
export function createGeofence(options: {
  readonly plan: unknown;
  readonly scope: FenceScope;
  readonly consent: LocationConsent;
  readonly isCurrent: (scope: FenceScope) => boolean;
  readonly wallNowMs: () => number;
  readonly monotonicNowMs: () => number;
  readonly isUserGesture: () => boolean;
  /** Locally pinned numerical adapter, not sensor authenticity. Borrowed coordinates must not be retained. */ readonly geodesic: Readonly<{
    id: string;
    distanceM: (coordinates: Float64Array) => number;
  }> | null;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}): MeetupResult<FenceController> {
  return result(() => {
    const parsed = parseFencePlan(options.plan);
    if (!parsed.ok) return stop(parsed.error.code);
    const plan = parsed.value;
    const s = data(options.scope, [
        "binding",
        "tradeHash",
        "termsHash",
        "accountKey",
        "peerKey",
      ]),
      scope: FenceScope = Object.freeze({
        binding: parseTradeBinding(s.binding),
        tradeHash: hex(s.tradeHash, 64),
        termsHash: hex(s.termsHash, 64),
        accountKey: hex(s.accountKey, 64),
        peerKey: hex(s.peerKey, 64),
      });
    if (scope.accountKey === scope.peerKey || options.geodesic === null)
      return stop("UNSUPPORTED_RESOLUTION");
    const adapter = data(options.geodesic, ["id", "distanceM"]);
    if (
      typeof adapter.id !== "string" ||
      !/^[A-Za-z0-9._/-]{1,128}$/.test(adapter.id) ||
      typeof adapter.distanceM !== "function"
    )
      return stop("UNSUPPORTED_RESOLUTION");
    const distance = adapter.distanceM as (coordinates: Float64Array) => number,
      consent = options.consent,
      current = options.isCurrent,
      wall = options.wallNowMs,
      mono = options.monotonicNowMs,
      gesture = options.isUserGesture;
    if ([current, wall, mono, gesture].some((f) => typeof f !== "function"))
      return stop();
    const initial = readConsent(consent, "collect");
    if (initial.tradeHash !== scope.tradeHash) return stop("CONSENT_REVOKED");
    const generation = initial.generation;
    let ended = false,
      busy = false,
      state: FenceState = "outside",
      reason: string | null = null,
      confirmed = false,
      lastWall = -1,
      lastMono = -1,
      lastSample = -1,
      entered = -1,
      lastCounted = -1,
      count = 0,
      exitCount = 0,
      lastExit = -1;
    if ((options.setTimer === undefined) !== (options.clearTimer === undefined))
      return stop();
    const setTimer =
        options.setTimer ??
        ((callback: () => void, ms: number) => setTimeout(callback, ms)),
      clearTimer =
        options.clearTimer ??
        ((handle: unknown) =>
          clearTimeout(handle as ReturnType<typeof setTimeout>));
    let timer: unknown;
    const previous = new Float64Array(7);
    let hasPrevious = false;
    const working = new Set<Float64Array>();
    const reset = () => {
      entered = -1;
      lastCounted = -1;
      count = 0;
      exitCount = 0;
      lastExit = -1;
    };
    const end = () => {
      if (ended) return;
      ended = true;
      if (timer !== undefined) {
        try {
          clearTimer(timer);
        } catch {}
        timer = undefined;
      }
      state = "ended";
      reason = "session-ended";
      reset();
      hasPrevious = false;
      previous.fill(0);
      for (const b of working) b.fill(0);
      working.clear();
      initial.signal.removeEventListener("abort", end);
    };
    const view = (): FenceObservation =>
      Object.freeze({
        state,
        provenance: "browser-reported",
        confirmedByUser: confirmed,
        generation,
        reason,
        physicalPresenceVerified: false,
        economicAuthority: false,
      });
    const guard = () => {
      if (ended) return stop("CONSENT_REVOKED");
      let active: ReturnType<typeof readConsent>,
        valid = false;
      try {
        active = readConsent(consent, "collect");
        valid = current(scope) === true;
      } catch {
        end();
        return stop("CONSENT_REVOKED");
      }
      if (
        active.generation !== generation ||
        active.tradeHash !== scope.tradeHash ||
        !valid ||
        ended
      ) {
        end();
        return stop("CONSENT_REVOKED");
      }
    };
    const time = () => {
      const w = integer(wall()),
        m = integer(mono());
      guard();
      if (w < lastWall || m < lastMono) {
        end();
        return stop("CLOCK_ROLLBACK");
      }
      lastWall = w;
      lastMono = m;
      if (lastSample >= 0 && m - lastSample > 30000) {
        end();
        return stop("EXPIRED");
      }
      return { wall: w, mono: m };
    };
    const arm = (now: number) => {
      if (timer !== undefined) {
        try {
          clearTimer(timer);
        } catch {
          end();
          return stop("CONSENT_REVOKED");
        }
        timer = undefined;
      }
      if (ended) return stop("CONSENT_REVOKED");
      let handle: unknown;
      try {
        handle = setTimer(end, Math.max(0, lastSample + 30000 - now));
      } catch {
        end();
        return stop("CONSENT_REVOKED");
      }
      if (ended) {
        try {
          clearTimer(handle);
        } catch {}
        return stop("CONSENT_REVOKED");
      }
      timer = handle;
    };
    const run = <T>(work: () => T): MeetupResult<T> =>
      result(() => {
        if (busy) return stop("CONFLICT");
        busy = true;
        try {
          guard();
          return work();
        } finally {
          busy = false;
        }
      });
    const uncertain = (why: string) => {
      state = "uncertain";
      reason = why;
      reset();
      hasPrevious = false;
      previous.fill(0);
      return view();
    };
    const prior = (): LocationClaim => ({
      v: 1,
      lat: previous[0]!,
      lon: previous[1]!,
      accuracyM: previous[2]!,
      sampledAtMs: previous[3]!,
      receivedMonotonicMs: previous[4]!,
      provenance: previous[5] === 1 ? "browser-reported" : "manual",
      consentGeneration: previous[6]!,
    });
    initial.signal.addEventListener("abort", end, { once: true });
    guard();
    return Object.freeze({
      inspect: () => {
        // During mutation/debug hooks expose only the last local snapshot;
        // do not recurse into the same owner or clock callbacks.
        if (busy) return view();
        busy = true;
        try {
          time();
        } catch {
          end();
        } finally {
          busy = false;
        }
        return view();
      },
      end,
      step: (planHash: string, input: unknown) =>
        run(() => {
          if (hex(planHash, 64) !== plan.planHash) {
            end();
            return stop("STALE_GENERATION");
          }
          const now = time();
          if (lastSample >= 0 && now.mono - lastSample > 30000) {
            end();
            return stop("EXPIRED");
          }
          let sample: LocationClaim;
          try {
            sample = parseClaim(input);
          } catch {
            return uncertain("invalid-sample");
          }
          const assessed = assessClaim(
            sample,
            now.wall,
            now.mono,
            generation,
            hasPrevious ? prior() : undefined,
          );
          guard();
          if (!assessed.ok || assessed.value.status !== "reported")
            return uncertain(
              !assessed.ok
                ? "invalid-sample"
                : (assessed.value.reason ?? "manual-or-inaccurate"),
            );
          const coordinates = new Float64Array([
            plan.centerLatE6 / 1e6,
            plan.centerLonE6 / 1e6,
            sample.lat,
            sample.lon,
          ]);
          working.add(coordinates);
          let d: number;
          try {
            d = finite(distance(coordinates), 0, 50000000);
            guard();
          } catch (error) {
            if (ended) throw error;
            return uncertain("geodesic-unavailable");
          } finally {
            coordinates.fill(0);
            working.delete(coordinates);
          }
          const after = time(),
            fresh = assessClaim(sample, after.wall, after.mono, generation);
          if (!fresh.ok || fresh.value.status !== "reported")
            return uncertain("stale-after-geodesic");
          previous.set([
            sample.lat,
            sample.lon,
            sample.accuracyM,
            sample.sampledAtMs,
            sample.receivedMonotonicMs,
            1,
            generation,
          ]);
          hasPrevious = true;
          lastSample = sample.receivedMonotonicMs;
          arm(after.mono);
          guard();
          const inside = d + sample.accuracyM <= 50,
            outside = d - sample.accuracyM >= 100;
          if (confirmed) {
            if (outside) {
              if (exitCount === 0) {
                exitCount = 1;
                lastExit = sample.receivedMonotonicMs;
              } else if (sample.receivedMonotonicMs - lastExit >= 5000) {
                exitCount = 2;
              }
              state = "leaving";
              reason = exitCount >= 2 ? "departure-prompt" : "exit-dwell";
            } else if (inside) {
              exitCount = 0;
              lastExit = -1;
              state = "arrival-confirmed";
              reason = "arrival-claimed";
            } else return uncertain("boundary-uncertain");
            return view();
          }
          if (inside) {
            exitCount = 0;
            if (entered < 0) {
              entered = sample.receivedMonotonicMs;
              lastCounted = entered;
              count = 1;
              state = "entering";
            } else if (sample.receivedMonotonicMs - lastCounted >= 5000) {
              count++;
              lastCounted = sample.receivedMonotonicMs;
              state = "dwelling";
            }
            if (after.mono - entered >= 30000 && count >= 3)
              state = "arrival-prompt";
            reason = null;
          } else if (outside) {
            state = "outside";
            reason = null;
            reset();
          } else return uncertain("boundary-uncertain");
          return view();
        }),
      tick: () =>
        run(() => {
          const now = time();
          if (lastSample >= 0 && now.mono - lastSample > 30000) {
            end();
            return view();
          }
          return view();
        }),
      confirmArrival: (g: number) =>
        run(() => {
          if (integer(g) !== generation) return stop("STALE_GENERATION");
          time();
          const clicked = gesture() === true;
          time();
          if (
            state !== "arrival-prompt" ||
            lastSample < 0 ||
            lastMono - lastSample > 30000 ||
            !clicked
          )
            return stop("CONSENT_REVOKED");
          guard();
          confirmed = true;
          state = "arrival-confirmed";
          reason = "arrival-claimed";
          return view();
        }),
      confirmDeparture: (g: number) =>
        run(() => {
          if (integer(g) !== generation) return stop("STALE_GENERATION");
          time();
          const clicked = gesture() === true;
          time();
          if (
            state !== "leaving" ||
            exitCount < 2 ||
            lastMono - lastSample > 30000 ||
            !clicked
          )
            return stop("CONSENT_REVOKED");
          guard();
          confirmed = false;
          state = "outside";
          reason = "departure-claimed";
          reset();
          return view();
        }),
    });
  });
}

// MEET12 data and replay diagnostics only. The existing core carrier is text-only;
// no authenticated non-text envelope or peer-message producer is supplied here.
import {
  policyResult,
  policyStop,
  policyText,
  policyBytes,
  policyCopy,
  policyJson,
  assertPolicyCanonical,
  policyCanonical,
  createPolicyOwner,
  createPolicyVault,
  type PolicyResult,
  type PolicyScope,
  type PolicyVaultOptions,
} from "./policy-data.ts";
export interface MeetupClaimEvent {
  readonly v: 1;
  readonly domain: "p2p-offramp/meetup/v1";
  readonly tradeHash: string;
  readonly termsHash: string;
  readonly meetupPlanHash: string;
  readonly sessionId: string;
  readonly sender: string;
  readonly seq: number;
  readonly kind: "arrival-claimed" | "departure-claimed" | "unavailable";
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly eventId: string;
}
function claimEvent(input: unknown): MeetupClaimEvent {
  const r = data(input, [
    "v",
    "domain",
    "tradeHash",
    "termsHash",
    "meetupPlanHash",
    "sessionId",
    "sender",
    "seq",
    "kind",
    "issuedAtMs",
    "expiresAtMs",
    "eventId",
  ]);
  if (r.v !== 1 || r.domain !== "p2p-offramp/meetup/v1")
    return policyStop("UNSUPPORTED_VERSION");
  if (
    !["arrival-claimed", "departure-claimed", "unavailable"].includes(
      r.kind as string,
    )
  )
    return policyStop();
  const issuedAtMs = integer(r.issuedAtMs),
    expiresAtMs = integer(r.expiresAtMs);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > 300000)
    return policyStop();
  return Object.freeze({
    v: 1,
    domain: "p2p-offramp/meetup/v1",
    tradeHash: hex(r.tradeHash, 64),
    termsHash: hex(r.termsHash, 64),
    meetupPlanHash: hex(r.meetupPlanHash, 64),
    sessionId: hex(r.sessionId, 32),
    sender: hex(r.sender, 64),
    seq: integer(r.seq),
    kind: r.kind as MeetupClaimEvent["kind"],
    issuedAtMs,
    expiresAtMs,
    eventId: hex(r.eventId, 32),
  });
}
export const parseMeetupClaimEvent = (
  input: unknown,
): PolicyResult<MeetupClaimEvent> => policyResult(() => claimEvent(input));
export const encodeMeetupClaimEvent = (
  input: unknown,
): PolicyResult<Uint8Array<ArrayBuffer>> =>
  policyResult(() => {
    const bytes = policyBytes(claimEvent(input));
    if (bytes.length > 2048) {
      bytes.fill(0);
      return policyStop("CAPACITY_EXCEEDED");
    }
    return bytes;
  });
export interface MeetupReplayProjection {
  readonly disposition:
    | "unverified-candidate"
    | "duplicate"
    | "stale"
    | "superseded"
    | "expired"
    | "ended";
  readonly authenticated: false;
  readonly physicalPresenceVerified: false;
  readonly economicAuthority: false;
}
export function createMeetupReplayProjection(options: {
  readonly scope: PolicyScope;
  readonly planHash: string;
  readonly sessionId: string;
  readonly isCurrent: (scope: PolicyScope) => boolean;
  readonly nowMs: () => number;
  readonly persistence: PolicyVaultOptions;
}): PolicyResult<{
  record(
    peer: string,
    event: unknown,
  ): Promise<PolicyResult<MeetupReplayProjection>>;
  endSession(): Promise<PolicyResult<MeetupReplayProjection>>;
  close(): void;
}> {
  let cleanup: ReturnType<typeof createPolicyOwner> | undefined;
  const result = policyResult(() => {
    const planHash = hex(options.planHash, 64),
      sessionId = hex(options.sessionId, 32),
      clock = options.nowMs,
      FORMAT = "p2p-offramp/meetup-replay/local/v1";
    if (typeof clock !== "function") return policyStop();
    const owner = createPolicyOwner(options.scope, options.isCurrent);
    cleanup = owner;
    const store = createPolicyVault(owner, options.persistence);
    const expected = { ...owner.scope, planHash, sessionId };
    type Replay = {
      format: typeof FORMAT;
      scope: typeof expected;
      createdAtMs: number;
      lastWallMs: number;
      ended: boolean;
      seq: number | null;
      ids: string[];
    };
    const view = (
      disposition: MeetupReplayProjection["disposition"],
    ): MeetupReplayProjection =>
      Object.freeze({
        disposition,
        authenticated: false,
        physicalPresenceVerified: false,
        economicAuthority: false,
      });
    const load = async () => {
      const row = await store.read();
      owner.guard();
      const now = integer(clock());
      owner.guard();
      if (row.value === null)
        return {
          revision: row.revision,
          now,
          state: {
            format: FORMAT,
            scope: expected,
            createdAtMs: now,
            lastWallMs: now,
            ended: false,
            seq: null,
            ids: [],
          } as Replay,
        };
      const r = data(row.value, [
        "format",
        "scope",
        "createdAtMs",
        "lastWallMs",
        "ended",
        "seq",
        "ids",
      ]);
      if (
        r.format !== FORMAT ||
        policyCanonical(r.scope) !== policyCanonical(expected) ||
        typeof r.ended !== "boolean"
      )
        return policyStop("CONFLICT");
      const ids = list(r.ids, 32).map((v) => hex(v, 32));
      if (new Set(ids).size !== ids.length) return policyStop("CONFLICT");
      const state: Replay = {
        format: FORMAT,
        scope: expected,
        createdAtMs: integer(r.createdAtMs),
        lastWallMs: integer(r.lastWallMs),
        ended: r.ended,
        seq: r.seq === null ? null : integer(r.seq),
        ids,
      };
      if (now < state.lastWallMs || now < state.createdAtMs)
        return policyStop("CLOCK_ROLLBACK");
      return { revision: row.revision, now, state };
    };
    return Object.freeze({
      close: owner.close,
      record: (peer: string, input: unknown) => {
        let assertSession: (() => void) | undefined;
        return owner.run(
          async (signal) => {
            const bytes = owner.own(policyCopy(input, 2048)),
              event = claimEvent(policyJson(bytes, 2048));
            assertPolicyCanonical(bytes, event);
            const loaded = await load(),
              s = loaded.state;
            if (s.ended) return view("ended");
            if (loaded.now - s.createdAtMs >= 86400000) {
              s.ids = [];
              s.ended = true;
              s.lastWallMs = loaded.now;
              await store.write(loaded.revision, s, signal);
              return view("expired");
            }
            if (
              hex(peer, 64) !== owner.scope.peerKey ||
              event.sender !== owner.scope.peerKey ||
              event.tradeHash !== owner.scope.tradeHash ||
              event.termsHash !== owner.scope.termsHash ||
              event.meetupPlanHash !== planHash ||
              event.sessionId !== sessionId
            )
              return view("superseded");
            if (
              event.issuedAtMs - loaded.now > 30000 ||
              event.expiresAtMs <= loaded.now
            )
              return view("expired");
            if (s.ids.includes(event.eventId)) return view("duplicate");
            if (s.seq !== null && event.seq <= s.seq) return view("stale");
            s.seq = event.seq;
            s.ids.push(event.eventId);
            if (s.ids.length > 32) s.ids.shift();
            s.lastWallMs = loaded.now;
            const activeSession = () => {
              const current = integer(clock());
              owner.guard();
              if (current < loaded.now) return policyStop("CLOCK_ROLLBACK");
              if (current - s.createdAtMs >= 86400000)
                return policyStop("EXPIRED");
            };
            assertSession = activeSession;
            await store.write(loaded.revision, s, signal, activeSession);
            activeSession();
            owner.guard();
            const current = integer(clock());
            owner.guard();
            if (current < loaded.now) return policyStop("CLOCK_ROLLBACK");
            if (current >= event.expiresAtMs) return view("expired");
            return view("unverified-candidate");
          },
          () => {
            assertSession?.();
          },
        );
      },
      endSession: () =>
        owner.run(async (signal) => {
          const loaded = await load();
          loaded.state.ids = [];
          loaded.state.ended = true;
          loaded.state.lastWallMs = loaded.now;
          await store.write(loaded.revision, loaded.state, signal);
          return view("ended");
        }),
    });
  });
  if (!result.ok) cleanup?.close();
  return result;
}
