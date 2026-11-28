/** CIT-07/08 private G02 consumer. Local record format only, not a message/signature or hardware profile. */
import {
  decodeBase64url,
  encodeBase64url,
  parseStrictJsonBytes,
  type VaultService,
  type VaultSession,
  type VaultSessionAuthority,
  type VaultSessionLease,
  type Result,
} from "../../schemas/index.ts";
import {
  evidenceOf,
  assertVerifierCurrent,
  observeVerifier,
  type CourierVerifier,
  type CourierEvidence,
} from "./verification.ts";
import { commitContainerOpening } from "./commitment.ts";
import {
  data,
  list,
  text,
  hex,
  integer,
  increment,
  unique,
  canonical,
  asyncResult,
  result,
  stop,
  failure,
  codeOf,
  type CourierResult,
} from "./shared.ts";
type SecretState = "provisioned" | "disclosed" | "compromised" | "retired";
interface Entry {
  generation: number;
  commitment: string;
  secret: string | null;
  state: SecretState;
  authorizedReaders: readonly string[];
  expiresAt: number;
}
interface Ledger {
  format: "p2p-offramp/courier-container-local/v1";
  shipmentId: string;
  containerId: string;
  entries: Entry[];
  reveals: { generation: number; reader: string; at: number }[];
}
type VaultPort = Pick<VaultService, "read" | "commit"> & VaultSessionAuthority;
export interface ContainerSecretView {
  readonly generation: number;
  readonly commitment: string;
  readonly state: SecretState;
  readonly expiresAt: number;
  readonly expired: boolean;
  readonly revealCount: number;
  readonly physicalContentsVerified: false;
  readonly economicAuthority: false;
}
export interface ContainerSecretsOptions {
  readonly vault: VaultPort;
  readonly session: VaultSession;
  readonly recordId: string;
  readonly verifier: CourierVerifier;
  readonly containerId: string;
  readonly creator: string;
  readonly generationFloor: number;
  /** Owns the canonical origin/profile/slot and independently current signed generation head. No default is inferred. */
  readonly isOwnerCurrent: () => boolean;
  readonly isInCustody: () => boolean;
  readonly nowSeconds: () => number;
  /** Trusted actual publication observation; a signed blob alone is not proof of prior publication. */
  readonly confirmPublished: (evidence: CourierEvidence) => boolean;
}
export interface ContainerSecrets {
  inspect(): Promise<CourierResult<ContainerSecretView | null>>;
  provision(
    authorizedReaders: readonly string[],
    expiresAt: number,
  ): Promise<CourierResult<ContainerSecretView>>;
  reveal(
    reader: string,
    published: CourierEvidence,
  ): Promise<CourierResult<Uint8Array<ArrayBuffer>>>;
  reportCompromise(): Promise<CourierResult<ContainerSecretView>>;
  retire(): Promise<CourierResult<ContainerSecretView>>;
  release(buffer: Uint8Array): void;
  close(): void;
}
const FORMAT = "p2p-offramp/courier-container-local/v1",
  MAX_BYTES = 128 * 1024;
