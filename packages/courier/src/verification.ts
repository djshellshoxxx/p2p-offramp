/** Selected-profile verification ports only. No curve, signed-domain separator or transport is invented here. */
import {
  parseCourierRecord,
  profileOf,
  type CourierProfile,
  type CourierRecord,
  type RecordKind,
} from "./records.ts";
import {
  asyncResult,
  data,
  list,
  text,
  hex,
  binding,
  sameBinding,
  unique,
  bytesOf,
  stop,
  failure,
  codeOf,
  result,
  type TradeBinding,
  type CourierResult,
} from "./shared.ts";
export interface CourierContext {
  readonly binding: TradeBinding;
  readonly shipmentId: string;
  readonly termsHash: string;
}
export interface CourierSignature {
  readonly signer: string;
  readonly signature: string;
}
export interface CourierSignedRequest {
  readonly kind: RecordKind;
  readonly context: CourierContext;
  readonly canonicalPayload: Uint8Array;
  readonly signer: string;
  readonly signature: string;
  readonly signal: AbortSignal;
}
export interface CourierVerifierOptions {
  readonly profile: CourierProfile;
  readonly context: CourierContext;
  readonly isCurrent: () => boolean;
  /** Must implement the exact selected domain/envelope/encoding, authenticate ALL context and payload bytes. */
  readonly verify: (request: CourierSignedRequest) => Promise<boolean>;
  readonly digest: (
    request: Readonly<{
      kind: RecordKind;
      context: CourierContext;
      canonicalPayload: Uint8Array;
      signal: AbortSignal;
    }>,
  ) => Promise<string>;
  /** Reviewed terms-bound policy, never an imported status or caller-supplied approval array. */
  readonly requiredSigners: (
    kind: RecordKind,
    record: CourierRecord,
  ) => readonly string[];
}
export interface CourierEvidence {
  readonly kind: RecordKind;
  readonly hash: string;
  readonly classification: "attributed-mutual-claim" | "one-sided-claim";
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface CourierVerifier {
  readonly context: CourierContext;
  readonly profile: CourierProfile;
  verify(
    kind: RecordKind,
    payload: unknown,
    signatures: unknown,
  ): Promise<CourierResult<CourierEvidence>>;
  close(): void;
}
interface Proof {
  readonly owner: CourierVerifier;
  readonly context: CourierContext;
  readonly kind: RecordKind;
  readonly hash: string;
  readonly body: CourierRecord;
  readonly signers: readonly string[];
  readonly current: () => void;
}
const proofs = new WeakMap<object, Proof>();
const lifetimes = new WeakMap<object, () => void>();
const subscriptions = new WeakMap<
  object,
  (onRevoked: () => void) => () => void
>();
export function assertVerifierCurrent(verifier: CourierVerifier): void {
  const guard = lifetimes.get(verifier);
  if (!guard) return stop("UNAUTHORIZED");
  guard();
}
/** Package-private dependent lifetime lease; never a transported approval. */
export function observeVerifier(
  verifier: CourierVerifier,
  onRevoked: () => void,
): () => void {
  assertVerifierCurrent(verifier);
  const subscribe = subscriptions.get(verifier);
  if (!subscribe) return stop("UNAUTHORIZED");
  return subscribe(onRevoked);
}
export function evidenceOf(
  input: CourierEvidence,
  owner: CourierVerifier,
  kind: RecordKind,
): Proof {
  const proof =
    typeof input === "object" && input !== null ? proofs.get(input) : undefined;
  if (!proof || proof.owner !== owner || proof.kind !== kind)
    return stop("UNAUTHORIZED");
  proof.current();
  return proof;
}
export function createCourierVerifier(
  options: CourierVerifierOptions,
): CourierResult<CourierVerifier> {
  try {
    const raw = data(options, [
        "profile",
        "context",
        "isCurrent",
        "verify",
        "digest",
        "requiredSigners",
      ]),
      profile = profileOf(raw.profile as CourierProfile);
    const c = data(raw.context, ["binding", "shipmentId", "termsHash"]),
      context = Object.freeze({
        binding: binding(c.binding),
        shipmentId: hex(c.shipmentId),
        termsHash: hex(c.termsHash),
      });
    if (
      typeof raw.isCurrent !== "function" ||
      typeof raw.verify !== "function" ||
      typeof raw.digest !== "function" ||
      typeof raw.requiredSigners !== "function"
    )
      return { ok: false, code: "UNSUPPORTED_PROFILE", retryable: false };
    const currentPort = raw.isCurrent as () => boolean,
      verifyPort = raw.verify as CourierVerifierOptions["verify"],
      digestPort = raw.digest as CourierVerifierOptions["digest"],
      requiredPort =
        raw.requiredSigners as CourierVerifierOptions["requiredSigners"];
    let closed = false,
      busy = false,
      active:
        | Readonly<{ controller: AbortController; owned: Uint8Array[] }>
        | undefined;
    const dependents = new Set<() => void>();
    const close = () => {
      if (closed) return;
      closed = true;
      active?.controller.abort();
      active?.owned.forEach((bytes) => bytes.fill(0));
      for (const listener of dependents) {
        try {
          listener();
        } catch {}
      }
      dependents.clear();
    };
    const current = () => {
      let value = false;
      try {
        value = !closed && currentPort() === true;
      } catch {}
      if (closed || !value) {
        close();
        return stop("LOCKED");
      }
    };
    // Local resource bound, not a normative signing/device timeout. A port cannot retain an operation forever.
    const boundedPort = <T>(
      call: () => Promise<T>,
      controller: AbortController,
    ) =>
      new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (ok: boolean, value: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", abort);
          if (ok) resolve(value as T);
          else reject(value);
        };
        const refusal = (code: "LOCKED" | "UNAVAILABLE") => {
          try {
            stop(code);
          } catch (error) {
            finish(false, error);
          }
        };
        const abort = () => refusal(closed ? "LOCKED" : "UNAVAILABLE");
        const timer = setTimeout(() => {
          refusal("UNAVAILABLE");
          // A timed-out port may ignore abort and remain physically pending. Retire this
          // owner rather than admit more work behind an unknown retained operation.
          close();
        }, 5000);
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) {
          abort();
          return;
        }
        // A synchronous throw from the port refuses at once; its promise outcome settles below.
        const started = result(() =>
          Promise.resolve(call()).then(
            (value) => finish(true, value),
            () => refusal("UNAVAILABLE"),
          ),
        );
        if (!started.ok) refusal("UNAVAILABLE");
      });
    const verifier: CourierVerifier = Object.freeze({
      context,
      profile,
      verify(kind: RecordKind, payload: unknown, signatures: unknown) {
        return asyncResult(async () => {
          if (busy) return stop("CONFLICT");
          busy = true;
          const owned: Uint8Array[] = [],
            controller = new AbortController();
          active = { controller, owned };
          try {
            current();
            if (kind === "opening" || kind === "secret-record")
              return stop("UNSUPPORTED_PROFILE");
            const parsed = parseCourierRecord(kind, payload, profile);
            if (!parsed.ok) return stop(parsed.code);
            const body = parsed.value;
            if (
              ("shipmentId" in body &&
                body.shipmentId !== context.shipmentId) ||
              ("termsHash" in body && body.termsHash !== context.termsHash)
            )
              return stop("UNAUTHORIZED");
            const signed = unique(
              list(signatures, 4).map((value) => {
                const s = data(value, ["signer", "signature"]);
                return Object.freeze({
                  signer: text(profile.parseKey(s.signer), 512),
                  signature: text(profile.parseSignature(s.signature), 2048),
                });
              }),
              (s) => s.signer,
            );
            const expected = unique(
              list(requiredPort(kind, body), 4).map((value) =>
                text(profile.parseKey(value), 512),
              ),
            );
            current();
            if (!expected.length) return stop("UNSUPPORTED_PROFILE");
            if (signed.some((s) => !expected.includes(s.signer)))
              return stop("UNAUTHORIZED");
            const budget = bytesOf({ body, signatures: signed });
            owned.push(budget);
            const canonicalPayload = bytesOf(body),
              digestCopy = canonicalPayload.slice();
            owned.push(canonicalPayload, digestCopy);
            const hash = hex(
              await boundedPort(
                () =>
                  digestPort({
                    kind,
                    context,
                    canonicalPayload: digestCopy,
                    signal: controller.signal,
                  }),
                controller,
              ),
            );
            current();
            const confirmed: string[] = [];
            for (const entry of signed) {
              const copy = canonicalPayload.slice();
              owned.push(copy);
              const passed = await boundedPort(
                () =>
                  verifyPort({
                    kind,
                    context,
                    canonicalPayload: copy,
                    signer: entry.signer,
                    signature: entry.signature,
                    signal: controller.signal,
                  }),
                controller,
              );
              current();
              if (passed === true) confirmed.push(entry.signer);
              else if (passed !== false) return stop("UNAVAILABLE");
            }
            if (!confirmed.length) return stop("UNAUTHORIZED");
            const full = expected.every((key) => confirmed.includes(key));
            const evidence: CourierEvidence = Object.freeze({
              kind,
              hash,
              classification: full
                ? "attributed-mutual-claim"
                : "one-sided-claim",
              physicalContentsVerified: false,
              economicAuthority: false,
            });
            proofs.set(evidence, {
              owner: verifier,
              context,
              kind,
              hash,
              body,
              signers: Object.freeze(confirmed),
              current,
            });
            return evidence;
          } finally {
            owned.forEach((bytes) => bytes.fill(0));
            active = undefined;
            busy = false;
          }
        });
      },
      close,
    });
    lifetimes.set(verifier, current);
    subscriptions.set(verifier, (onRevoked) => {
      current();
      dependents.add(onRevoked);
      return () => {
        dependents.delete(onRevoked);
      };
    });
    current();
    return { ok: true, value: verifier };
  } catch (error) {
    return failure(codeOf(error));
  }
}
export function sameContext(a: CourierContext, b: CourierContext): boolean {
  return (
    a.shipmentId === b.shipmentId &&
    a.termsHash === b.termsHash &&
    sameBinding(a.binding, b.binding)
  );
}
