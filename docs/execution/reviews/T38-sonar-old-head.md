Sonar remains **failed** for remote PR 26 head `76c45df0b2f39a928d92ae0af3d60f37737802c5`. [Check 125380490608](https://github.com/djshellshoxxx/p2p-offramp/runs/125380490608) completed **2026-11-02 15:51:19 UTC**; the bot comment at 15:51:22 reports **D Security / D Reliability**, requiring A/A. This is not a scanner result for local `32c3449` or current `635efc8`.

All **50 published GitHub annotations** are retained and individually triaged: **19 failure / 31 warning**, across 22 source files. The JSON contains each actual issue key, title, path/line, GitHub level, public evidence link, source SHA and disposition. Twenty-one files are unchanged between fixed 76c and 32c; the formal runner changed and its exact matching line mappings are retained. The refreshed current capture at `635efc88fa54a355ee3378af25ad04c5e4c4a55f` shows all 22 affected files equal their 32c bytes. Later root repairs, if any, require their own hash/rescan binding.

| Observed family | Count | Disposition / smallest proposed action |
|---|---:|---|
| CLI path traversal / command injection |7|Explicit trusted local binary/output capabilities; no imported message-to-command/write flow established. No shell. Staging already checks canonical parent, absent destination and allowlisted sources/assets. Keep this boundary; do not invent a sanitizer that authenticates a selected executable. |
| PATH lookup |3|Trusted local tool environment assumption. Prefer an existing reviewed absolute binary resolver where available; preserve managed proxy/CA/TLS. |
| Top-level assertions |20|Real fail-closed isolation/provenance/signature guards precede SDK imports. If moved, place the complete preflight **and subsequent dynamic import** in an awaited hook/case. Preserve every control. |
| String sorting |10|Actual inputs are keys/IDs/geohashes/paths, not numeric arrays. Use an explicit locale-independent lexical comparator. `localeCompare` can alter canonical/reproducible bytes. |
| NaN / parseInt spelling |5|Use Number.NaN/Number.parseInt without changing inputs, radix or unknown-time behavior. |
| Promise inside try |1|Explicit async rejection handler already maps fixed UNAVAILABLE. A catch form may clarify it; never use an async Promise executor. |
| Regex backtracking |2|Low/P3 bounded local performance-hardening candidates. Preserve formal source/count/closure limits and docs 64 KiB/128-link/240-target limits; use linear extraction and explicit oversized rejection. No timing or exploit probe. |
| Allegedly assertion-free stealth test |1|Meaningful val/fail assertions exist. Inline a complete genuine group only if needed for analyzer visibility; retain redaction/negative controls. |
| Allegedly test-free distribution browser file |1|Actual native browser assertions/cleanup exist. A named node:test case can declare the existing journey without placeholders or deletion. |

**Access limitation:** GitHub shows actual issue keys, rule titles and failure/warning annotation levels, but not Sonar rule keys or instance severities. The Sonar issues GET received managed-proxy CONNECT 403. The GitHub plugin rejects its annotation endpoint, so normal public check HTML/XHR pagination supplied all 50 records. Missing rule-key/severity fields remain null; no value was inferred from D ratings or GitHub levels. Full underlying Sonar issue coverage is unverified. All denied/HTML/pagination evidence is retained.

No P0/P1/P2 defect was established in this static triage; this does not resolve hosted issues or make the gate green. No source, test, gate setting, waiver, commit or remote message changed, and no functional/native/SDK/solver/probe run occurred. Root owns source repairs and the final exact-head scanner refresh.
