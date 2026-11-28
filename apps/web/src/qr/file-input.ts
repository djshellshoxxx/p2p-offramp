import { arrayBufferBytes, refuse } from './protocol.ts';
export interface QrFile { readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }
let physicalOwner: object | null = null;
/** One physical local QR read/hash job across remounts. Abort cannot release a native promise before it settles. */
export async function withQrFile<T>(file: QrFile, maximum: number, signal: AbortSignal, consume: (bytes: Uint8Array<ArrayBuffer>) => Promise<T>): Promise<T> {
  if (physicalOwner !== null) refuse('BUSY');
  const owner = {}; physicalOwner = owner;
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  const wipe = () => { try { if (bytes) Reflect.apply(Uint8Array.prototype.fill, bytes, [0]); } catch { /* Detached buffer. */ } };
  const active = () => { if (signal.aborted) refuse('CANCELLED'); };
  try {
    active(); signal.addEventListener('abort', wipe, { once: true });
    const size = file.size; active();
    if (!Number.isSafeInteger(size) || size < 1) refuse('INVALID_INPUT');
    if (size > maximum) refuse('FILE_TOO_LARGE');
    const read = file.arrayBuffer; active();
    if (typeof read !== 'function') refuse('INVALID_INPUT');
    const buffer = await Reflect.apply(read, file, []) as ArrayBuffer;
    const length = arrayBufferBytes(buffer);
    bytes = new Uint8Array(buffer);
    active();
    if (length > maximum) refuse('FILE_TOO_LARGE');
    if (length !== size) refuse('INVALID_INPUT');
    const result = await consume(bytes); active(); return result;
  } finally {
    wipe(); signal.removeEventListener('abort', wipe);
    if (physicalOwner === owner) physicalOwner = null;
  }
}
