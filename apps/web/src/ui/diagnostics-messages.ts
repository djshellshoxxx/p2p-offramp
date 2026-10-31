/** English source copy; no incident/support-channel or release-approval claim. */
export const diagnosticsMessages = {
  title: 'Local diagnostics',
  help: 'Review a limited local record of typed errors. Nothing is uploaded automatically.',
  privacy: 'Events exclude wallet and trade identifiers, addresses, amounts, endpoint details, private content, keys, exact timestamps and raw error messages. The remaining combination may still identify a pattern of use.',
  unconfigured: 'Collection unavailable: this unsigned development shell has no authenticated release context. No events are collected, and diagnostic data from an unavailable release context is discarded. Clearing remains available without unlocking the vault.',
  retention: 'At most 500 events or 1 MiB are retained for seven days. Events from unsupported or unauthenticated release contexts are discarded. This is not a durable audit record.',
  refresh: 'Refresh diagnostics', clear: 'Clear local diagnostics', cleared: 'Local diagnostics cleared. No vault passphrase was needed.', empty: 'No local diagnostic events are available.',
  select: 'Select the events to include', event: (index: number) => `Event ${index}`,
  preview: 'Preview selected diagnostic export', previewTitle: 'Diagnostic export preview',
  sharing: 'These are the final fields and bytes. Download only if you are comfortable sharing this combination. Sharing the file is a separate action outside this app. Support never needs your seed, private key or passphrase.',
  exactBytes: 'Exact export text (UTF-8 JSON)', byteCount: (bytes: number) => `${bytes} UTF-8 bytes; no events are included unless you selected them.`,
  download: 'Download the previewed diagnostics', downloaded: 'The previewed file was prepared for your browser. Nothing was uploaded.',
  errors: { RELEASE_UNAVAILABLE: 'The authenticated release context is unavailable or expired. Collection and export are blocked; clearing remains available.',
    STORAGE_UNAVAILABLE: 'Local diagnostic storage is unavailable. No successful clear or export is confirmed.',
    REDACTION_FAILED: 'This diagnostic selection could not be exported safely. Refresh the list and select the events again.', REPORT_TOO_LARGE: 'The diagnostic selection is too large. Select fewer events.' },
  warnings: { DISCARDED_INVALID: 'Invalid or unsupported diagnostic entries were discarded.', DISCARDED_EXPIRED: 'Expired or future-dated diagnostic entries were discarded.', CAP_REACHED: 'The local event limit was reached; older entries may have been discarded.' },
} as const;
