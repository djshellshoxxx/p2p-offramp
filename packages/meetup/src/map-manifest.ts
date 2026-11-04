/** MEET14/15 offline bytes and query projections. No renderer, decoder, cache, gateway or fetch. */
import { sha256Hex } from "../../domain/index.ts";
import { data, list, integer, finite, hex } from "./shared.ts";
import { readConsent, type LocationConsent } from "./consent.ts";
import { validateDiscoveryRegion, decodeGeohash } from "./geohash.ts";
import {
  policyStop,
  policyText,
  policyResult,
  policyCopy,
  policyJson,
  policyBytes,
  assertPolicyCanonical,
  createPolicyOwner,
  type PolicyScope,
  type PolicyResult,
} from "./policy-data.ts";
export const MAP_LIMITS = Object.freeze({
  manifestBytes: 2 * 1024 * 1024,
  entries: 50000,
  compressedBytes: 2 * 1024 * 1024,
  decompressedBytes: 8 * 1024 * 1024,
  features: 100000,
  coordinates: 1000000,
  bundleTiles: 256,
  bundleBytes: 20 * 1024 * 1024,
  concurrency: 2,
  deadlineMs: 60000,
  retries: 1,
});
export interface TileRef {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly sha256: string;
  readonly byteLength: number;
}
export interface MapManifest {
  readonly v: 1;
  readonly datasetId: string;
  readonly version: string;
  readonly grid: "xyz-v1";
  readonly format: "mvt-2.1";
  readonly tiles: readonly TileRef[];
  readonly license: string;
  readonly attribution: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly signature: string;
}
const component = (v: unknown) => {
  const s = policyText(v, 128);
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(s) || s === "." || s === "..")
    return policyStop();
  return s;
};
const ref = (input: unknown): TileRef => {
  const r = data(input, ["z", "x", "y", "sha256", "byteLength"]),
    z = integer(r.z, 0, 14),
    n = 2 ** z;
  return Object.freeze({
    z,
    x: integer(r.x, 0, n - 1),
    y: integer(r.y, 0, n - 1),
    sha256: hex(r.sha256, 64),
    byteLength: integer(r.byteLength, 0, MAP_LIMITS.compressedBytes),
  });
};
function manifest(input: unknown): MapManifest {
  const r = data(input, [
    "v",
    "datasetId",
    "version",
    "grid",
    "format",
    "tiles",
    "license",
    "attribution",
    "issuedAtMs",
    "expiresAtMs",
    "signature",
  ]);
  if (r.v !== 1 || r.grid !== "xyz-v1" || r.format !== "mvt-2.1")
    return policyStop("UNSUPPORTED_VERSION");
  const tiles = list(r.tiles, 50000).map(ref),
    keys = tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
  if (new Set(keys).size !== keys.length) return policyStop();
  const issuedAtMs = integer(r.issuedAtMs),
    expiresAtMs = integer(r.expiresAtMs);
  if (expiresAtMs <= issuedAtMs) return policyStop();
  return Object.freeze({
    v: 1,
    datasetId: component(r.datasetId),
    version: component(r.version),
    grid: "xyz-v1",
    format: "mvt-2.1",
    tiles: Object.freeze(tiles),
    license: policyText(r.license, 128),
    attribution: policyText(r.attribution, 2000),
    issuedAtMs,
    expiresAtMs,
    signature: policyText(r.signature, 2048),
  });
}
export const parseMapManifest = (input: unknown): PolicyResult<MapManifest> =>
  policyResult(() => manifest(input));
export const encodeMapManifest = (
  input: unknown,
): PolicyResult<Uint8Array<ArrayBuffer>> =>
  policyResult(() => {
    const b = policyBytes(manifest(input));
    if (b.length > MAP_LIMITS.manifestBytes) {
      b.fill(0);
      return policyStop("CAPACITY_EXCEEDED");
    }
    return b;
  });
export const mapTileKey = (
  datasetId: unknown,
  version: unknown,
  input: unknown,
): PolicyResult<string> =>
  policyResult(() => {
    const t = ref(input);
    return `${component(datasetId)}/${component(version)}/${t.z}/${t.x}/${t.y}/${t.sha256}`;
  });
