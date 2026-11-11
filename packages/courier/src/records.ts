import {
  data,
  list,
  text,
  hex,
  integer,
  bool,
  choice,
  optional,
  units,
  unique,
  bytesOf,
  decode,
  result,
  stop,
  type CourierResult,
} from "./shared.ts";
/** Key and signature encodings belong to the selected reviewed terms profile, not to this package. */
export interface CourierProfile {
  readonly id: string;
  readonly parseKey: (value: unknown) => string;
  readonly parseSignature: (value: unknown) => string;
}
export type RecordKind =
  | "capability"
  | "handshake"
  | "assignment"
  | "disclosure"
  | "leg"
  | "commitment"
  | "opening"
  | "secret-record"
  | "inspection"
  | "locker-command"
  | "locker-observation"
  | "window"
  | "locker-incident"
  | "stake"
  | "reservation"
  | "deduction"
  | "challenge"
  | "receipt"
  | "signed-receipt"
  | "recovery"
  | "fee-schedule"
  | "fee-allocation";
type Parser = (value: unknown) => unknown;
export type CourierRecord = Readonly<Record<string, unknown>>;
export function profileOf(input: CourierProfile): CourierProfile {
  const raw = data(input, ["id", "parseKey", "parseSignature"]);
  if (
    typeof raw.parseKey !== "function" ||
    typeof raw.parseSignature !== "function"
  )
    return stop("UNSUPPORTED_PROFILE");
  return Object.freeze({
    id: text(raw.id, 64),
    parseKey: raw.parseKey as CourierProfile["parseKey"],
    parseSignature: raw.parseSignature as CourierProfile["parseSignature"],
  });
}
function parse(
  kind: RecordKind,
  input: unknown,
  p: CourierProfile,
): CourierRecord {
  const key: Parser = (v) => text(p.parseKey(v), 512),
    signature: Parser = (v) => text(p.parseSignature(v), 2048);
  const keys =
    (max: number): Parser =>
    (v) =>
      unique(list(v, max).map(key) as string[]);
  const hashes =
    (max: number): Parser =>
    (v) =>
      unique(list(v, max).map(hex));
  const names =
    <T extends string>(allowed: readonly T[]): Parser =>
    (v) =>
      choice(v, allowed);
  const arrayNames =
    <T extends string>(allowed: readonly T[], max: number): Parser =>
    (v) =>
      unique(list(v, max).map((x) => choice(x, allowed)));
  const schemas: Record<RecordKind, Record<string, Parser>> = {
    capability: {
      shipmentId: hex,
      termsHash: hex,
      subject: key,
      role: names(["seller", "buyer", "courier", "handoffPeer"]),
      actions: arrayNames(
        ["accept", "pickup", "handoff", "receive", "recover"],
        5,
      ),
      legId: optional(hex),
      generation: integer,
      notBefore: integer,
      expiresAt: integer,
      issuer: key,
    },
    handshake: {
      shipmentId: hex,
      termsHash: hex,
      revision: integer,
      seller: key,
      buyer: key,
      courier: key,
      state: names([
        "proposed",
        "accepted",
        "pickupPending",
        "inCustody",
        "deliveredClaimed",
        "closed",
        "cancelled",
        "ambiguous",
      ]),
      pickupBy: integer,
      deliveryBy: integer,
      resolveBy: integer,
      receiptHead: optional(hex),
    },
    assignment: {
      shipmentAlias: hex,
      legId: hex,
      revision: integer,
      courier: key,
      pickupPeer: key,
      dropoffPeer: key,
      containerCommitment: hex,
      pickupContactRef: hex,
      dropoffContactRef: hex,
      acceptBy: integer,
      pickupBy: integer,
      deliveryBy: integer,
      predecessorReceipt: optional(hex),
    },
    disclosure: {
      grantId: hex,
      shipmentAlias: hex,
      legId: hex,
      recipient: key,
      fields: arrayNames(
        ["pickup", "dropoff", "peerContact", "recoveryContact"],
        4,
      ),
      purpose: names(["assignment", "recovery"]),
      expiresAt: integer,
      consentRevision: integer,
    },
    leg: {
      legId: hex,
      revision: integer,
      state: names([
        "offered",
        "accepted",
        "arrived",
        "transferring",
        "custodyClaimed",
        "completed",
        "expired",
        "ambiguous",
      ]),
      priorReceipt: optional(hex),
      outgoingReceipt: optional(hex),
      activeCustodian: optional(key),
    },
    commitment: {
      version: (v) => (v === 1 ? 1 : stop("UNSUPPORTED_PROFILE")),
      shipmentId: hex,
      containerId: hex,
      generation: integer,
      commitment: hex,
      creator: key,
      publishedAt: integer,
    },
    opening: {
      shipmentId: hex,
      containerId: hex,
      generation: integer,
      secret: hex,
    },
    "secret-record": {
      shipmentId: hex,
      containerId: hex,
      generation: integer,
      commitment: hex,
      state: names([
        "provisioned",
        "sealedClaimed",
        "disclosed",
        "compromised",
        "retired",
      ]),
      secretVaultRef: optional(hex),
      authorizedReaders: keys(4),
      expiresAt: integer,
    },
    inspection: {
      shipmentId: hex,
      containerId: hex,
      legId: hex,
      observer: key,
      sealId: (v) => {
        const s = text(v);
        return /^[\x20-\x7e]{1,128}$/.test(s) ? s : stop();
      },
      condition: names(["intactClaimed", "damaged", "missing", "unknown"]),
      observedAt: integer,
      priorInspection: optional(hex),
      evidenceHashes: hashes(8),
      source: names(["human", "reviewedDevice"]),
      deviceProfile: optional(text),
    },
    "locker-command": {
      commandId: hex,
      shipmentId: hex,
      lockerId: text,
      profileId: text,
      operation: names(["reserve", "unlock", "status", "releaseReservation"]),
      reservationId: optional(text),
      expectedCounter: integer,
      capabilityHash: hex,
      expiresAt: integer,
    },
    "locker-observation": {
      commandId: hex,
      counter: integer,
      status: names(["locked", "unlocked", "jammed", "unknown"]),
      authenticated: bool,
    },
    window: {
      reservationId: text,
      credentialId: hex,
      subject: key,
      notBefore: integer,
      expiresAt: integer,
      maxClockError: (v) => integer(v, 30),
      maxUses: (v) => (v === 1 ? 1 : stop()),
      issuer: key,
      revocationEpoch: integer,
      offlineAllowed: (v) =>
        v === false ? false : stop("UNSUPPORTED_PROFILE"),
    },
    "locker-incident": {
      incidentId: hex,
      reservationId: text,
      shipmentId: hex,
      fault: names([
        "power",
        "network",
        "jam",
        "sensorConflict",
        "identity",
        "unknownOutcome",
      ]),
      lastCommand: optional(hex),
      reportedCustodian: optional(key),
      openedAt: integer,
      recoverBy: integer,
      state: names([
        "paused",
        "reconciling",
        "manualRecovery",
        "returnedClaimed",
        "unresolved",
      ]),
    },
    stake: {
      vaultId: text,
      courier: key,
      assetId: text,
      deposited: units,
      reserved: units,
      unbonding: units,
      withdrawable: units,
    },
    reservation: {
      reservationId: hex,
      shipmentId: hex,
      amount: units,
      policyHash: hex,
      resolveBy: integer,
      state: names(["active", "released", "deducted"]),
    },
    deduction: {
      decisionId: hex,
      reservationId: hex,
      policyHash: hex,
      amount: units,
      beneficiary: text,
      basis: names(["cooperative", "optInTribunal"]),
      evidenceRoot: hex,
      issuedAt: integer,
      appealUntil: integer,
      finalAfter: integer,
    },
    challenge: {
      challengeId: hex,
      shipmentId: hex,
      legId: hex,
      giver: key,
      taker: key,
      receiptHead: optional(hex),
      nonce: hex,
      issuedAt: integer,
      expiresAt: integer,
    },
    receipt: {
      version: (v) => (v === 1 ? 1 : stop("UNSUPPORTED_PROFILE")),
      shipmentId: hex,
      legId: hex,
      challengeHash: hex,
      predecessor: optional(hex),
      giver: key,
      taker: key,
      containerCommitment: hex,
      inspectionHashes: hashes(8),
      observedAt: integer,
      claim: names(["containerTransferred", "returnTransferred"]),
      contents: names(["notInspected", "countClaimed"]),
      declaredCurrency: optional((v) => {
        const s = text(v, 3);
        return /^[A-Z]{3}$/.test(s) ? s : stop();
      }),
      declaredMinorUnits: optional(units),
    },
    "signed-receipt": {
      body: (v) => parse("receipt", v, p),
      giverSignature: signature,
      takerSignature: signature,
    },
    recovery: {
      caseId: hex,
      shipmentId: hex,
      termsHash: hex,
      cause: names([
        "noShow",
        "late",
        "missingAck",
        "conflictingCustody",
        "lockerFailure",
        "secretExposure",
      ]),
      openedAt: integer,
      responseBy: integer,
      resolveBy: integer,
      receiptHeads: hashes(16),
      outcome: names([
        "open",
        "cooperativeReturn",
        "cooperativeDelivery",
        "financialTimeout",
        "unresolvedPhysical",
      ]),
    },
    "fee-schedule": {
      shipmentId: hex,
      assetId: text,
      payer: key,
      total: units,
      pickupFee: units,
      deliveryFee: units,
      cancellationFee: units,
      refundTo: text,
      payTo: text,
      policyHash: hex,
    },
    "fee-allocation": {
      allocationId: hex,
      earned: units,
      refunded: units,
      pending: units,
      basis: names(["cooperative", "timeoutRefund"]),
    },
  };
  const schema = schemas[kind];
  if (!schema) return stop("UNSUPPORTED_PROFILE");
  const raw = data(input, Object.keys(schema)),
    out: Record<string, unknown> = Object.create(null);
  for (const [field, read] of Object.entries(schema))
    out[field] = read(raw[field]);
  if ("notBefore" in out && Number(out.expiresAt) <= Number(out.notBefore))
    return stop();
  if (kind === "window" && Number(out.expiresAt) - Number(out.notBefore) > 3600)
    return stop();
  if (
    kind === "assignment" &&
    !(
      Number(out.acceptBy) < Number(out.pickupBy) &&
      Number(out.pickupBy) < Number(out.deliveryBy)
    )
  )
    return stop();
  if (
    kind === "handshake" &&
    !(
      Number(out.pickupBy) < Number(out.deliveryBy) &&
      Number(out.deliveryBy) < Number(out.resolveBy)
    )
  )
    return stop();
  if (
    kind === "challenge" &&
    (out.giver === out.taker ||
      Number(out.expiresAt) <= Number(out.issuedAt) ||
      Number(out.expiresAt) - Number(out.issuedAt) > 120)
  )
    return stop();
  if (
    kind === "receipt" &&
    (out.giver === out.taker ||
      (out.contents === "notInspected" &&
        (out.declaredCurrency !== null || out.declaredMinorUnits !== null)) ||
      (out.declaredCurrency === null) !== (out.declaredMinorUnits === null))
  )
    return stop();
  if (
    kind === "inspection" &&
    (out.source === "human") !== (out.deviceProfile === null)
  )
    return stop("UNSUPPORTED_PROFILE");
  bytesOf(out);
  return Object.freeze(out);
}
export function parseCourierRecord(
  kind: RecordKind,
  input: unknown,
  profile: CourierProfile,
): CourierResult<CourierRecord> {
  return result(() => parse(kind, input, profileOf(profile)));
}
export function decodeCourierRecord(
  kind: RecordKind,
  bytes: Uint8Array,
  profile: CourierProfile,
): CourierResult<CourierRecord> {
  return result(() => parse(kind, decode(bytes), profileOf(profile)));
}
export function encodeCourierRecord(
  kind: RecordKind,
  input: unknown,
  profile: CourierProfile,
): CourierResult<Uint8Array<ArrayBuffer>> {
  return result(() => bytesOf(parse(kind, input, profileOf(profile))));
}