function unwrap<T>(value: Result<T>): T {
  if (value.ok) return value.value;
  return stop(
    value.error.code === "LOCKED"
      ? "LOCKED"
      : value.error.code === "CONFLICT"
        ? "CONFLICT"
        : value.error.code === "CANCELLED"
          ? "CANCELLED"
          : "UNAVAILABLE",
  );
}
export function createContainerSecrets(
  options: ContainerSecretsOptions,
): CourierResult<ContainerSecrets> {
  let lease: VaultSessionLease | undefined,
    stopObserving: (() => void) | undefined;
  try {
    const { vault, verifier } = options;
    assertVerifierCurrent(verifier);
    const recordId =
      typeof options.recordId === "string" &&
      /^[0-9a-f]{32}$/.test(options.recordId)
        ? options.recordId
        : stop();
    const containerId = hex(options.containerId),
      shipmentId = verifier.context.shipmentId,
      creator = text(verifier.profile.parseKey(options.creator), 512);
    let floor = integer(options.generationFloor);
    const owner = options.isOwnerCurrent,
      custody = options.isInCustody,
      clock = options.nowSeconds,
      publishedPort = options.confirmPublished;
    if (
      typeof owner !== "function" ||
      typeof custody !== "function" ||
      typeof clock !== "function" ||
      typeof publishedPort !== "function" ||
      !vault ||
      typeof vault.captureSession !== "function" ||
      typeof vault.read !== "function" ||
      typeof vault.commit !== "function"
    )
      return failure("MALFORMED");
    let closed = false,
      busy = false,
      lastTime = -1;
    const rawBuffers = new Set<Uint8Array>(),
      revealed = new Map<string, Uint8Array<ArrayBuffer>>();
    let active: AbortController | undefined;
    const wipeReveals = () => {
      for (const b of revealed.values()) b.fill(0);
      revealed.clear();
    };
    const close = () => {
      closed = true;
      active?.abort();
      for (const b of rawBuffers) b.fill(0);
      rawBuffers.clear();
      wipeReveals();
      lease?.dispose();
      stopObserving?.();
    };
    lease = unwrap(vault.captureSession(options.session, close));
    stopObserving = observeVerifier(verifier, close);
    const guard = (revision?: number) => {
      if (closed || active?.signal.aborted) return stop("LOCKED");
      try {
        assertVerifierCurrent(verifier);
      } catch {
        close();
        return stop("LOCKED");
      }
      let current = false;
      try {
        current = owner() === true;
      } catch {}
      if (!current) {
        close();
        return stop("LOCKED");
      }
      const session = lease!.current();
      if (!session) {
        close();
        return stop("LOCKED");
      }
      if (revision !== undefined && session.revision !== revision)
        return stop("CONFLICT");
      return session;
    };
    const now = () => {
      const n = integer(clock());
      guard();
      if (n < lastTime) return stop("CLOCK_UNCERTAIN");
      lastTime = n;
      return n;
    };
    const parseLedger = (bytes: Uint8Array): Ledger => {
      const r = data(parseStrictJsonBytes(bytes, MAX_BYTES), [
        "format",
        "shipmentId",
        "containerId",
        "entries",
        "reveals",
      ]);
      if (
        r.format !== FORMAT ||
        r.shipmentId !== shipmentId ||
        r.containerId !== containerId
      )
        return stop("CONFLICT");
      const entries = list(r.entries, 16).map((raw) => {
        const e = data(raw, [
            "generation",
            "commitment",
            "secret",
            "state",
            "authorizedReaders",
            "expiresAt",
          ]),
          state = e.state;
        if (
          !["provisioned", "disclosed", "compromised", "retired"].includes(
            state as string,
          )
        )
          return stop();
        const readers = unique(
          list(e.authorizedReaders, 4).map((k) =>
            text(verifier.profile.parseKey(k), 512),
          ),
        );
        if (!readers.length) return stop();
        const secret = e.secret === null ? null : hex(e.secret);
        if (
          (state === "provisioned" || state === "disclosed") &&
          secret === null
        )
          return stop("UNAVAILABLE");
        if ((state === "compromised" || state === "retired") && secret !== null)
          return stop("CONFLICT");
        return {
          generation: integer(e.generation),
          commitment: hex(e.commitment),
          secret,
          state: state as SecretState,
          authorizedReaders: readers,
          expiresAt: integer(e.expiresAt),
        };
      });
      if (
        !entries.length ||
        entries.some(
          (e, i) => i > 0 && e.generation <= entries[i - 1]!.generation,
        ) ||
        entries.slice(0, -1).some((e) => e.state !== "retired")
      )
        return stop("CONFLICT");
      if (entries.at(-1)!.generation !== floor) return stop("CONFLICT");
      const reveals = list(r.reveals, 128).map((raw) => {
        const q = data(raw, ["generation", "reader", "at"]),
          generation = integer(q.generation),
          reader = text(verifier.profile.parseKey(q.reader), 512),
          at = integer(q.at),
          entry = entries.find((e) => e.generation === generation);
        if (
          !entry ||
          !entry.authorizedReaders.includes(reader) ||
          at >= entry.expiresAt
        )
          return stop("CONFLICT");
        return { generation, reader, at };
      });
      return { format: FORMAT, shipmentId, containerId, entries, reveals };
    };
    const load = async (revision: number): Promise<Ledger | null> => {
      const row = unwrap(await vault.read(guard(revision).sessionId, recordId));
      guard(revision);
      if (row === null) {
        if (floor !== 0) return stop("MISSING_DEPENDENCY");
        return null;
      }
      const r = data(row, ["id", "kind", "schemaVersion", "payload"]);
      if (
        r.id !== recordId ||
        r.kind !== "trade" ||
        r.schemaVersion !== 1 ||
        typeof r.payload !== "string"
      )
        return stop("CONFLICT");
      const bytes = decodeBase64url(r.payload, 1, MAX_BYTES);
      rawBuffers.add(bytes);
      const ledger = parseLedger(bytes),
        entry = ledger.entries.at(-1)!;
      if (entry.secret !== null) {
        const checked = await commitContainerOpening({
          shipmentId,
          containerId,
          generation: entry.generation,
          secret: entry.secret,
        });
        guard(revision);
        if (!checked.ok) return stop(checked.code);
        if (checked.value !== entry.commitment) return stop("CONFLICT");
      }
      return ledger;
    };
    const persist = async (
      ledger: Ledger,
      revision: number,
      assertAllowed: () => void = () => undefined,
    ) => {
      const bytes = new TextEncoder().encode(canonical(ledger));
      rawBuffers.add(bytes);
      if (bytes.length > MAX_BYTES) return stop("LIMIT_EXCEEDED");
      const payload = encodeBase64url(bytes);
      assertAllowed();
      guard(revision);
      await vault
        .commit(
          guard(revision).sessionId,
          revision,
          [
            {
              op: "put",
              record: {
                id: recordId,
                kind: "trade",
                schemaVersion: 1,
                payload,
              },
            },
          ],
          active?.signal,
          () => {
            guard(revision);
            assertAllowed();
            guard(revision);
          },
        )
        .then(unwrap);
      guard();
      assertAllowed();
      guard();
    };
    const unexpired = (entry: Entry) => {
      const at = now();
      if (at >= entry.expiresAt) {
        wipeReveals();
        return stop("EXPIRED");
      }
      return at;
    };
    const requireNoCustody = () => {
      const value = custody();
      guard();
      if (value !== false) return stop("CONFLICT");
    };
    const view = (ledger: Ledger): ContainerSecretView => {
      const e = ledger.entries.at(-1)!,
        expired = now() >= e.expiresAt;
      if (expired) wipeReveals();
      return Object.freeze({
        generation: e.generation,
        commitment: e.commitment,
        state: e.state,
        expiresAt: e.expiresAt,
        expired,
        revealCount: ledger.reveals.length,
        physicalContentsVerified: false,
        economicAuthority: false,
      });
    };
    const run = <T>(work: (revision: number) => Promise<T>) =>
      asyncResult(async () => {
        if (busy) return stop("CONFLICT");
        busy = true;
        active = new AbortController();
        try {
          const session = guard();
          const value = await work(session.revision);
          guard();
          return value;
        } finally {
          for (const b of rawBuffers) b.fill(0);
          rawBuffers.clear();
          active = undefined;
          busy = false;
        }
      });
    const service: ContainerSecrets = Object.freeze({
      inspect: () =>
        run(async (revision) => {
          const ledger = await load(revision);
          return ledger === null ? null : view(ledger);
        }),
      provision: (authorizedReaders: readonly string[], expiresAt: number) =>
        run(async (revision) => {
          const readers = unique(
              list(authorizedReaders, 4).map((k) =>
                text(verifier.profile.parseKey(k), 512),
              ),
            ),
            expiry = integer(expiresAt);
          if (!readers.length || expiry <= now()) return stop("EXPIRED");
          requireNoCustody();
          const existing = await load(revision);
          requireNoCustody();
          if (existing && existing.entries.at(-1)!.state !== "retired")
            return stop("CONFLICT");
          if (existing && existing.entries.length >= 16)
            return stop("LIMIT_EXCEEDED");
          const generation = increment(floor),
            secret = new Uint8Array(32);
          rawBuffers.add(secret);
          if (typeof globalThis.crypto?.getRandomValues !== "function")
            return stop("UNAVAILABLE");
          try {
            globalThis.crypto.getRandomValues(secret);
          } catch {
            return stop("UNAVAILABLE");
          }
          guard(revision);
          const secretHex = Array.from(secret, (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
          const commitment = await commitContainerOpening({
            shipmentId,
            containerId,
            generation,
            secret: secretHex,
          });
          guard(revision);
          requireNoCustody();
          if (!commitment.ok) return stop(commitment.code);
          const ledger: Ledger = existing ?? {
            format: FORMAT,
            shipmentId,
            containerId,
            entries: [],
            reveals: [],
          };
          ledger.entries.push({
            generation,
            commitment: commitment.value,
            secret: secretHex,
            state: "provisioned",
            authorizedReaders: readers,
            expiresAt: expiry,
          });
          await persist(ledger, revision, requireNoCustody);
          floor = generation;
          wipeReveals();
          return view(ledger);
        }),
      reveal: (reader: string, published: CourierEvidence) =>
        run(async (revision) => {
          const who = text(verifier.profile.parseKey(reader), 512),
            ledger = await load(revision);
          if (!ledger) return stop("MISSING_DEPENDENCY");
          const e = ledger.entries.at(-1)!;
          if (!e.authorizedReaders.includes(who)) return stop("UNAUTHORIZED");
          unexpired(e);
          if (
            !["provisioned", "disclosed"].includes(e.state) ||
            e.secret === null
          )
            return stop("UNAVAILABLE");
          const proof = evidenceOf(published, verifier, "commitment"),
            p = proof.body;
          if (
            p.containerId !== containerId ||
            p.generation !== e.generation ||
            p.commitment !== e.commitment ||
            p.creator !== creator ||
            !proof.signers.includes(creator)
          )
            return stop("UNAUTHORIZED");
          if (publishedPort(published) !== true)
            return stop("MISSING_DEPENDENCY");
          guard(revision);
          if (ledger.reveals.length >= 128) return stop("LIMIT_EXCEEDED");
          const bytes = Uint8Array.from(e.secret.match(/../g)!, (b) =>
            parseInt(b, 16),
          );
          rawBuffers.add(bytes);
          e.state = "disclosed";
          ledger.reveals.push({
            generation: e.generation,
            reader: who,
            at: unexpired(e),
          });
          await persist(ledger, revision);
          guard();
          unexpired(e);
          revealed.get(who)?.fill(0);
          revealed.set(who, bytes);
          rawBuffers.delete(bytes);
          return bytes;
        }),
      reportCompromise: () =>
        run(async (revision) => {
          const ledger = await load(revision);
          if (!ledger) return stop("MISSING_DEPENDENCY");
          const e = ledger.entries.at(-1)!;
          if (e.state === "retired") return stop("CONFLICT");
          e.state = "compromised";
          e.secret = null;
          wipeReveals();
          await persist(ledger, revision);
          return view(ledger);
        }),
      retire: () =>
        run(async (revision) => {
          const ledger = await load(revision);
          if (!ledger) return stop("MISSING_DEPENDENCY");
          const e = ledger.entries.at(-1)!;
          if (e.state === "retired") return stop("CONFLICT");
          e.state = "retired";
          e.secret = null;
          wipeReveals();
          await persist(ledger, revision);
          return view(ledger);
        }),
      release(buffer: Uint8Array) {
        for (const [key, value] of revealed)
          if (value === buffer) {
            value.fill(0);
            revealed.delete(key);
          }
      },
      close,
    });
    guard();
    return { ok: true, value: service };
  } catch (error) {
    lease?.dispose();
    stopObserving?.();
    return failure(codeOf(error));
  }
}