/** Wrapping/clipping applies to map display only; it never rewrites a location claim. */
export const xyzForDisplay = (
  lat: number,
  lon: number,
  zoom: number,
): PolicyResult<
  Readonly<{ z: number; x: number; y: number; latitudeClipped: boolean }>
> =>
  policyResult(() => {
    finite(lat, -90, 90);
    finite(lon, -1e9, 1e9);
    const z = integer(zoom, 0, 14),
      n = 2 ** z,
      clipped = Math.min(85.05112878, Math.max(-85.05112878, lat)),
      wrapped = ((((lon + 180) % 360) + 360) % 360) - 180,
      r = (clipped * Math.PI) / 180;
    return Object.freeze({
      z,
      x: Math.min(n - 1, Math.max(0, Math.floor(((wrapped + 180) / 360) * n))),
      y: Math.min(
        n - 1,
        Math.max(
          0,
          Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n),
        ),
      ),
      latitudeClipped: clipped !== lat,
    });
  });
export function checkMapDecodeLimits(input: unknown) {
  return policyResult(() => {
    const r = data(input, [
      "compressedBytes",
      "decompressedBytes",
      "features",
      "coordinates",
    ]);
    integer(r.compressedBytes, 0, MAP_LIMITS.compressedBytes);
    integer(r.decompressedBytes, 0, MAP_LIMITS.decompressedBytes);
    integer(r.features, 0, MAP_LIMITS.features);
    integer(r.coordinates, 0, MAP_LIMITS.coordinates);
    return Object.freeze({
      withinBounds: true as const,
      decodeApproved: false as const,
    });
  });
}
export interface MapEvidence {
  readonly manifestDigest: string;
  readonly datasetId: string;
  readonly version: string;
  readonly tileCount: number;
  readonly expiresAtMs: number;
  readonly attribution: string;
  readonly stale: boolean;
  readonly decodeApproved: false;
  readonly networkExecutionAllowed: false;
}
export interface MapSigningProfile {
  readonly id: string;
  readonly parseSignature: (input: unknown) => string;
  /** Owns exact approved content-registry envelope/signing bytes, never guessed here. */ readonly verify: (
    request: Readonly<{
      canonicalPayload: Uint8Array;
      signature: string;
      signal: AbortSignal;
    }>,
  ) => Promise<boolean>;
}
export interface MapValidationOptions {
  readonly scope: PolicyScope;
  readonly isCurrent: (scope: PolicyScope) => boolean;
  readonly nowMs: () => number;
  readonly licenses: readonly string[];
  readonly lookup: (
    datasetId: string,
    version: string,
  ) => MapSigningProfile | null;
}
export interface MapBundleProjection {
  readonly mode: "offline-bundle" | "consented-gateway";
  readonly manifestDigest: string;
  readonly bundleId: string;
  readonly tiles: readonly TileRef[];
  readonly tileCount: number;
  readonly maxBytes: number;
  readonly consentGeneration: number | null;
  readonly maxConcurrency: 2;
  readonly deadlineMs: 60000;
  readonly retries: 1;
  readonly networkExecutionAllowed: false;
  readonly transportPolicyId: null;
}
export interface MapValidator {
  validate(bytes: unknown): Promise<PolicyResult<MapEvidence>>;
  verifyTile(
    evidence: MapEvidence,
    reference: unknown,
    bytes: unknown,
  ): Promise<
    PolicyResult<
      Readonly<{
        hashVerified: true;
        decodeApproved: false;
        cacheApproved: false;
        tileKey: string;
      }>
    >
  >;
  plan(
    evidence: MapEvidence,
    region: unknown,
    zoom: number,
    mode: "offline-bundle" | "consented-gateway" | "strict-routed",
    consent?: LocationConsent,
  ): Promise<PolicyResult<MapBundleProjection>>;
  close(): void;
}
export function createMapValidator(
  options?: MapValidationOptions,
): PolicyResult<MapValidator> {
  return policyResult(() => {
    if (options === undefined) {
      const unavailable = async () => ({
        ok: false as const,
        error: { code: "MAP_UNCONFIGURED" as const },
      });
      return Object.freeze({
        validate: unavailable,
        verifyTile: unavailable,
        plan: unavailable,
        close() {},
      });
    }
    const owner = createPolicyOwner(options.scope, options.isCurrent),
      clock = options.nowMs,
      lookup = options.lookup,
      licenses = new Set(
        list(options.licenses, 128).map((l) => policyText(l, 128)),
      );
    if (typeof clock !== "function" || typeof lookup !== "function")
      return policyStop();
    const proofs = new WeakMap<object, MapManifest>();
    let lastNow = -1;
    const now = () => {
      const n = integer(clock());
      owner.guard();
      if (n < lastNow) {
        owner.close();
        return policyStop("CLOCK_ROLLBACK");
      }
      lastNow = n;
      return n;
    };
    const body = (e: MapEvidence) => {
      owner.guard();
      const p = typeof e === "object" && e !== null ? proofs.get(e) : undefined;
      if (!p) return policyStop("INTEGRITY_FAILURE");
      return p;
    };
    return Object.freeze({
      close: owner.close,
      validate: (input: unknown) =>
        owner.run(async (signal) => {
          const bytes = owner.own(policyCopy(input, MAP_LIMITS.manifestBytes)),
            p = manifest(policyJson(bytes, MAP_LIMITS.manifestBytes));
          assertPolicyCanonical(bytes, p);
          if (!licenses.has(p.license))
            return policyStop("UNSUPPORTED_LICENSE");
          const selected = lookup(p.datasetId, p.version);
          owner.guard();
          if (selected === null) return policyStop("MAP_UNCONFIGURED");
          const profile = data(selected, ["id", "parseSignature", "verify"]);
          policyText(profile.id, 128);
          if (
            typeof profile.parseSignature !== "function" ||
            typeof profile.verify !== "function"
          )
            return policyStop("MAP_UNCONFIGURED");
          const parseSignature =
              profile.parseSignature as MapSigningProfile["parseSignature"],
            verify = profile.verify as MapSigningProfile["verify"],
            signature = policyText(parseSignature(p.signature), 2048);
          owner.guard();
          const { signature: ignored, ...unsigned } = p,
            payload = owner.own(policyBytes(unsigned));
          if (
            (await verify({ canonicalPayload: payload, signature, signal })) !==
            true
          )
            return policyStop("BAD_SIGNATURE");
          owner.guard();
          const digest = await sha256Hex(bytes);
          owner.guard();
          const current = now();
          if (p.issuedAtMs > current) return policyStop();
          const evidence: MapEvidence = Object.freeze({
            manifestDigest: digest,
            datasetId: p.datasetId,
            version: p.version,
            tileCount: p.tiles.length,
            expiresAtMs: p.expiresAtMs,
            attribution: p.attribution,
            stale: current >= p.expiresAtMs,
            decodeApproved: false,
            networkExecutionAllowed: false,
          });
          proofs.set(evidence, p);
          return evidence;
        }),
      verifyTile: (e: MapEvidence, inputRef: unknown, inputBytes: unknown) =>
        owner.run(async () => {
          const p = body(e),
            r = ref(inputRef),
            known = p.tiles.find(
              (t) => t.z === r.z && t.x === r.x && t.y === r.y,
            );
          if (
            !known ||
            known.sha256 !== r.sha256 ||
            known.byteLength !== r.byteLength
          )
            return policyStop("INTEGRITY_FAILURE");
          const bytes = owner.own(
            policyCopy(inputBytes, MAP_LIMITS.compressedBytes),
          );
          if (
            bytes.length !== r.byteLength ||
            (await sha256Hex(bytes)) !== r.sha256
          )
            return policyStop("HASH_MISMATCH");
          owner.guard();
          now();
          return Object.freeze({
            hashVerified: true as const,
            decodeApproved: false as const,
            cacheApproved: false as const,
            tileKey:
              e.manifestDigest +
              "/" +
              p.datasetId +
              "/" +
              p.version +
              "/" +
              r.z +
              "/" +
              r.x +
              "/" +
              r.y +
              "/" +
              r.sha256,
          });
        }),
      plan: (
        e: MapEvidence,
        inputRegion: unknown,
        zoom: number,
        mode: "offline-bundle" | "consented-gateway" | "strict-routed",
        consent?: LocationConsent,
      ) => {
        let finalConsentSignal: AbortSignal | undefined;
        return owner.run(
          async () => {
            const p = body(e);
            if (mode === "strict-routed")
              return policyStop("ROUTING_UNSUPPORTED");
            if (mode !== "offline-bundle" && mode !== "consented-gateway")
              return policyStop();
            const at = now();
            if (p.expiresAtMs <= at) return policyStop("EXPIRED");
            let consentGeneration: number | null = null;
            if (mode === "consented-gateway") {
              const c = readConsent(consent, "mapFetch");
              owner.guard();
              if (c.tradeHash !== owner.scope.tradeHash)
                return policyStop("CONSENT_REVOKED");
              consentGeneration = c.generation;
              finalConsentSignal = c.signal;
            }
            const parsed = validateDiscoveryRegion(inputRegion, at);
            if (!parsed.ok) return policyStop(parsed.error.code);
            const z = integer(zoom, 10, 14),
              n = 2 ** z,
              xs = new Set<number>(),
              ys = new Set<number>();
            for (const cell of parsed.value.cells) {
              const decoded = decodeGeohash(cell);
              if (!decoded.ok) return policyStop(decoded.error.code);
              const b = decoded.value;
              for (const lat of [b.south, b.north - 1e-12])
                for (const lon of [b.west, b.east - 1e-12]) {
                  const tile = xyzForDisplay(lat, lon, z);
                  if (!tile.ok) return policyStop(tile.error.code);
                  xs.add(tile.value.x);
                  ys.add(tile.value.y);
                }
            }
            const x = Array.from(xs).sort((a, b) => a - b);
            let gap = -1,
              start = 0;
            for (let i = 0; i < x.length; i++) {
              const next =
                  x[(i + 1) % x.length]! + (i === x.length - 1 ? n : 0),
                width = next - x[i]! - 1;
              if (width > gap) {
                gap = width;
                start = next % n;
              }
            }
            const width = n - gap,
              minY = Math.min(...ys),
              maxY = Math.max(...ys),
              tileCount = width * (maxY - minY + 1);
            if (tileCount > 256) return policyStop("BUDGET_EXCEEDED");
            const tiles: TileRef[] = [];
            let total = 0;
            const index = new Map(
              p.tiles.filter((t) => t.z === z).map((t) => [`${t.x}/${t.y}`, t]),
            );
            for (let row = minY; row <= maxY; row++)
              for (let c = 0; c < width; c++) {
                const column = (start + c) % n,
                  t = index.get(`${column}/${row}`);
                if (!t) return policyStop("OUTSIDE_BUNDLE");
                tiles.push(t);
                total += t.byteLength;
              }
            if (total > MAP_LIMITS.bundleBytes)
              return policyStop("BUDGET_EXCEEDED");
            owner.guard();
            const finalNow = now();
            if (
              finalNow >= p.expiresAtMs ||
              finalNow >= parsed.value.expiresAtMs
            )
              return policyStop("EXPIRED");
            if (mode === "consented-gateway") {
              const c = readConsent(consent, "mapFetch");
              owner.guard();
              if (c.generation !== consentGeneration)
                return policyStop("CONSENT_REVOKED");
            }
            return Object.freeze({
              mode,
              manifestDigest: e.manifestDigest,
              bundleId: `${z}/${start}/${minY}/${width}/${maxY - minY + 1}`,
              tiles: Object.freeze(tiles),
              tileCount,
              maxBytes: total,
              consentGeneration,
              maxConcurrency: 2 as const,
              deadlineMs: 60000 as const,
              retries: 1 as const,
              networkExecutionAllowed: false as const,
              transportPolicyId: null,
            });
          },
          () => {
            if (finalConsentSignal?.aborted)
              return policyStop("CONSENT_REVOKED");
          },
        );
      },
    });
  });
}
