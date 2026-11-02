/** Internal local policy discipline. No sensor, route, proof or economic authority. */
import {
  parseTradeBinding,
  type TradeBinding,
  parseStrictJsonBytes,
  type VaultService,
  type VaultSession,
  type VaultSessionAuthority,
  type VaultSessionLease,
  decodeBase64url,
  encodeBase64url,
} from "../../schemas/index.ts";
import { sha256Hex } from "../../domain/index.ts";
import {
  data,
  hex,
  integer,
  list,
  codeOf as sharedCode,
  type MeetupErrorCode,
} from "./shared.ts";
export type PolicyCode =
  | MeetupErrorCode
  | "BAD_SIGNATURE"
  | "UNTRUSTED_PUBLISHER"
  | "UNSUPPORTED_LICENSE"
  | "REVISION_CONFLICT"
  | "MAP_UNCONFIGURED"
  | "HASH_MISMATCH"
  | "BUDGET_EXCEEDED"
  | "ROUTING_UNSUPPORTED"
  | "OUTSIDE_BUNDLE";
export type PolicyResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Readonly<{ code: PolicyCode }> }>;
const errors = new WeakMap<object, PolicyCode>();
export const policyStop = (code: PolicyCode = "INVALID_INPUT"): never => {
  const e = new Error("Optional meetup operation refused.");
  errors.set(e, code);
  throw e;
};
const code = (e: unknown): PolicyCode =>
  typeof e === "object" && e !== null
    ? (errors.get(e) ?? sharedCode(e))
    : "INVALID_INPUT";
export const policyFailure = (c: PolicyCode): PolicyResult<never> =>
  Object.freeze({ ok: false, error: Object.freeze({ code: c }) });
