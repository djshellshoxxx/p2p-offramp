import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectRelayCandidate,
  inspectRelaySdp,
  relayConfigurationTemplate,
  rtcAvailability,
  assessSelectedPair,
} from "../src/rtc-policy.ts";
const good = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const bad = (r, code) => {
  assert.equal(r.ok, false);
  if (code) assert.equal(r.error.code, code);
};
const v4 =
  "candidate:1 1 udp 1677734911 203.0.113.2 50000 typ relay raddr 0.0.0.0 rport 0 generation 0";
const v6 =
  "candidate:2 1 udp 1677734911 2001:db8::1 50001 typ relay raddr :: rport 0";
const fingerprint = Array(32).fill("AA").join(":");
const sdp = (candidates) =>
  [
    "v=0",
    "o=- 123 2 IN IP4 0.0.0.0",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=mid:0",
    "a=ice-ufrag:ufrag",
    "a=ice-pwd:abcdefghijklmnopqrstuv",
    "a=fingerprint:sha-256 " + fingerprint,
    "a=setup:actpass",
    "a=sctp-port:5000",
    ...candidates.map((c) => "a=" + c),
    "a=end-of-candidates",
  ].join("\r\n") + "\r\n";

test("relay parser accepts bounded IPv4/IPv6 relay syntax while rejecting host/reflexive/mDNS and hidden related addresses", () => {
  for (const candidate of [
    v4,
    v6,
    "candidate:3 1 tcp 1 ::ffff:192.0.2.1 443 typ relay tcptype passive",
  ]) {
    const p = good(inspectRelayCandidate(candidate));
    assert.equal(p.type, "relay");
    assert.equal(p.routeVerified, false);
  }
  for (const candidate of [
    v4.replace("typ relay", "typ host"),
    v4.replace("typ relay", "typ srflx"),
    v4.replace("typ relay", "typ prflx"),
    v4.replace("203.0.113.2", "abcdef.local"),
    v4.replace("raddr 0.0.0.0", "raddr 192.168.1.2"),
    v4.replace("50000", "65536"),
    v6.replace("2001:db8::1", "2001:::1"),
    v6.replace("2001:db8::1", "fe80::1%eth0"),
    v4 + " unknown ip",
    v4 + "\n",
  ])
    bad(inspectRelayCandidate(candidate), "CANDIDATE_REJECTED");
  bad(inspectRelayCandidate("a".repeat(2049)), "CANDIDATE_REJECTED");
});

test("SDP inspection is fail closed for unknown fields, embedded addresses, media and candidate/byte budgets", () => {
  const parsed = good(inspectRelaySdp(sdp([v4, v6])));
  assert.equal(parsed.candidateCount, 2);
  assert.equal(parsed.routeVerified, false);
  for (const body of [
    sdp([v4.replace("typ relay", "typ host")]),
    sdp([v4]).replace("s=-", "s=192.168.1.2"),
    sdp([v4]).replace("c=IN IP4 0.0.0.0", "c=IN IP4 192.168.1.2"),
    sdp([v4]).replace(
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    ),
    sdp([v4]) + "a=unknown:203.0.113.5\r\n",
    sdp(Array(33).fill(v4)),
    "x".repeat(65537),
  ])
    bad(inspectRelaySdp(body), "CANDIDATE_REJECTED");
});

test("configuration template has relay-only transport and no STUN; no template or claimed stats grants construction/routing authority", () => {
  const input = {
    urls: ["turns:relay.invalid:5349?transport=tcp"],
    username: "ephemeral-user",
    credential: "fixture-only-secret",
    expiresAtMs: 2000,
  };
  const template = good(relayConfigurationTemplate(input, 1000));
  assert.equal(template.configuration.iceTransportPolicy, "relay");
  assert.equal(template.constructionAllowed, false);
  assert.equal(template.routeVerified, false);
  for (const changed of [
    { urls: ["stun:stun.invalid:3478"] },
    { urls: ["turns:user:pass@relay.invalid"] },
    { urls: ["https://relay.invalid"] },
    { expiresAtMs: 1000 },
  ])
    bad(relayConfigurationTemplate({ ...input, ...changed }, 1000));
  assert.equal(
    good(rtcAvailability({ policy: "disabled", strictPrivate: false })).reason,
    "disabled",
  );
  assert.equal(
    good(rtcAvailability({ policy: "relay-only", strictPrivate: false }))
      .reason,
    "TURN_UNCONFIGURED",
  );
  assert.equal(
    good(rtcAvailability({ policy: "relay-only", strictPrivate: true })).reason,
    "ROUTING_UNSUPPORTED",
  );
  assert.equal(
    good(rtcAvailability({ policy: "direct-consented", strictPrivate: false }))
      .constructionAllowed,
    false,
  );
  assert.equal(good(assessSelectedPair(null)).visibility, "unknown");
  assert.equal(
    good(assessSelectedPair({ local: "relay", remote: "relay" })).visibility,
    "relay-observed",
  );
  assert.equal(
    good(assessSelectedPair({ local: "host", remote: "relay" })).mustClose,
    true,
  );
});
test("configuration snapshot cannot gain STUN by mutation and duplicate SDP identity fields are rejected", () => {
  const t = good(
    relayConfigurationTemplate(
      {
        urls: ["turns:relay.invalid:5349?transport=tcp"],
        username: "ephemeral-user",
        credential: "fixture-only-secret",
        expiresAtMs: 2000,
      },
      1000,
    ),
  );
  assert.throws(() =>
    t.configuration.iceServers[0].urls.push("stun:invalid:3478"),
  );
  bad(
    inspectRelaySdp(sdp([v4]) + "a=ice-ufrag:other\r\n"),
    "CANDIDATE_REJECTED",
  );
});
