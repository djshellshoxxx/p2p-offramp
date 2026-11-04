/** Local inspection only. No connection, gathering, TURN client or route authority. */
import { data, integer, list, codeOf, stop } from "./shared.ts";
type Code =
  | "CANDIDATE_REJECTED"
  | "TURN_UNCONFIGURED"
  | "TURN_EXPIRED"
  | "ROUTING_UNSUPPORTED";
export type RtcResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Readonly<{ code: Code }> }>;
const wrap = <T>(work: () => T, fallback: Code): RtcResult<T> => {
  try {
    return Object.freeze({ ok: true, value: work() });
  } catch (error) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: codeOf(error) === "EXPIRED" ? "TURN_EXPIRED" : fallback,
      }),
    });
  }
};
const ascii = (v: unknown, max: number) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  /^[\x20-\x7e]+$/.test(v)
    ? v
    : stop();
const num = (v: string, max: number, min = 0) =>
  /^(0|[1-9][0-9]*)$/.test(v) ? integer(Number(v), min, max) : stop();
function ip(v: string): boolean {
  if (/^[0-9.]+$/.test(v)) {
    const p = v.split(".");
    return (
      p.length === 4 &&
      p.every((o) => /^(0|[1-9][0-9]{0,2})$/.test(o) && Number(o) <= 255)
    );
  }
  if (
    !/^[0-9a-fA-F:.]+$/.test(v) ||
    v.includes(":::") ||
    v.split("::").length > 2
  )
    return false;
  let s = v;
  if (v.includes(".")) {
    const at = v.lastIndexOf(":");
    if (at < 0 || !ip(v.slice(at + 1))) return false;
    s = v.slice(0, at) + ":0:0";
  }
  const parts = s.split(":").filter(Boolean);
  if (parts.some((p) => !/^[0-9a-fA-F]{1,4}$/.test(p))) return false;
  return s.includes("::")
    ? parts.length < 8
    : parts.length === 8 && s[0] !== ":" && !s.endsWith(":");
}
export interface RelayCandidate {
  readonly type: "relay";
  readonly transport: "udp" | "tcp";
  readonly component: number;
  readonly routeVerified: false;
}
function candidate(input: unknown): RelayCandidate {
  const s = ascii(input, 2048),
    f = s.split(" ");
  if (
    f.some((x) => !x) ||
    f.length < 8 ||
    (f.length - 8) % 2 ||
    !/^candidate:[A-Za-z0-9+/]{1,32}$/.test(f[0]!)
  )
    return stop();
  const component = num(f[1]!, 256, 1),
    transport = f[2]!.toLowerCase();
  if (transport !== "udp" && transport !== "tcp") return stop();
  num(f[3]!, 0xffffffff, 1);
  if (!ip(f[4]!)) return stop();
  num(f[5]!, 65535, 1);
  if (f[6] !== "typ" || f[7] !== "relay") return stop();
  const seen = new Set<string>();
  for (let n = 8; n < f.length; n += 2) {
    const k = f[n]!,
      v = f[n + 1]!;
    if (seen.has(k)) return stop();
    seen.add(k);
    if (k === "raddr") {
      if (v !== "0.0.0.0" && v !== "::") return stop();
    } else if (k === "rport") {
      if (v !== "0") return stop();
    } else if (k === "tcptype") {
      if (transport !== "tcp" || !["active", "passive", "so"].includes(v))
        return stop();
    } else if (["generation", "network-id", "network-cost"].includes(k))
      num(v, Number.MAX_SAFE_INTEGER);
    else if (k === "ufrag") {
      if (!/^[A-Za-z0-9+/]{1,256}$/.test(v)) return stop();
    } else return stop();
  }
  if (
    seen.has("raddr") !== seen.has("rport") ||
    (transport === "tcp" && !seen.has("tcptype"))
  )
    return stop();
  return Object.freeze({
    type: "relay",
    transport,
    component,
    routeVerified: false,
  });
}
export const inspectRelayCandidate = (
  input: unknown,
): RtcResult<RelayCandidate> =>
  wrap(() => candidate(input), "CANDIDATE_REJECTED");