export function policyResult<T>(work: () => T): PolicyResult<T> {
  try {
    return Object.freeze({ ok: true, value: work() });
  } catch (e) {
    return policyFailure(code(e));
  }
}
export interface PolicyScope {
  readonly binding: TradeBinding;
  readonly tradeHash: string;
  readonly termsHash: string;
  readonly accountKey: string;
  readonly peerKey: string;
}
export function parsePolicyScope(input: unknown): PolicyScope {
  const s = data(input, [
      "binding",
      "tradeHash",
      "termsHash",
      "accountKey",
      "peerKey",
    ]),
    out = Object.freeze({
      binding: parseTradeBinding(s.binding),
      tradeHash: hex(s.tradeHash, 64),
      termsHash: hex(s.termsHash, 64),
      accountKey: hex(s.accountKey, 64),
      peerKey: hex(s.peerKey, 64),
    });
  if (out.accountKey === out.peerKey) return policyStop();
  return out;
}
export function policyText(v: unknown, max: number, empty = false): string {
  if (
    typeof v !== "string" ||
    v.length > max ||
    (!empty && !v.length) ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(
      v,
    ) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      v,
    )
  )
    return policyStop();
  return v;
}
/** RFC8785 subset for detached fixed schemas; safe integers include negative public coordinates. */
export function policyCanonical(v: unknown): string {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) return policyStop();
    return JSON.stringify(v);
  }
  if (typeof v === "string") {
    policyText(v, 2 * 1024 * 1024, true);
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map(policyCanonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            policyCanonical((v as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return policyStop();
}
export const policyBytes = (v: unknown): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(policyCanonical(v));
const base = Object.getPrototypeOf(Uint8Array.prototype),
  lengthGetter = Object.getOwnPropertyDescriptor(base, "byteLength")!.get!,
  bufferGetter = Object.getOwnPropertyDescriptor(base, "buffer")!.get!;
export function policyCopy(
  input: unknown,
  max: number,
): Uint8Array<ArrayBuffer> {
  const n = Reflect.apply(lengthGetter, input, []) as number,
    b = Reflect.apply(bufferGetter, input, []) as unknown;
  if (!Number.isSafeInteger(n) || n < 0 || n > max)
    return policyStop("CAPACITY_EXCEEDED");
  if (!(b instanceof ArrayBuffer)) return policyStop();
  const copy = new Uint8Array(n);
  copy.set(input as Uint8Array);
  return copy;
}
export const policyJson = (b: Uint8Array, max: number): unknown =>
  parseStrictJsonBytes(b, max);
export function assertPolicyCanonical(b: Uint8Array, v: unknown): void {
  const e = policyBytes(v);
  try {
    if (e.length !== b.length || e.some((x, i) => x !== b[i]))
      return policyStop();
  } finally {
    e.fill(0);
  }
}
export function createPolicyOwner(
  scopeInput: unknown,
  isCurrent: (scope: PolicyScope) => boolean,
  operationMs = 5000,
) {
  integer(operationMs, 1, 30000);
  const scope = parsePolicyScope(scopeInput);
  if (typeof isCurrent !== "function") return policyStop();
  let closed = false,
    busy = false,
    active: AbortController | undefined;
  const buffers = new Set<Uint8Array>(),
    listeners = new Set<() => void>();
  const close = () => {
    if (closed) return;
    closed = true;
    active?.abort();
    for (const b of buffers) b.fill(0);
    buffers.clear();
    for (const f of listeners) {
      try {
        f();
      } catch {}
    }
    listeners.clear();
  };
  const guard = () => {
    if (closed) return policyStop("LOCKED");
    let good = false;
    try {
      good = isCurrent(scope) === true;
    } catch {}
    if (closed || !good) {
      close();
      return policyStop("LOCKED");
    }
  };
  const own = (b: Uint8Array<ArrayBuffer>) => {
      buffers.add(b);
      try {
        guard();
      } catch (error) {
        b.fill(0);
        buffers.delete(b);
        throw error;
      }
      return b;
    },
    release = (b: Uint8Array) => {
      b.fill(0);
      buffers.delete(b);
    };
  const run = async <T>(
    work: (signal: AbortSignal) => Promise<T>,
    assertPublication: () => void = () => undefined,
  ): Promise<PolicyResult<T>> => {
    if (busy) return policyFailure("CONFLICT");
    busy = true;
    const control = new AbortController();
    active = control;
    let timer: ReturnType<typeof setTimeout> | undefined,
      abort: (() => void) | undefined;
    try {
      guard();
      const cancellation = new Promise<never>((_, reject) => {
          abort = () => {
            try {
              policyStop("LOCKED");
            } catch (e) {
              reject(e);
            }
          };
          control.signal.addEventListener("abort", abort, { once: true });
        }),
        deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            try {
              policyStop("TIMEOUT");
            } catch (e) {
              reject(e);
            }
            close();
          }, operationMs);
        });
      const value = await Promise.race([
        Promise.resolve().then(() => {
          guard();
          return work(control.signal);
        }),
        cancellation,
        deadline,
      ]);
      guard();
      assertPublication();
      if (closed) return policyStop("LOCKED");
      return Object.freeze({ ok: true, value });
    } catch (e) {
      return policyFailure(code(e));
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abort) control.signal.removeEventListener("abort", abort);
      for (const b of buffers) b.fill(0);
      buffers.clear();
      active = undefined;
      busy = false;
    }
  };
  guard();
  return Object.freeze({
    scope,
    guard,
    own,
    release,
    run,
    close,
    onClose: (f: () => void) => {
      guard();
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
  });
}
export type PolicyOwner = ReturnType<typeof createPolicyOwner>;
export interface PolicyVaultOptions {
  readonly vault: Pick<VaultService, "read" | "commit"> & VaultSessionAuthority;
  readonly session: VaultSession;
  readonly recordId: string;
  /** Actual current canonical profile/slot owner; no global rollback proof is inferred from a backup. */ readonly isStorageCurrent: () => boolean;
}
/** Chunked purpose-owned G02 preferences; one atomic native CAS, never an overwrite of foreign rows. */
export function createPolicyVault(
  owner: PolicyOwner,
  options: PolicyVaultOptions,
) {
  const { vault, session } = options,
    id = hex(options.recordId, 32),
    current = options.isStorageCurrent,
    FORMAT = "p2p-offramp/meetup-local-parts/v1",
    LIMIT = 2 * 1024 * 1024,
    PART = 96 * 1024;
  let lease: VaultSessionLease | undefined,
    lastParts: readonly string[] | null = null;
  const unwrap = <T>(
    r: { ok: true; value: T } | { ok: false; error: { code: string } },
  ): T =>
    r.ok
      ? r.value
      : policyStop(
          r.error.code === "LOCKED"
            ? "LOCKED"
            : r.error.code === "CONFLICT"
              ? "CONFLICT"
              : r.error.code === "CANCELLED"
                ? "CANCELLED"
                : "LEDGER_UNAVAILABLE",
        );
  const guard = (revision?: number) => {
    owner.guard();
    if (current() !== true) {
      owner.close();
      return policyStop("LOCKED");
    }
    owner.guard();
    const s = lease?.current();
    if (!s) return policyStop("LOCKED");
    if (revision !== undefined && s.revision !== revision)
      return policyStop("CONFLICT");
    return s;
  };
  const decode = (payload: string, max: number) => {
    const raw = decodeBase64url(payload, 1, max);
    try {
      return owner.own(policyCopy(raw, max));
    } finally {
      raw.fill(0);
    }
  };
  const digest = async (bytes: Uint8Array<ArrayBuffer>) => {
    const hash = await sha256Hex(bytes);
    owner.guard();
    return hash;
  };
  const partId = async (index: number) => {
    const bytes = owner.own(
      new TextEncoder().encode(FORMAT + "/" + id + "/" + index),
    );
    return (await digest(bytes)).slice(0, 32);
  };
  const row = async (recordId: string, revision: number) => {
    const r = unwrap(await vault.read(guard(revision).sessionId, recordId));
    guard(revision);
    if (r === null) return null;
    const p = data(r, ["id", "kind", "schemaVersion", "payload"]);
    if (
      p.id !== recordId ||
      p.kind !== "preference" ||
      p.schemaVersion !== 1 ||
      typeof p.payload !== "string"
    )
      return policyStop("CONFLICT");
    return decode(p.payload, 256 * 1024);
  };
  try {
    if (typeof current !== "function") return policyStop();
    lease = unwrap(vault.captureSession(session, owner.close));
    owner.onClose(() => lease?.dispose());
    guard();
  } catch (e) {
    lease?.dispose();
    throw e;
  }
  return Object.freeze({
    async read() {
      const revision = guard().revision,
        bytes = await row(id, revision);
      if (bytes === null) {
        lastParts = [];
        return { revision, value: null };
      }
      const head = data(policyJson(bytes, 256 * 1024), [
        "format",
        "namespace",
        "length",
        "parts",
      ]);
      if (head.format !== FORMAT || head.namespace !== id)
        return policyStop("CONFLICT");
      const length = integer(head.length, 1, LIMIT),
        refs = list(head.parts, 22),
        output = owner.own(new Uint8Array(length));
      let offset = 0;
      const ids: string[] = [];
      for (let index = 0; index < refs.length; index++) {
        const ref = data(refs[index], ["id", "sha256", "byteLength"]),
          expected = await partId(index);
        guard(revision);
        if (ref.id !== expected || ids.includes(expected))
          return policyStop("CONFLICT");
        ids.push(expected);
        const n = integer(ref.byteLength, 1, PART),
          hash = hex(ref.sha256, 64),
          part = await row(expected, revision);
        if (part === null) return policyStop("LEDGER_UNAVAILABLE");
        const p = data(policyJson(part, 256 * 1024), [
          "format",
          "namespace",
          "index",
          "data",
        ]);
        if (
          p.format !== FORMAT ||
          p.namespace !== id ||
          p.index !== index ||
          typeof p.data !== "string"
        )
          return policyStop("CONFLICT");
        const chunk = decode(p.data, PART);
        if (
          chunk.length !== n ||
          offset + n > length ||
          (await digest(chunk)) !== hash
        )
          return policyStop("INTEGRITY_FAILURE");
        guard(revision);
        output.set(chunk, offset);
        offset += n;
      }
      if (offset !== length) return policyStop("INTEGRITY_FAILURE");
      lastParts = ids;
      return { revision, value: policyJson(output, LIMIT) };
    },
    async write(
      revision: number,
      value: unknown,
      signal: AbortSignal,
      assertAllowed: () => void = () => undefined,
    ) {
      if (lastParts === null) return policyStop("LEDGER_UNAVAILABLE");
      guard(revision);
      const bytes = owner.own(policyBytes(value));
      if (!bytes.length || bytes.length > LIMIT)
        return policyStop("CAPACITY_EXCEEDED");
      const refs: { id: string; sha256: string; byteLength: number }[] = [],
        mutations: {
          op: "put";
          record: {
            id: string;
            kind: "preference";
            schemaVersion: 1;
            payload: string;
          };
        }[] = [];
      for (
        let offset = 0, index = 0;
        offset < bytes.length;
        offset += PART, index++
      ) {
        const chunk = bytes.subarray(
            offset,
            Math.min(offset + PART, bytes.length),
          ),
          recordId = await partId(index),
          hash = await digest(chunk);
        guard(revision);
        if (recordId === id) return policyStop("CONFLICT");
        if (!lastParts.includes(recordId)) {
          const occupied = await row(recordId, revision);
          if (occupied !== null) return policyStop("CONFLICT");
        }
        refs.push({ id: recordId, sha256: hash, byteLength: chunk.length });
        const payload = owner.own(
          policyBytes({
            format: FORMAT,
            namespace: id,
            index,
            data: encodeBase64url(chunk),
          }),
        );
        mutations.push({
          op: "put",
          record: {
            id: recordId,
            kind: "preference",
            schemaVersion: 1,
            payload: encodeBase64url(payload),
          },
        });
      }
      const head = owner.own(
        policyBytes({
          format: FORMAT,
          namespace: id,
          length: bytes.length,
          parts: refs,
        }),
      );
      mutations.push({
        op: "put",
        record: {
          id,
          kind: "preference",
          schemaVersion: 1,
          payload: encodeBase64url(head),
        },
      });
      const removed = lastParts
        .filter((old) => !refs.some((r) => r.id === old))
        .map((recordId) => ({ op: "delete" as const, id: recordId }));
      const s = guard(revision);
      assertAllowed();
      guard(revision);
      unwrap(
        await vault.commit(
          s.sessionId,
          revision,
          [...mutations, ...removed],
          signal,
          () => {
            guard(revision);
            assertAllowed();
            guard(revision);
          },
        ),
      );
      guard();
      assertAllowed();
      guard();
      lastParts = refs.map((r) => r.id);
    },
    guard,
  });
}
