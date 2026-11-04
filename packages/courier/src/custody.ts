/** Revisioned local asserted-custody models. No network acknowledgment, durable journal or physical proof. */
import { parseCourierRecord, type CourierRecord } from "./records.ts";
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
  canonical,
  local,
  unique,
  list,
  type CourierResult,
} from "./shared.ts";
export interface CustodyView {
  readonly revision: number;
  readonly generation: number;
  readonly state: string;
  readonly receiptHead: string | null;
  readonly receiptCandidates: readonly string[];
  readonly candidateCustodians: readonly string[];
  readonly lateDeliveryClaim: boolean;
  readonly recoveryRequired: boolean;
  readonly localModelOnly: true;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface CustodyModel {
  inspect(): CourierResult<CustodyView>;
  accept(
    expectedRevision: number,
    agreement: CourierEvidence,
  ): CourierResult<CustodyView>;
  beginPickup(
    expectedRevision: number,
    capability: CourierEvidence,
  ): CourierResult<CustodyView>;
  recordReceipt(
    expectedRevision: number,
    receipt: CourierEvidence,
    challenge: CourierEvidence,
  ): CourierResult<CustodyView>;
  cancel(expectedRevision: number): CourierResult<CustodyView>;
  revokeCapabilities(expectedRevision: number): CourierResult<CustodyView>;
  tick(expectedRevision: number): CourierResult<CustodyView>;
  close(): void;
}
export function createCustodyModel(options: {
  readonly verifier: CourierVerifier;
  readonly proposal: unknown;
  readonly legId: string;
  readonly containerCommitment: string;
  readonly generation: number;
  readonly knownCustodians: readonly string[];
  readonly nowSeconds: () => number;
  readonly actor: () => string;
}): CourierResult<CustodyModel> {
  return result(() => {
    const { verifier } = options,
      parsed = parseCourierRecord(
        "handshake",
        options.proposal,
        verifier.profile,
      );
    if (!parsed.ok) return stop(parsed.code);
    const proposal = parsed.value;
    if (
      proposal.state !== "proposed" ||
      proposal.receiptHead !== null ||
      proposal.shipmentId !== verifier.context.shipmentId ||
      proposal.termsHash !== verifier.context.termsHash
    )
      return stop();
    const legId = hex(options.legId),
      container = hex(options.containerCommitment),
      seller = proposal.seller as string,
      buyer = proposal.buyer as string,
      courier = proposal.courier as string;
    const known = unique(
      list(options.knownCustodians, 64).map((k) =>
        text(verifier.profile.parseKey(k), 512),
      ),
    );
    if (
      !known.includes(seller) ||
      !known.includes(buyer) ||
      !known.includes(courier)
    )
      return stop();
    const clock = options.nowSeconds,
      actorPort = options.actor;
    if (typeof clock !== "function" || typeof actorPort !== "function")
      return stop();
    let revision = integer(proposal.revision),
      generation = integer(options.generation),
      state = "proposed",
      head: string | null = null,
      late = false,
      recovery = false,
      closed = false,
      busy = false,
      lastNow = -1;
    let accepted: ReturnType<typeof evidenceOf> | null = null;
    const receipts = new Map<
        string,
        Readonly<{ predecessor: string | null; giver: string; taker: string }>
      >(),
      custodians = new Set<string>(),
      consumedChallenges = new Set<string>();
    const guard = () => {
      if (closed) return stop("LOCKED");
      assertVerifierCurrent(verifier);
      accepted?.current();
      if (closed) return stop("LOCKED");
    };
    const view = () =>
      local({
        revision,
        generation,
        state,
        receiptHead: head,
        receiptCandidates: Object.freeze([...receipts.keys()]),
        candidateCustodians: Object.freeze([...custodians]),
        lateDeliveryClaim: late,
        recoveryRequired: recovery,
      });
    const run = <T>(work: () => T, readOnly = false) =>
      result(() => {
        if (busy) return stop("CONFLICT");
        busy = true;
        try {
          guard();
          if (!readOnly && revision === Number.MAX_SAFE_INTEGER)
            return stop("LIMIT_EXCEEDED");
          return work();
        } finally {
          busy = false;
        }
      });
    const expectRevision = (n: number) => {
      if (integer(n) !== revision) return stop("STALE_REVISION");
    };
    const now = () => {
      let n: number;
      try {
        n = integer(clock());
      } catch {
        return stop("CLOCK_UNCERTAIN");
      }
      guard();
      if (n < lastNow) return stop("CLOCK_UNCERTAIN");
      lastNow = n;
      return n;
    };
    const bump = () => {
      guard();
      revision = increment(revision);
      return view();
    };
    return Object.freeze({
      inspect: () => run(view, true),
      accept: (expectedRevision: number, evidence: CourierEvidence) =>
        run(() => {
          expectRevision(expectedRevision);
          if (state !== "proposed") return stop("CONFLICT");
          const p = evidenceOf(evidence, verifier, "handshake");
          if (
            canonical(p.body) !== canonical(proposal) ||
            ![seller, buyer, courier].every((k) => p.signers.includes(k))
          )
            return stop("UNAUTHORIZED");
          if (now() >= Number(proposal.pickupBy)) return stop("EXPIRED");
          accepted = p;
          state = "accepted";
          return bump();
        }),
      beginPickup: (expectedRevision: number, evidence: CourierEvidence) =>
        run(() => {
          expectRevision(expectedRevision);
          if (state !== "accepted") return stop("CONFLICT");
          const p = evidenceOf(evidence, verifier, "capability"),
            c = p.body;
          const actor = text(verifier.profile.parseKey(actorPort()), 512),
            at = now();
          if (
            actor !== courier ||
            c.subject !== actor ||
            c.role !== "courier" ||
            c.issuer !== seller ||
            !p.signers.includes(seller) ||
            c.legId !== legId ||
            c.generation !== generation ||
            !(c.actions as readonly string[]).includes("pickup")
          )
            return stop("UNAUTHORIZED");
          if (
            at < Number(c.notBefore) ||
            at >= Number(c.expiresAt) ||
            at >= Number(proposal.pickupBy)
          )
            return stop("EXPIRED");
          guard();
          state = "pickupPending";
          return bump();
        }),
      recordReceipt: (
        expectedRevision: number,
        evidence: CourierEvidence,
        challenge: CourierEvidence,
      ) =>
        run(() => {
          expectRevision(expectedRevision);
          if (
            ![
              "pickupPending",
              "inCustody",
              "deliveredClaimed",
              "ambiguous",
            ].includes(state)
          )
            return stop("CONFLICT");
          const p = evidenceOf(evidence, verifier, "receipt"),
            r = p.body,
            c = evidenceOf(challenge, verifier, "challenge"),
            claim = c.body;
          if (
            claim.legId !== legId ||
            r.challengeHash !== c.hash ||
            r.giver !== claim.giver ||
            r.taker !== claim.taker ||
            r.predecessor !== claim.receiptHead ||
            ![claim.giver, claim.taker].every((k) =>
              c.signers.includes(k as string),
            )
          )
            return stop("UNAUTHORIZED");
          const challengeId = hex(claim.challengeId);
          if (consumedChallenges.has(challengeId)) return stop("CONFLICT");
          if (
            r.legId !== legId ||
            r.containerCommitment !== container ||
            !known.includes(r.giver as string) ||
            !known.includes(r.taker as string)
          )
            return stop("UNAUTHORIZED");
          if (receipts.has(p.hash)) return stop("CONFLICT");
          if (receipts.size >= 128) return stop("LIMIT_EXCEEDED");
          const prior = r.predecessor as string | null;
          if (prior !== null && !receipts.has(prior))
            return stop("MISSING_DEPENDENCY");
          const giver = r.giver as string,
            taker = r.taker as string,
            mutual = [giver, taker].every((k) => p.signers.includes(k)),
            at = now();
          if (at < Number(claim.issuedAt) || at >= Number(claim.expiresAt))
            return stop("EXPIRED");
          const sameParent = [...receipts.values()].some(
            (x) => x.predecessor === prior,
          );
          receipts.set(
            p.hash,
            Object.freeze({ predecessor: prior, giver, taker }),
          );
          consumedChallenges.add(challengeId);
          if (!mutual || sameParent || prior !== head) {
            state = "ambiguous";
            recovery = true;
            custodians.add(giver);
            custodians.add(taker);
            return bump();
          }
          if (
            state === "pickupPending" &&
            giver === seller &&
            taker === courier
          ) {
            state = "inCustody";
            head = p.hash;
            custodians.clear();
            custodians.add(courier);
          } else if (
            state === "inCustody" &&
            giver === courier &&
            taker === buyer
          ) {
            state = "deliveredClaimed";
            head = p.hash;
            late = at > Number(proposal.deliveryBy);
            custodians.clear();
            custodians.add(buyer);
          } else {
            state = "ambiguous";
            recovery = true;
            custodians.add(giver);
            custodians.add(taker);
          }
          return bump();
        }),
      cancel: (expectedRevision: number) =>
        run(() => {
          expectRevision(expectedRevision);
          const actor = text(verifier.profile.parseKey(actorPort()), 512);
          guard();
          if (![seller, buyer, courier].includes(actor))
            return stop("UNAUTHORIZED");
          if (["proposed", "accepted", "pickupPending"].includes(state)) {
            state = "cancelled";
            return bump();
          }
          if (state === "cancelled" || state === "closed")
            return stop("CONFLICT");
          state = "ambiguous";
          recovery = true;
          return bump();
        }),
      revokeCapabilities: (expectedRevision: number) =>
        run(() => {
          expectRevision(expectedRevision);
          generation = increment(generation);
          return bump();
        }),
      tick: (expectedRevision: number) =>
        run(() => {
          expectRevision(expectedRevision);
          const at = now();
          if (
            at >= Number(proposal.deliveryBy) &&
            !["deliveredClaimed", "cancelled", "closed"].includes(state)
          )
            recovery = true;
          return bump();
        }),
      close() {
        closed = true;
      },
    });
  });
}
export interface RecoveryView {
  readonly revision: number;
  readonly outcome: string;
  readonly phase: "responding" | "cooperative-recovery" | "timed-out";
  readonly reminders: number;
  readonly financialTimeoutDue: boolean;
  readonly receiptHeads: readonly string[];
  readonly localModelOnly: true;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface RecoveryModel {
  inspect(): CourierResult<RecoveryView>;
  remind(expectedRevision: number): CourierResult<RecoveryView>;
  tick(expectedRevision: number): CourierResult<RecoveryView>;
  agree(
    expectedRevision: number,
    outcome: CourierEvidence,
  ): CourierResult<RecoveryView>;
}
export function createRecoveryModel(options: {
  readonly verifier: CourierVerifier;
  readonly opened: CourierEvidence;
  readonly affectedParticipants: readonly string[];
  readonly nowSeconds: () => number;
}): CourierResult<RecoveryModel> {
  return result(() => {
    const { verifier } = options,
      proof = evidenceOf(options.opened, verifier, "recovery"),
      opened = proof.body;
    const start = integer(opened.openedAt),
      response = integer(opened.responseBy),
      end = integer(opened.resolveBy);
    if (
      opened.outcome !== "open" ||
      response - start < 3600 ||
      response - start > 86400 ||
      end <= response ||
      end - start > 604800
    )
      return stop();
    const participants = unique(
      list(options.affectedParticipants, 4).map((k) =>
        text(verifier.profile.parseKey(k), 512),
      ),
    );
    if (participants.length < 2) return stop();
    const clock = options.nowSeconds;
    if (typeof clock !== "function") return stop();
    let revision = 0,
      reminders = 0,
      outcome = "open",
      phase: RecoveryView["phase"] = "responding",
      lastNow = -1;
    const heads = opened.receiptHeads as readonly string[];
    const view = () =>
      local({
        revision,
        outcome,
        phase,
        reminders,
        financialTimeoutDue: phase === "timed-out",
        receiptHeads: heads,
      });
    let busy = false;
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
    const expectRevision = (n: number) => {
      if (integer(n) !== revision) return stop("STALE_REVISION");
    };
    const time = () => {
      let n: number;
      try {
        n = integer(clock());
      } catch {
        return stop("CLOCK_UNCERTAIN");
      }
      proof.current();
      if (n < lastNow) return stop("CLOCK_UNCERTAIN");
      lastNow = n;
      return n;
    };
    return Object.freeze({
      inspect: () => run(view),
      remind: (expectedRevision: number) =>
        run(() => {
          expectRevision(expectedRevision);
          if (reminders >= 3 || time() >= end) return stop("LIMIT_EXCEEDED");
          reminders++;
          revision = increment(revision);
          return view();
        }),
      tick: (expectedRevision: number) =>
        run(() => {
          expectRevision(expectedRevision);
          const at = time();
          if (at >= end) {
            phase = "timed-out";
            if (outcome === "open") outcome = "unresolvedPhysical";
          } else if (at >= response) phase = "cooperative-recovery";
          revision = increment(revision);
          return view();
        }),
      agree: (expectedRevision: number, evidence: CourierEvidence) =>
        run(() => {
          expectRevision(expectedRevision);
          const p = evidenceOf(evidence, verifier, "recovery"),
            r = p.body;
          if (
            r.caseId !== opened.caseId ||
            r.openedAt !== start ||
            r.responseBy !== response ||
            r.resolveBy !== end ||
            canonical(r.receiptHeads) !== canonical(heads) ||
            !participants.every((k) => p.signers.includes(k)) ||
            !["cooperativeReturn", "cooperativeDelivery"].includes(
              r.outcome as string,
            )
          )
            return stop("UNAUTHORIZED");
          const at = time();
          if (at >= end) phase = "timed-out";
          else if (at >= response) phase = "cooperative-recovery";
          outcome = r.outcome as string;
          revision = increment(revision);
          return view();
        }),
    });
  });
}
/** Advisory field authorization only: returns field names, never coordinates/contacts or a send permit. */
export function authorizeRouteFields(options: {
  readonly verifier: CourierVerifier;
  readonly grant: CourierEvidence;
  readonly recipient: string;
  readonly legId: string;
  readonly purpose: "assignment" | "recovery";
  readonly consentRevision: number;
  readonly accepted: boolean;
  readonly requested: readonly string[];
  readonly nowSeconds: number;
}) {
  return result(() => {
    const p = evidenceOf(options.grant, options.verifier, "disclosure"),
      r = p.body,
      recipient = text(
        options.verifier.profile.parseKey(options.recipient),
        512,
      );
    if (
      r.recipient !== recipient ||
      r.legId !== hex(options.legId) ||
      r.purpose !== options.purpose ||
      r.consentRevision !== integer(options.consentRevision) ||
      !options.accepted
    )
      return stop("UNAUTHORIZED");
    if (integer(options.nowSeconds) >= Number(r.expiresAt))
      return stop("EXPIRED");
    const fields = unique(list(options.requested, 4).map((x) => text(x)));
    if (fields.some((x) => !(r.fields as readonly string[]).includes(x)))
      return stop("UNAUTHORIZED");
    return local({ fields });
  });
}
