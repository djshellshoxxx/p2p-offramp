import { MAX_CANDIDATE_TEXT_CHARS, fixedFailure, QR_OK, refuse, type QrAppResult } from './protocol.ts';
let clipboardOwner: object | null = null;
/** The caller supplies only a current confirmed public code; physical clipboard admission survives UI cancellation. */
export async function copyPublicQrText(text: string): Promise<QrAppResult> {
  if (clipboardOwner !== null) return { ok: false, code: 'BUSY' };
  const owner = {}; clipboardOwner = owner;
  try {
    if (typeof text !== 'string' || text.length > MAX_CANDIDATE_TEXT_CHARS || !text.startsWith('P2POFFRAMP:1:')) refuse('INVALID_INPUT');
    if (typeof navigator.clipboard?.writeText !== 'function') refuse('UNAVAILABLE');
    await navigator.clipboard.writeText(text); return QR_OK;
  } catch (error) { return fixedFailure(error); }
  finally { if (clipboardOwner === owner) clipboardOwner = null; }
}
export function downloadPublicQrText(text: string): void {
  if (typeof text !== 'string' || text.length > MAX_CANDIDATE_TEXT_CHARS || !text.startsWith('P2POFFRAMP:1:')) refuse('INVALID_INPUT');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'p2p-offramp-public-qr.txt';
  try { document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
