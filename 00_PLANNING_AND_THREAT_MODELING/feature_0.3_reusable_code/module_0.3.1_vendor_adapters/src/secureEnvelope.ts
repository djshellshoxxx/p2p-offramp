/** Project-owned adapter; no copied upstream implementation. Integration pending. */
export const MAX_PLAINTEXT_BYTES = 3500;
export const ENVELOPE_BYTES = 4096;
export type SealedEnvelope = { version: 1; tradeId: string; payload: Uint8Array };
export function validateEnvelope(input: SealedEnvelope): void {
  if (input.version !== 1 || !/^[a-zA-Z0-9_-]{16,128}$/.test(input.tradeId)) throw new Error("invalid envelope context");
  if (!(input.payload instanceof Uint8Array) || input.payload.length > MAX_PLAINTEXT_BYTES) throw new Error("invalid envelope size");
}
/** IMPORTANT: validation is not encryption; wire padding must occur after authenticated encryption. */
