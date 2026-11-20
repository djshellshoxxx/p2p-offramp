/** MEET10/11 local directory projection. Signatures authenticate publication, never venue safety. */
import { sha256Hex } from "../../domain/index.ts";
import { data, list, integer, hex } from "./shared.ts";
import {
  policyResult,
  policyStop,
  policyText,
  policyBytes,
  policyJson,
  policyCopy,
  assertPolicyCanonical,
  createPolicyOwner,
  createPolicyVault,
  type PolicyResult,
  type PolicyScope,
  type PolicyVaultOptions,
} from "./policy-data.ts";
const DAY = 86400000,
  HISTORY = 90 * DAY,
  FORMAT = "p2p-offramp/venue-history/local/v1";
export interface VenueRecord {
  readonly v: 1;
  readonly venueId: string;
  readonly publisherKey: string;
  readonly revision: number;
  readonly latE6: number;
  readonly lonE6: number;
  readonly name: string;
  readonly address: string;
  readonly notes: string;
  readonly facilities: readonly Readonly<{
    kind: "lighting" | "staffed" | "step-free" | "public-transport";
    status: "yes" | "no" | "unknown";
    lastCheckedAtMs: number;
  }>[];
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly license: string;
  readonly attribution: string;
  readonly signature: string;
}
export interface VenueRevocation {
  readonly v: 1;
  readonly publisherKey: string;
  readonly venueId: string;
  readonly sequence: number;
  readonly effectiveAtMs: number;
  readonly reason: "closed" | "incorrect" | "abuse" | "key-compromise";
  readonly signature: string;
}
const name = (v: unknown, values: readonly string[]) =>
  typeof v === "string" && values.includes(v) ? v : policyStop();
function record(input: unknown): VenueRecord {
  const r = data(input, [
    "v",
    "venueId",
    "publisherKey",
    "revision",
    "latE6",
    "lonE6",
    "name",
    "address",
    "notes",
    "facilities",
    "issuedAtMs",
    "expiresAtMs",
    "license",
    "attribution",
    "signature",
  ]);
  if (r.v !== 1) return policyStop("UNSUPPORTED_VERSION");
  const facilities = list(r.facilities, 16).map((raw) => {
    const f = data(raw, ["kind", "status", "lastCheckedAtMs"]);
    return Object.freeze({
      kind: name(f.kind, [
        "lighting",
        "staffed",
        "step-free",
        "public-transport",
      ]) as VenueRecord["facilities"][number]["kind"],
      status: name(f.status, [
        "yes",
        "no",
        "unknown",
      ]) as VenueRecord["facilities"][number]["status"],
      lastCheckedAtMs: integer(f.lastCheckedAtMs),
    });
  });
  if (new Set(facilities.map((f) => f.kind)).size !== facilities.length)
    return policyStop();
  const issuedAtMs = integer(r.issuedAtMs),
    expiresAtMs = integer(r.expiresAtMs);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > 30 * DAY)
    return policyStop();
  return Object.freeze({
    v: 1,
    venueId: hex(r.venueId, 32),
    publisherKey: hex(r.publisherKey, 64),
    revision: integer(r.revision),
    latE6: integer(r.latE6, -85000000, 85000000),
    lonE6: integer(r.lonE6, -180000000, 179999999),
    name: policyText(r.name, 160),
    address: policyText(r.address, 300),
    notes: policyText(r.notes, 1000, true),
    facilities: Object.freeze(facilities),
    issuedAtMs,
    expiresAtMs,
    license: policyText(r.license, 128),
    attribution: policyText(r.attribution, 1000),
    signature: hex(r.signature, 128),
  });
}
function revocation(input: unknown): VenueRevocation {
  const r = data(input, [
    "v",
    "publisherKey",
    "venueId",
    "sequence",
    "effectiveAtMs",
    "reason",
    "signature",
  ]);
  if (r.v !== 1) return policyStop("UNSUPPORTED_VERSION");
  return Object.freeze({
    v: 1,
    publisherKey: hex(r.publisherKey, 64),
    venueId: r.venueId === "*" ? "*" : hex(r.venueId, 32),
    sequence: integer(r.sequence),
    effectiveAtMs: integer(r.effectiveAtMs),
    reason: name(r.reason, [
      "closed",
      "incorrect",
      "abuse",
      "key-compromise",
    ]) as VenueRevocation["reason"],
    signature: hex(r.signature, 128),
  });
}
export const parseVenueRecord = (input: unknown): PolicyResult<VenueRecord> =>
  policyResult(() => record(input));
