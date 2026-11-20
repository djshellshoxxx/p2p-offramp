/** CIT-08 exact container commitment. This proves knowledge of bytes, never cash or custody. */
import { sha256Hex } from "../../domain/index.ts";
import {
  data,
  hex,
  integer,
  bytesOf,
  result,
  asyncResult,
  stop,
  type CourierResult,
} from "./shared.ts";
const prefix = new TextEncoder().encode("p2p-offramp/container/v1\0");
export interface ContainerOpening {
  readonly shipmentId: string;
  readonly containerId: string;
  readonly generation: number;
  readonly secret: string;
}
export interface ContainerExpectation {
  readonly shipmentId: string;
  readonly containerId: string;
  readonly generation: number;
  readonly commitment: string;
}
export function parseOpening(input: unknown): ContainerOpening {
  const r = data(input, ["shipmentId", "containerId", "generation", "secret"]);
  return Object.freeze({
    shipmentId: hex(r.shipmentId),
    containerId: hex(r.containerId),
    generation: integer(r.generation),
    secret: hex(r.secret),
  });
}
/** Private test/preimage bytes: caller owns and must clear the returned buffer. No signing profile is chosen. */
export function containerCommitmentBytes(
  input: unknown,
): CourierResult<Uint8Array<ArrayBuffer>> {
  return result(() => {
    const encoded = bytesOf(parseOpening(input));
    try {
      const bytes = new Uint8Array(prefix.length + encoded.length);
      bytes.set(prefix);
      bytes.set(encoded, prefix.length);
      return bytes;
    } finally {
      encoded.fill(0);
    }
  });
}
export function commitContainerOpening(
  input: unknown,
): Promise<CourierResult<string>> {
  return asyncResult(async () => {
    const encoded = containerCommitmentBytes(input);
    if (!encoded.ok) return stop(encoded.code);
    try {
      return await sha256Hex(encoded.value);
    } catch {
      return stop("UNAVAILABLE");
    } finally {
      encoded.value.fill(0);
    }
  });
}
export function verifyContainerOpening(
  input: unknown,
  expected: unknown,
): Promise<CourierResult<"match" | "mismatch">> {
  return asyncResult(async () => {
    const opening = parseOpening(input),
      r = data(expected, [
        "shipmentId",
        "containerId",
        "generation",
        "commitment",
      ]);
    const expectation = {
      shipmentId: hex(r.shipmentId),
      containerId: hex(r.containerId),
      generation: integer(r.generation),
      commitment: hex(r.commitment),
    };
    if (
      opening.shipmentId !== expectation.shipmentId ||
      opening.containerId !== expectation.containerId ||
      opening.generation !== expectation.generation
    )
      return "mismatch";
    const hash = await commitContainerOpening(opening);
    if (!hash.ok) return stop(hash.code);
    return hash.value === expectation.commitment ? "match" : "mismatch";
  });
}