export function inspectRelaySdp(
  input: unknown,
): RtcResult<Readonly<{ candidateCount: number; routeVerified: false }>> {
  return wrap(() => {
    if (
      typeof input !== "string" ||
      input.length > 65536 ||
      new TextEncoder().encode(input).length > 65536 ||
      /[^\x20-\x7e\r\n]/.test(input)
    )
      return stop();
    const lines = (input.endsWith("\r\n") ? input.slice(0, -2) : input).split(
      "\r\n",
    );
    if (
      lines.length > 512 ||
      lines.length < 5 ||
      lines.some((l) => !l || l.length > 2048 || /[\r\n]/.test(l))
    )
      return stop();
    let count = 0,
      media = 0;
    const required = new Set<string>(),
      singular = new Set<string>();
    for (const line of lines) {
      const label = line.startsWith("a=")
        ? line.split(":")[0]!
        : line.slice(0, 2);
      if (!line.startsWith("a=candidate:")) {
        if (singular.has(label)) return stop();
        singular.add(label);
      }
      if (line === "v=0") {
        if (required.has("v")) return stop();
        required.add("v");
      } else if (
        /^o=- [0-9]{1,30} [0-9]{1,30} IN (IP4 0\.0\.0\.0|IP6 ::)$/.test(line)
      )
        required.add("o");
      else if (line === "s=-") required.add("s");
      else if (line === "t=0 0") required.add("t");
      else if (
        /^m=application (9|0) (UDP\/DTLS\/SCTP|TCP\/DTLS\/SCTP) webrtc-datachannel$/.test(
          line,
        )
      ) {
        if (++media > 1) return stop();
      } else if (/^c=IN (IP4 0\.0\.0\.0|IP6 ::)$/.test(line)) continue;
      else if (line.startsWith("a=candidate:")) {
        candidate(line.slice(2));
        if (++count > 32) return stop();
      } else if (
        /^a=(mid:[A-Za-z0-9_-]{1,32}|group:BUNDLE [A-Za-z0-9_-]{1,32}|ice-ufrag:[A-Za-z0-9+/]{1,256}|ice-pwd:[A-Za-z0-9+/]{22,256}|fingerprint:sha-256 ([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}|setup:(actpass|active|passive)|ice-options:trickle|end-of-candidates)$/.test(
          line,
        )
      )
        continue;
      else if (/^a=(sctp-port|max-message-size):[0-9]{1,10}$/.test(line))
        num(
          line.slice(line.lastIndexOf(":") + 1),
          line.startsWith("a=sctp-port:") ? 65535 : 0xffffffff,
        );
      else return stop();
    }
    if (required.size !== 4 || media !== 1) return stop();
    return Object.freeze({ candidateCount: count, routeVerified: false });
  }, "CANDIDATE_REJECTED");
}
/** Caller-owned diagnostic template; it derives no allowlist, coverage or construction approval. */
export function relayConfigurationTemplate(
  input: unknown,
  nowMs: number,
): RtcResult<
  Readonly<{
    configuration: Readonly<RTCConfiguration>;
    constructionAllowed: false;
    routeVerified: false;
  }>
> {
  return wrap(() => {
    const r = data(input, ["urls", "username", "credential", "expiresAtMs"]);
    if (integer(r.expiresAtMs) <= integer(nowMs)) return stop("EXPIRED");
    const urls = list(r.urls, 4).map((raw) => {
      const url = ascii(raw, 512);
      if (
        !/^turns?:[A-Za-z0-9.-]{1,253}:[0-9]{1,5}\?transport=(udp|tcp)$/.test(
          url,
        )
      )
        return stop();
      num(url.match(/:([0-9]+)\?/)![1]!, 65535, 1);
      return url;
    });
    if (!urls.length || new Set(urls).size !== urls.length) return stop();
    const server = {
      urls,
      username: ascii(r.username, 128),
      credential: ascii(r.credential, 256),
    };
    Object.freeze(urls);
    Object.freeze(server);
    const iceServers = [server];
    Object.freeze(iceServers);
    const configuration = Object.freeze({
      iceTransportPolicy: "relay" as const,
      iceServers,
    });
    return Object.freeze({
      configuration,
      constructionAllowed: false,
      routeVerified: false,
    });
  }, "TURN_UNCONFIGURED");
}
export function rtcAvailability(
  input: unknown,
): RtcResult<
  Readonly<{
    constructionAllowed: false;
    coreManualAvailable: true;
    reason: "disabled" | "TURN_UNCONFIGURED" | "ROUTING_UNSUPPORTED";
  }>
> {
  return wrap(() => {
    const r = data(input, ["policy", "strictPrivate"]);
    if (
      !["disabled", "relay-only", "direct-consented"].includes(
        r.policy as string,
      ) ||
      typeof r.strictPrivate !== "boolean"
    )
      return stop();
    return Object.freeze({
      constructionAllowed: false,
      coreManualAvailable: true,
      reason:
        r.policy === "disabled"
          ? "disabled"
          : r.strictPrivate || r.policy === "direct-consented"
            ? "ROUTING_UNSUPPORTED"
            : "TURN_UNCONFIGURED",
    });
  }, "ROUTING_UNSUPPORTED");
}
export function assessSelectedPair(
  input: unknown,
): RtcResult<
  Readonly<{
    visibility: "unknown" | "relay-observed";
    mustClose: boolean;
    routeVerified: false;
  }>
> {
  return wrap(() => {
    if (input === null)
      return Object.freeze({
        visibility: "unknown",
        mustClose: false,
        routeVerified: false,
      });
    const r = data(input, ["local", "remote"]);
    if (
      !["relay", "host", "srflx", "prflx"].includes(r.local as string) ||
      !["relay", "host", "srflx", "prflx"].includes(r.remote as string)
    )
      return stop();
    const relay = r.local === "relay" && r.remote === "relay";
    return Object.freeze({
      visibility: relay ? "relay-observed" : "unknown",
      mustClose: !relay,
      routeVerified: false,
    });
  }, "CANDIDATE_REJECTED");
}
