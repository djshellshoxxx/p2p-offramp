# Local redacted diagnostics

G26's local ring accepts only fixed module/error/operation/route/chain enums.
It does not accept a raw error, stack, URL, wallet/trade reference or arbitrary
extra field. Hour-coarse UTC time and release/storage metadata are constructed
inside the service. No network or automatic upload capability exists.

Collection requires a genuine live G15 verification result and a storage schema
inside that manifest's range. JSON projections/clones, expired/revoked leases and
the ordinary unsigned app cannot configure it. Unavailable release contexts
discard the disposable diagnostic ring, without reading or changing vault data.
The default Settings page explains that collection is unavailable. A separate
explicit synthetic signed fixture exercises the full UI; it is not an approved
release or professional review.

The ring caps at 500 events/1 MiB and prunes at seven days on access. Malformed,
future, foreign-release and expired rows are discarded. This is best-effort local
storage, not a durable or multi-tab audit log. Clock rollback cannot extend age
within a service lifetime. Clearing works without a proof, clock or vault session.

`collectDiagnostics()` issues a frozen snapshot. `previewExport(snapshot,indexes)`
requires an explicit nonempty unique selection and shows exactly those final
UTF-8 JSON bytes and field rows. `confirmExport(preview)` rechecks the live proof,
unchanged ring, clear generation and unchanged preview bytes before returning a
download copy. Refresh, selection changes or unmount drop the UI preview. Sharing
the downloaded file is a separate user action; combinations of allowlisted data
may still identify usage patterns. No complete-redaction claim is made.
