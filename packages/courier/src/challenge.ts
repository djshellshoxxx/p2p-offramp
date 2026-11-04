/** Public coordination nonces only. No profile/signature/identity or proximity assertion is created. */
import {
  parseCourierRecord,
  profileOf,
  type CourierProfile,
  type CourierRecord,
} from "./records.ts";
import {
  data,
  hex,
  integer,
  text,
  optional,
  result,
  stop,
  type CourierResult,
} from "./shared.ts";
export function createHandoffChallenge(
  input: unknown,
  profile: CourierProfile,
): CourierResult<CourierRecord> {
  return result(() => {
    const r = data(input, [
        "shipmentId",
        "legId",
        "giver",
        "taker",
        "receiptHead",
        "issuedAt",
        "expiresAt",
      ]),
      p = profileOf(profile);
    const value = {
      shipmentId: hex(r.shipmentId),
      legId: hex(r.legId),
      giver: text(p.parseKey(r.giver), 512),
      taker: text(p.parseKey(r.taker), 512),
      receiptHead: optional(hex)(r.receiptHead),
      issuedAt: integer(r.issuedAt),
      expiresAt: integer(r.expiresAt),
    };
    if (
      value.giver === value.taker ||
      value.expiresAt <= value.issuedAt ||
      value.expiresAt - value.issuedAt > 120
    )
      return stop();
    if (typeof globalThis.crypto?.getRandomValues !== "function")
      return stop("UNAVAILABLE");
    const random = new Uint8Array(64);
    try {
      try {
        globalThis.crypto.getRandomValues(random);
      } catch {
        return stop("UNAVAILABLE");
      }
      const encode = (part: Uint8Array) =>
        Array.from(part, (b) => b.toString(16).padStart(2, "0")).join("");
      const parsed = parseCourierRecord(
        "challenge",
        {
          ...value,
          challengeId: encode(random.subarray(0, 32)),
          nonce: encode(random.subarray(32)),
        },
        p,
      );
      if (!parsed.ok) return stop(parsed.code);
      return parsed.value;
    } finally {
      random.fill(0);
    }
  });
}