export const parseVenueRevocation = (
  input: unknown,
): PolicyResult<VenueRevocation> => policyResult(() => revocation(input));
export const encodeVenueRecord = (
  input: unknown,
): PolicyResult<Uint8Array<ArrayBuffer>> =>
  policyResult(() => {
    const b = policyBytes(record(input));
    if (b.length > 8192) {
      b.fill(0);
      return policyStop("CAPACITY_EXCEEDED");
    }
    return b;
  });
export const encodeVenueRevocation = (
  input: unknown,
): PolicyResult<Uint8Array<ArrayBuffer>> =>
  policyResult(() => policyBytes(revocation(input)));
interface High {
  key: string;
  revision: number;
  digest: string;
  seenAtMs: number;
  quarantined: boolean;
}
interface Revoke {
  key: string;
  sequence: number;
  digest: string;
  effectiveAtMs: number;
  seenAtMs: number;
  quarantined: boolean;
}
interface History {
  format: typeof FORMAT;
  lastWallMs: number;
  records: High[];
  revocations: Revoke[];
}
function history(input: unknown): History {
  if (input === null)
    return { format: FORMAT, lastWallMs: 0, records: [], revocations: [] };
  const r = data(input, ["format", "lastWallMs", "records", "revocations"]);
  if (r.format !== FORMAT) return policyStop("CONFLICT");
  const parseKey = (x: unknown) => {
    const s = policyText(x, 97);
    if (!/^[0-9a-f]{64}:(?:[0-9a-f]{32}|\*)$/.test(s)) return policyStop();
    return s;
  };
  const records = list(r.records, 5000).map((raw) => {
      const e = data(raw, [
        "key",
        "revision",
        "digest",
        "seenAtMs",
        "quarantined",
      ]);
      if (typeof e.quarantined !== "boolean") return policyStop();
      return {
        key: parseKey(e.key),
        revision: integer(e.revision),
        digest: hex(e.digest, 64),
        seenAtMs: integer(e.seenAtMs),
        quarantined: e.quarantined,
      };
    }),
    revocations = list(r.revocations, 5000).map((raw) => {
      const e = data(raw, [
        "key",
        "sequence",
        "digest",
        "effectiveAtMs",
        "seenAtMs",
        "quarantined",
      ]);
      if (typeof e.quarantined !== "boolean") return policyStop();
      return {
        key: parseKey(e.key),
        sequence: integer(e.sequence),
        digest: hex(e.digest, 64),
        effectiveAtMs: integer(e.effectiveAtMs),
        seenAtMs: integer(e.seenAtMs),
        quarantined: e.quarantined,
      };
    });
  if (
    records.length + revocations.length > 5000 ||
    new Set(records.map((e) => e.key)).size !== records.length ||
    new Set(revocations.map((e) => e.key)).size !== revocations.length
  )
    return policyStop("CAPACITY_EXCEEDED");
  return {
    format: FORMAT,
    lastWallMs: integer(r.lastWallMs),
    records,
    revocations,
  };
}
export interface VenueDecision {
  readonly recordDigest: string;
  readonly recordId: string;
  readonly state:
    | "pending"
    | "recommended"
    | "stale"
    | "expired"
    | "revoked"
    | "quarantined"
    | "blocked";
  readonly reason: string;
  readonly policyVersion: string;
  readonly recommendationNotCertification: true;
  readonly localModelOnly: true;
}
export interface DirectoryView {
  readonly decisions: readonly VenueDecision[];
  readonly invalidEntries: number;
  readonly freshness: "fresh" | "stale" | "unknown" | "unconfigured";
  readonly distributionApproved: false;
}
export interface VenueDirectory {
  apply(
    records: unknown,
    revocations: unknown,
  ): Promise<PolicyResult<DirectoryView>>;
  close(): void;
}
export interface VenueDirectoryOptions {
  readonly scope: PolicyScope;
  readonly isCurrent: (scope: PolicyScope) => boolean;
  readonly persistence: PolicyVaultOptions;
  readonly policyVersion: string;
  readonly publisherKeys: readonly string[];
  readonly blockedKeys: readonly string[];
  readonly licenses: readonly string[];
  readonly nowMs: () => number;
  /** Actual approved source observation, not import/reception time. */ readonly lastRefreshAtMs: () =>
    | number
    | null;
  readonly moderate: (record: VenueRecord, digest: string) => boolean;
  /** Ed25519 exact32/64bytehex; this port owns reviewed domain-byte framing. Revocation domain is separately required, never guessed. */ readonly verify: (
    request: Readonly<{
      kind: "record" | "revocation";
      domain: "p2p-offramp/venue/v1" | null;
      publisherKey: string;
      canonicalPayload: Uint8Array;
      signature: string;
      signal: AbortSignal;
    }>,
  ) => Promise<boolean>;
}
export function createVenueDirectory(
  options?: VenueDirectoryOptions,
): PolicyResult<VenueDirectory> {
  let cleanup: ReturnType<typeof createPolicyOwner> | undefined;
  const result = policyResult(() => {
    if (options === undefined)
      return Object.freeze({
        close() {},
        apply: async () =>
          Object.freeze({
            ok: true as const,
            value: Object.freeze({
              decisions: Object.freeze([]),
              invalidEntries: 0,
              freshness: "unconfigured" as const,
              distributionApproved: false as const,
            }),
          }),
      });
    const version = policyText(options.policyVersion, 128),
      keys = new Set(list(options.publisherKeys, 128).map((k) => hex(k, 64))),
      blocked = new Set(list(options.blockedKeys, 128).map((k) => hex(k, 64))),
      licenses = new Set(
        list(options.licenses, 128).map((v) => policyText(v, 128)),
      ),
      clock = options.nowMs,
      refresh = options.lastRefreshAtMs,
      moderate = options.moderate,
      verify = options.verify;
    if ([clock, refresh, moderate, verify].some((f) => typeof f !== "function"))
      return policyStop();
    const owner = createPolicyOwner(options.scope, options.isCurrent, 30000);
    cleanup = owner;
    const storage = createPolicyVault(owner, options.persistence);
    return Object.freeze({
      close: owner.close,
      apply: (recordInputs: unknown, revokeInputs: unknown) =>
        owner.run(async (signal) => {
          const recordBytes = list(recordInputs, 5000),
            revokeBytes = list(revokeInputs, 5000);
          if (recordBytes.length + revokeBytes.length > 5000)
            return policyStop("CAPACITY_EXCEEDED");
          let total = 0;
          const copied = (inputs: unknown[]) =>
            inputs.map((v) => {
              const b = owner.own(policyCopy(v, 8192));
              total += b.length;
              if (total > 10 * 1024 * 1024)
                return policyStop("CAPACITY_EXCEEDED");
              return b;
            });
          const records = copied(recordBytes),
            revokes = copied(revokeBytes),
            loaded = await storage.read();
          owner.guard();
          const saved = history(loaded.value),
            now = integer(clock());
          owner.guard();
          const rollback = now < saved.lastWallMs;
          saved.records = saved.records.filter(
            (e) => now < e.seenAtMs || now - e.seenAtMs < HISTORY,
          );
          saved.revocations = saved.revocations.filter(
            (e) =>
              now < Math.max(e.seenAtMs, e.effectiveAtMs) ||
              now - Math.max(e.seenAtMs, e.effectiveAtMs) < HISTORY,
          );
          const high = new Map(saved.records.map((e) => [e.key, e])),
            revoked = new Map(saved.revocations.map((e) => [e.key, e]));
          let invalid = 0;
          const authenticate = async (
            kind: "record" | "revocation",
            p: VenueRecord | VenueRevocation,
          ) => {
            if (!keys.has(p.publisherKey))
              return policyStop("UNTRUSTED_PUBLISHER");
            const { signature, ...unsigned } = p,
              bytes = owner.own(policyBytes(unsigned)),
              digest = await sha256Hex(bytes);
            owner.guard();
            const passed = await verify({
              kind,
              domain: kind === "record" ? "p2p-offramp/venue/v1" : null,
              publisherKey: p.publisherKey,
              canonicalPayload: bytes,
              signature,
              signal,
            });
            owner.guard();
            if (passed !== true) return policyStop("BAD_SIGNATURE");
            return digest;
          };
          for (const bytes of revokes) {
            try {
              const p = revocation(policyJson(bytes, 8192));
              assertPolicyCanonical(bytes, p);
              const digest = await authenticate("revocation", p),
                key = p.publisherKey + ":" + p.venueId,
                old = revoked.get(key);
              if (!old)
                revoked.set(key, {
                  key,
                  sequence: p.sequence,
                  digest,
                  effectiveAtMs: p.effectiveAtMs,
                  seenAtMs: now,
                  quarantined: false,
                });
              else if (p.sequence === old.sequence && digest !== old.digest) {
                old.quarantined = true;
                old.effectiveAtMs = Math.min(
                  old.effectiveAtMs,
                  p.effectiveAtMs,
                );
              } else if (p.sequence < old.sequence) {
                old.effectiveAtMs = Math.min(
                  old.effectiveAtMs,
                  p.effectiveAtMs,
                );
              } else if (p.sequence > old.sequence)
                revoked.set(key, {
                  key,
                  sequence: p.sequence,
                  digest,
                  effectiveAtMs: Math.min(old.effectiveAtMs, p.effectiveAtMs),
                  seenAtMs: now,
                  quarantined: old.quarantined,
                });
            } catch (e) {
              owner.guard();
              invalid++;
            }
          }
          const candidates: {
            p: VenueRecord;
            digest: string;
            key: string;
            moderated: boolean;
          }[] = [];
          for (const bytes of records) {
            try {
              const p = record(policyJson(bytes, 8192));
              assertPolicyCanonical(bytes, p);
              if (!licenses.has(p.license))
                return policyStop("UNSUPPORTED_LICENSE");
              if (
                p.issuedAtMs - now > 300000 ||
                p.facilities.some(
                  (f) =>
                    f.lastCheckedAtMs - now > 300000 ||
                    f.lastCheckedAtMs - p.issuedAtMs > 300000,
                )
              )
                return policyStop();
              const digest = await authenticate("record", p),
                key = p.publisherKey + ":" + p.venueId,
                old = high.get(key),
                accepted = moderate(p, digest) === true;
              owner.guard();
              if (!old)
                high.set(key, {
                  key,
                  revision: p.revision,
                  digest,
                  seenAtMs: now,
                  quarantined: false,
                });
              else if (p.revision === old.revision && digest !== old.digest)
                old.quarantined = true;
              else if (p.revision > old.revision)
                high.set(key, {
                  key,
                  revision: p.revision,
                  digest,
                  seenAtMs: now,
                  quarantined: old.quarantined,
                });
              candidates.push({ p, digest, key, moderated: accepted });
            } catch (e) {
              owner.guard();
              invalid++;
            }
          }
          if (high.size + revoked.size > 5000)
            return policyStop("CAPACITY_EXCEEDED");
          saved.records = [...high.values()];
          saved.revocations = [...revoked.values()];
          saved.lastWallMs = Math.max(saved.lastWallMs, now);
          await storage.write(loaded.revision, saved, signal);
          owner.guard();
          const finalNow = integer(clock()),
            observed = refresh();
          owner.guard();
          const checked = observed === null ? null : integer(observed);
          const fresh =
            checked === null || rollback || finalNow < now || checked > finalNow
              ? "unknown"
              : finalNow - checked >= DAY
                ? "stale"
                : "fresh";
          const decisions = candidates.map(
            ({ p, digest, key, moderated }): VenueDecision => {
              const entry = high.get(key)!,
                a = revoked.get(key),
                b = revoked.get(p.publisherKey + ":*");
              let state: VenueDecision["state"] = "recommended",
                reason = "publisher-recommendation";
              if (blocked.has(p.publisherKey)) {
                state = "blocked";
                reason = "locally-blocked";
              } else if (
                entry.quarantined ||
                a?.quarantined ||
                b?.quarantined
              ) {
                state = "quarantined";
                reason = "equivocation";
              } else if (
                (a && a.effectiveAtMs <= finalNow) ||
                (b && b.effectiveAtMs <= finalNow)
              ) {
                state = "revoked";
                reason = "publisher-revocation";
              } else if (p.expiresAtMs <= finalNow) {
                state = "expired";
                reason = "record-expired";
              } else if (
                entry.revision !== p.revision ||
                entry.digest !== digest
              ) {
                state = "pending";
                reason = "older-revision";
              } else if (fresh !== "fresh") {
                state = "stale";
                reason = "directory-" + fresh;
              } else if (!moderated) {
                state = "pending";
                reason = "moderation-required";
              }
              return Object.freeze({
                recordDigest: digest,
                recordId: key,
                state,
                reason,
                policyVersion: version,
                recommendationNotCertification: true,
                localModelOnly: true,
              });
            },
          );
          decisions.sort((a, b) =>
            a.recordId < b.recordId
              ? -1
              : a.recordId > b.recordId
                ? 1
                : a.recordDigest < b.recordDigest
                  ? -1
                  : a.recordDigest > b.recordDigest
                    ? 1
                    : 0,
          );
          return Object.freeze({
            decisions: Object.freeze(decisions),
            invalidEntries: invalid,
            freshness: fresh,
            distributionApproved: false as const,
          });
        }),
    });
  });
  if (!result.ok) cleanup?.close();
  return result;
}
