/** Fixture-only failed acknowledgment. The caller has observed the marker and withheld forwarding. */
export function rejectWithheldSolanaSend(response, headers) {
  // An empty reset on a reused connection permits browser transport replay before application code
  // sees the failure. Complete this HTTP failure instead: the application still has no successful
  // transaction acknowledgment, while this fixture can assert one physical send without inducing
  // that separate transport behavior. This is not a raw-reset or general retransmission guarantee.
  const body = 'Acknowledgment unavailable.';
  response.writeHead(503, { ...headers, 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store' }).end(body);
}
