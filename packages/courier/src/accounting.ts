/** Checked local accounting projections, never custody, solvency, payment or slashing authority. */
import { parseCourierRecord, type CourierProfile } from "./records.ts";
import {
  evidenceOf,
  type CourierVerifier,
  type CourierEvidence,
} from "./verification.ts";
import {
  result,
  stop,
  hex,
  text,
  integer,
  uint,
  add,
  subtract,
  increment,
  local,
  type CourierResult,
} from "./shared.ts";
const LIMIT = 128;
function parsed(
  kind: "fee-schedule" | "reservation" | "deduction" | "stake",
  input: unknown,
  p: CourierProfile,
) {
  const r = parseCourierRecord(kind, input, p);
  if (!r.ok) return stop(r.code);
  return r.value;
}
export interface FeeProjection {
  readonly revision: number;
  readonly total: string;
  readonly earned: string;
  readonly refunded: string;
  readonly pending: string;
  readonly basis: "cooperative" | "timeoutRefund" | null;
  readonly localModelOnly: true;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface FeeModel {
  inspect(): CourierResult<FeeProjection>;
  allocate(
    expectedRevision: number,
    policyHash: string,
    evidence: CourierEvidence,
  ): CourierResult<FeeProjection>;
  timeout(expectedRevision: number): CourierResult<FeeProjection>;
}
export function createFeeModel(options: {
  readonly verifier: CourierVerifier;
  readonly schedule: CourierEvidence;
  readonly courier: string;
  readonly resolveBy: number;
  readonly nowSeconds: () => number;
  readonly isPickedUp: () => boolean;
}): CourierResult<FeeModel> {
  return result(() => {
    const { verifier } = options,
      proof = evidenceOf(options.schedule, verifier, "fee-schedule"),
      schedule = proof.body;
    const courier = text(verifier.profile.parseKey(options.courier), 512),
      payer = schedule.payer as string;
    if (!proof.signers.includes(payer) || !proof.signers.includes(courier))
      return stop("UNAUTHORIZED");
    const total = uint(schedule.total),
      cancel = uint(schedule.cancellationFee),
      pickup = uint(schedule.pickupFee),
      delivery = uint(schedule.deliveryFee);
    if (cancel > total || add(pickup, delivery) > total) return stop();
    const resolveBy = integer(options.resolveBy);
    if (
      typeof options.nowSeconds !== "function" ||
      typeof options.isPickedUp !== "function"
    )
      return stop();
    const clock = options.nowSeconds,
      pickedUp = options.isPickedUp,
      ids = new Set<string>();
    let revision = 0,
      earned = 0n,
      refunded = 0n,
      pending = total,
      basis: FeeProjection["basis"] = null,
      busy = false;
    const view = () =>
      local({
        revision,
        total: total.toString(),
        earned: earned.toString(),
        refunded: refunded.toString(),
        pending: pending.toString(),
        basis,
      });
    const run = <T>(work: () => T) =>
      result(() => {
        if (busy) return stop("CONFLICT");
        busy = true;
        try {
          proof.current();
          return work();
        } finally {
          busy = false;
        }
      });
    const expectRevision = (value: number) => {
      if (integer(value) !== revision) return stop("STALE_REVISION");
    };
    return Object.freeze({
      inspect: () => run(view),
      allocate: (
        expectedRevision: number,
        policyHash: string,
        evidence: CourierEvidence,
      ) =>
        run(() => {
          expectRevision(expectedRevision);
          if (hex(policyHash) !== schedule.policyHash)
            return stop("UNAUTHORIZED");
          const allocation = evidenceOf(evidence, verifier, "fee-allocation");
          if (
            !allocation.signers.includes(payer) ||
            !allocation.signers.includes(courier)
          )
            return stop("UNAUTHORIZED");
          const a = allocation.body,
            id = hex(a.allocationId);
          if (ids.has(id)) return stop("CONFLICT");
          if (ids.size >= LIMIT) return stop("LIMIT_EXCEEDED");
          if (a.basis !== "cooperative") return stop("UNAUTHORIZED");
          const nextEarned = uint(a.earned),
            nextRefunded = uint(a.refunded),
            nextPending = uint(a.pending);
          if (
            add(add(nextEarned, nextRefunded), nextPending) !== total ||
            nextEarned < earned ||
            nextRefunded < refunded ||
            nextPending > pending
          )
            return stop("CONFLICT");
          const picked = pickedUp();
          if (picked !== true && picked !== false) return stop();
          proof.current();
          if (!picked && nextEarned > cancel) return stop("UNAUTHORIZED");
          revision = increment(revision);
          ids.add(id);
          earned = nextEarned;
          refunded = nextRefunded;
          pending = nextPending;
          basis = "cooperative";
          return view();
        }),
      timeout: (expectedRevision: number) =>
        run(() => {
          expectRevision(expectedRevision);
          const now = integer(clock());
          proof.current();
          if (now < resolveBy) return stop("EXPIRED");
          if (pending === 0n) return stop("CONFLICT");
          revision = increment(revision);
          refunded = add(refunded, pending);
          pending = 0n;
          basis = "timeoutRefund";
          return view();
        }),
    });
  });
}
export interface StakeProjection {
  readonly revision: number;
  readonly deposited: string;
  readonly reserved: string;
  readonly unbonding: string;
  readonly withdrawable: string;
  readonly activeReservations: number;
  readonly localModelOnly: true;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface StakeModel {
  inspect(): CourierResult<StakeProjection>;
  reserve(
    expectedRevision: number,
    reservation: unknown,
  ): CourierResult<StakeProjection>;
  release(
    expectedRevision: number,
    reservationId: string,
    nowSeconds: number,
  ): CourierResult<StakeProjection>;
  beginUnbond(
    expectedRevision: number,
    amount: string,
  ): CourierResult<StakeProjection>;
}
/** Caller-supplied balances are a local model input, never evidence of an actual available vault balance. */
export function createStakeModel(
  input: unknown,
  profile: CourierProfile,
): CourierResult<StakeModel> {
  return result(() => {
    const p = parsed("stake", input, profile);
    let revision = 0,
      reserved = uint(p.reserved),
      unbonding = uint(p.unbonding),
      withdrawable = uint(p.withdrawable);
    const deposited = uint(p.deposited);
    if (add(add(reserved, unbonding), withdrawable) !== deposited)
      return stop("CONFLICT");
    // Existing active reservations require exact records; do not fabricate them from a sum.
    if (reserved !== 0n) return stop("MISSING_DEPENDENCY");
    const records = new Map<
      string,
      Readonly<{ amount: bigint; resolveBy: number; active: boolean }>
    >();
    const view = () =>
      local({
        revision,
        deposited: deposited.toString(),
        reserved: reserved.toString(),
        unbonding: unbonding.toString(),
        withdrawable: withdrawable.toString(),
        activeReservations: [...records.values()].filter((r) => r.active)
          .length,
      });
    const expectRevision = (value: number) => {
      if (integer(value) !== revision) return stop("STALE_REVISION");
    };
    let busy = false;
    const run = <T>(work: () => T) =>
      result(() => {
        if (busy) return stop("CONFLICT");
        busy = true;
        try {
          return work();
        } finally {
          busy = false;
        }
      });
    return Object.freeze({
      inspect: () => run(view),
      reserve: (expectedRevision: number, input: unknown) =>
        run(() => {
          expectRevision(expectedRevision);
          const r = parsed("reservation", input, profile),
            id = hex(r.reservationId),
            amount = uint(r.amount);
          expectRevision(expectedRevision);
          if (r.state !== "active" || amount === 0n) return stop();
          if (records.has(id)) return stop("CONFLICT");
          if (
            records.size >= LIMIT ||
            [...records.values()].filter((r) => r.active).length >= 64
          )
            return stop("LIMIT_EXCEEDED");
          const next = subtract(withdrawable, amount),
            nextReserved = add(reserved, amount);
          revision = increment(revision);
          withdrawable = next;
          reserved = nextReserved;
          records.set(
            id,
            Object.freeze({
              amount,
              resolveBy: integer(r.resolveBy),
              active: true,
            }),
          );
          return view();
        }),
      release: (
        expectedRevision: number,
        reservationId: string,
        nowSeconds: number,
      ) =>
        run(() => {
          expectRevision(expectedRevision);
          const id = hex(reservationId),
            r = records.get(id);
          if (!r || !r.active) return stop("CONFLICT");
          if (integer(nowSeconds) < r.resolveBy) return stop("EXPIRED");
          const next = add(withdrawable, r.amount);
          revision = increment(revision);
          reserved = subtract(reserved, r.amount);
          withdrawable = next;
          records.set(id, Object.freeze({ ...r, active: false }));
          return view();
        }),
      beginUnbond: (expectedRevision: number, amount: string) =>
        run(() => {
          expectRevision(expectedRevision);
          const value = uint(amount);
          if (value === 0n) return stop();
          const next = subtract(withdrawable, value),
            nextUnbonding = add(unbonding, value);
          revision = increment(revision);
          withdrawable = next;
          unbonding = nextUnbonding;
          return view();
        }),
    });
  });
}
/** Cooperative-only deduction eligibility arithmetic. Native execution/finality is intentionally absent. */
export function projectCooperativeDeduction(options: {
  readonly verifier: CourierVerifier;
  readonly decision: CourierEvidence;
  readonly courier: string;
  readonly payer: string;
  readonly reservation: unknown;
  readonly beneficiary: string;
  readonly nowSeconds: number;
}): CourierResult<
  Readonly<{
    remaining: string;
    deducted: string;
    nativeExecutionAllowed: false;
    localModelOnly: true;
    physicalContentsVerified: false;
    economicAuthority: false;
  }>
> {
  return result(() => {
    const p = evidenceOf(options.decision, options.verifier, "deduction"),
      r = parsed("reservation", options.reservation, options.verifier.profile),
      d = p.body;
    const courier = text(
        options.verifier.profile.parseKey(options.courier),
        512,
      ),
      payer = text(options.verifier.profile.parseKey(options.payer), 512);
    if (
      d.basis !== "cooperative" ||
      !p.signers.includes(courier) ||
      !p.signers.includes(payer) ||
      d.reservationId !== r.reservationId ||
      d.policyHash !== r.policyHash ||
      d.beneficiary !== text(options.beneficiary)
    )
      return stop("UNAUTHORIZED");
    const issued = integer(d.issuedAt),
      appeal = integer(d.appealUntil),
      final = integer(d.finalAfter),
      now = integer(options.nowSeconds);
    if (
      issued > appeal ||
      appeal > final ||
      now < final ||
      now >= integer(r.resolveBy) ||
      r.state !== "active"
    )
      return stop("EXPIRED");
    const amount = uint(d.amount),
      remaining = subtract(uint(r.amount), amount);
    return local({
      remaining: remaining.toString(),
      deducted: amount.toString(),
      nativeExecutionAllowed: false as const,
    });
  });
}
