/** Conservative device/door claims. There is no adapter, unlock executor or approved hardware profile. */
import { parseCourierRecord, type CourierProfile } from "./records.ts";
import {
  evidenceOf,
  assertVerifierCurrent,
  type CourierVerifier,
  type CourierEvidence,
} from "./verification.ts";
import {
  result,
  stop,
  hex,
  text,
  integer,
  increment,
  local,
  type CourierResult,
} from "./shared.ts";
export function evaluateAccessWindow(options: {
  readonly verifier: CourierVerifier;
  readonly window: CourierEvidence;
  readonly reservationId: string;
  readonly subject: string;
  readonly interval: Readonly<{ lower: number; upper: number; error: number }>;
  readonly revocationEpoch: number | null;
  readonly replayStorageAvailable: boolean;
}) {
  return result(() => {
    const p = evidenceOf(options.window, options.verifier, "window"),
      w = p.body;
    if (
      !p.signers.includes(w.issuer as string) ||
      w.reservationId !== text(options.reservationId) ||
      w.subject !==
        text(options.verifier.profile.parseKey(options.subject), 512)
    )
      return stop("UNAUTHORIZED");
    const lower = integer(options.interval.lower),
      upper = integer(options.interval.upper),
      error = integer(options.interval.error);
    if (upper < lower) return stop();
    let decision:
      | "valid"
      | "too-early"
      | "expired"
      | "clock-uncertain"
      | "revocation-unavailable" = "valid";
    if (
      !options.replayStorageAvailable ||
      options.revocationEpoch === null ||
      integer(options.revocationEpoch) !== w.revocationEpoch
    )
      decision = "revocation-unavailable";
    else if (error > Number(w.maxClockError) || error > 30)
      decision = "clock-uncertain";
    else if (lower < Number(w.notBefore)) decision = "too-early";
    else if (upper >= Number(w.expiresAt)) decision = "expired";
    return local({
      decision,
      nativeUnlockAllowed: false as const,
      oneUsePersistenceVerified: false as const,
    });
  });
}
export interface LockerView {
  readonly revision: number;
  readonly phase:
    | "idle"
    | "prepared"
    | "unknown"
    | "quarantined"
    | "manualRecovery";
  readonly commandId: string | null;
  readonly lastStatus: string | null;
  readonly counter: number;
  readonly statusReads: number;
  readonly physicalCustodyResolved: false;
  readonly localModelOnly: true;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface LockerModel {
  inspect(): CourierResult<LockerView>;
  prepare(
    expectedRevision: number,
    command: unknown,
  ): CourierResult<LockerView>;
  markSendStarted(expectedRevision: number): CourierResult<LockerView>;
  requestStatusRead(expectedRevision: number): CourierResult<LockerView>;
  observe(
    expectedRevision: number,
    evidence: CourierEvidence,
  ): CourierResult<LockerView>;
  tick(expectedRevision: number): CourierResult<LockerView>;
}
export function createLockerModel(options: {
  readonly verifier: CourierVerifier;
  readonly profileId: string | null;
  readonly lockerId: string;
  readonly reservationId: string;
  readonly deviceKey: string;
  readonly initialCounter: number;
  readonly nowSeconds: () => number;
}): CourierResult<LockerModel> {
  return result(() => {
    if (options.profileId === null) return stop("UNSUPPORTED_PROFILE");
    const verifier = options.verifier;
    assertVerifierCurrent(verifier);
    const profileId = text(options.profileId),
      lockerId = text(options.lockerId),
      reservationId = text(options.reservationId),
      deviceKey = text(verifier.profile.parseKey(options.deviceKey), 512),
      clock = options.nowSeconds;
    if (typeof clock !== "function") return stop();
    let revision = 0,
      counter = integer(options.initialCounter),
      status: string | null = null,
      phase: LockerView["phase"] = "idle",
      commandId: string | null = null,
      commandExpiresAt = 0,
      reads = 0,
      started = 0,
      lastNow = -1;
    const view = () =>
      local({
        revision,
        phase,
        commandId,
        lastStatus: status,
        counter,
        statusReads: reads,
        physicalCustodyResolved: false as const,
      });
    let busy = false;
    const run = <T>(work: () => T) =>
      result(() => {
        if (busy) return stop("CONFLICT");
        busy = true;
        try {
          assertVerifierCurrent(verifier);
          return work();
        } finally {
          busy = false;
        }
      });
    const expect = (n: number) => {
      if (integer(n) !== revision) return stop("STALE_REVISION");
    };
    const now = () => {
      const at = integer(clock());
      assertVerifierCurrent(verifier);
      if (at < lastNow) return stop("CLOCK_UNCERTAIN");
      lastNow = at;
      return at;
    };
    return Object.freeze({
      inspect: () => run(view),
      prepare: (expectedRevision: number, input: unknown) =>
        run(() => {
          expect(expectedRevision);
          if (phase !== "idle") return stop("UNKNOWN_OUTCOME");
          const parsed = parseCourierRecord(
            "locker-command",
            input,
            verifier.profile,
          );
          if (!parsed.ok) return stop(parsed.code);
          const c = parsed.value;
          if (
            c.shipmentId !== verifier.context.shipmentId ||
            c.profileId !== profileId ||
            c.lockerId !== lockerId ||
            c.reservationId !== reservationId ||
            c.expectedCounter !== counter
          )
            return stop("UNAUTHORIZED");
          if (now() >= Number(c.expiresAt)) return stop("EXPIRED");
          commandId = hex(c.commandId);
          commandExpiresAt = Number(c.expiresAt);
          phase = "prepared";
          revision = increment(revision);
          return view();
        }),
      markSendStarted: (expectedRevision: number) =>
        run(() => {
          expect(expectedRevision);
          if (phase !== "prepared") return stop("CONFLICT");
          const at = now();
          if (at >= commandExpiresAt) return stop("EXPIRED");
          started = at;
          phase = "unknown";
          revision = increment(revision);
          return view();
        }),
      requestStatusRead: (expectedRevision: number) =>
        run(() => {
          expect(expectedRevision);
          if (phase !== "unknown") return stop("CONFLICT");
          const at = now();
          if (reads >= 3 || at - started >= 60) {
            phase = "manualRecovery";
            revision = increment(revision);
            return view();
          }
          reads++;
          revision = increment(revision);
          return view();
        }),
      observe: (expectedRevision: number, evidence: CourierEvidence) =>
        run(() => {
          expect(expectedRevision);
          if (!["unknown", "quarantined", "manualRecovery"].includes(phase))
            return stop("CONFLICT");
          const p = evidenceOf(evidence, verifier, "locker-observation"),
            o = p.body;
          if (
            !p.signers.includes(deviceKey) ||
            o.authenticated !== true ||
            o.commandId !== commandId
          )
            return stop("UNAUTHORIZED");
          const next = integer(o.counter),
            nextStatus = o.status as string;
          now();
          if (
            next < counter ||
            (next === counter && status !== null && status !== nextStatus) ||
            nextStatus === "jammed"
          )
            phase = "quarantined";
          // A signed door status has no specified per-device command-result meaning. It cannot clear uncertainty.
          if (next >= counter) counter = next;
          status = nextStatus;
          revision = increment(revision);
          return view();
        }),
      tick: (expectedRevision: number) =>
        run(() => {
          expect(expectedRevision);
          if (phase === "unknown" && now() - started >= 60)
            phase = "manualRecovery";
          revision = increment(revision);
          return view();
        }),
    });
  });
}
export interface InspectionView {
  readonly inspections: readonly string[];
  readonly sealChanged: boolean;
  readonly damageEverClaimed: boolean;
  readonly inspectionRequired: boolean;
  readonly localModelOnly: true;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export function createInspectionModel(options: {
  readonly verifier: CourierVerifier;
  readonly containerId: string;
  readonly legId: string;
  readonly supportedDeviceProfiles?: readonly string[];
}): CourierResult<{
  record(evidence: CourierEvidence): CourierResult<InspectionView>;
  inspect(): CourierResult<InspectionView>;
}> {
  return result(() => {
    const verifier = options.verifier;
    assertVerifierCurrent(verifier);
    const containerId = hex(options.containerId),
      legId = hex(options.legId),
      profiles = Object.freeze(
        [...(options.supportedDeviceProfiles ?? [])].map((x) => text(x)),
      );
    if (profiles.length > 16) return stop("LIMIT_EXCEEDED");
    const history = new Set<string>();
    let seal: string | null = null,
      changed = false,
      damage = false;
    const view = () =>
      local({
        inspections: Object.freeze([...history]),
        sealChanged: changed,
        damageEverClaimed: damage,
        inspectionRequired: changed || damage,
      });
    let busy = false;
    const run = <T>(work: () => T) =>
      result(() => {
        if (busy) return stop("CONFLICT");
        busy = true;
        try {
          assertVerifierCurrent(verifier);
          return work();
        } finally {
          busy = false;
        }
      });
    return Object.freeze({
      inspect: () => run(view),
      record: (evidence: CourierEvidence) =>
        run(() => {
          const p = evidenceOf(evidence, verifier, "inspection"),
            i = p.body;
          if (
            i.containerId !== containerId ||
            i.legId !== legId ||
            !p.signers.includes(i.observer as string)
          )
            return stop("UNAUTHORIZED");
          if (
            i.source === "reviewedDevice" &&
            !profiles.includes(i.deviceProfile as string)
          )
            return stop("UNSUPPORTED_PROFILE");
          if (history.has(p.hash)) return stop("CONFLICT");
          if (history.size >= 128) return stop("LIMIT_EXCEEDED");
          if (
            i.priorInspection !== null &&
            !history.has(i.priorInspection as string)
          )
            return stop("MISSING_DEPENDENCY");
          if (seal !== null && seal !== i.sealId) changed = true;
          if (i.condition !== "intactClaimed") damage = true;
          seal = i.sealId as string;
          history.add(p.hash);
          return view();
        }),
    });
  });
}
