/** Exact bounded Announcer ABI decoding, not emitter authentication, transfer evidence or a selected network profile. */
import { address, array, bareHex, bytesOf, data, diagnostic, hash, hexOf, result, stop, type DiagnosticOnly, type StealthResult } from './shared.ts';
import { contextOf, profileOf, type LocalProfileId, type OfflineContext } from './profiles.ts';
import { compressedPoint } from './math.ts';
export const ANNOUNCEMENT_TOPIC0 = '0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7';
export const MAX_ABI_DATA_BYTES = 448, MAX_METADATA_BYTES = 256;
export interface RawAnnouncementLog { readonly address: string; readonly topics: readonly string[]; readonly data: string; }
export interface Announcement extends DiagnosticOnly {
  readonly profileId: LocalProfileId; readonly context: OfflineContext; readonly schemeId: 1; readonly stealthAddress: string;
  readonly ephemeralPublicKeyHex: string; readonly metadataHex: string;
}
export interface DecodedAnnouncement extends Announcement { readonly announcer: string; readonly caller: string; }
export function metadataOf(input: unknown): Readonly<{ metadataHex: string; viewTagHex: string; opaqueSuffixHex: string }> {
  const metadataHex = bareHex(input, 1, MAX_METADATA_BYTES); return Object.freeze({ metadataHex, viewTagHex: metadataHex.slice(0, 2), opaqueSuffixHex: metadataHex.slice(2) });
}
export const parseMetadataHex = (input: unknown) => result(() => diagnostic(metadataOf(input)));
function topicAddress(topic: string): string { if (!/^0x0{24}/.test(topic)) return stop(); return address('0x' + topic.slice(-40)); }
export function decodeLog(profileId: LocalProfileId, context: OfflineContext, expectedAnnouncer: string, input: unknown): DecodedAnnouncement {
  const raw = data(input, ['address', 'topics', 'data']), announcer = address(raw.address);
  if (announcer !== address(expectedAnnouncer)) return stop('INTEGRITY_FAILURE');
  const topics = array(raw.topics, 4).map(hash); if (topics.length !== 4 || topics[0] !== ANNOUNCEMENT_TOPIC0) return stop();
  if (BigInt(topics[1]!) !== 1n) return stop('UNSUPPORTED_SCHEME');
  const stealthAddress = topicAddress(topics[2]!), caller = topicAddress(topics[3]!);
  if (typeof raw.data !== 'string' || !raw.data.startsWith('0x')) return stop();
  const encoded = bareHex(raw.data.slice(2), 224, MAX_ABI_DATA_BYTES), bytes = bytesOf(encoded);
  const word = (offset: number): bigint => BigInt('0x' + hexOf(bytes.subarray(offset, offset + 32)));
  try {
    if (word(0) !== 64n || word(32) !== 160n || word(64) !== 33n) return stop();
    const metadataLength = word(160); if (metadataLength < 1n || metadataLength > 256n) return stop();
    const count = Number(metadataLength), expectedLength = 192 + Math.ceil(count / 32) * 32;
    if (bytes.byteLength !== expectedLength || bytes.subarray(129, 160).some(byte => byte !== 0) || bytes.subarray(192 + count).some(byte => byte !== 0)) return stop();
    const ephemeralPublicKeyHex = hexOf(bytes.subarray(96, 129)), metadataHex = hexOf(bytes.subarray(192, 192 + count));
    compressedPoint(ephemeralPublicKeyHex); metadataOf(metadataHex);
    return diagnostic({ profileId, context, schemeId: 1 as const, stealthAddress, ephemeralPublicKeyHex, metadataHex, announcer, caller });
  } finally { bytes.fill(0); }
}
export function decodeAnnouncement(input: unknown): StealthResult<DecodedAnnouncement> {
  return result(() => {
    const raw = data(input, ['profileId', 'context', 'expectedAnnouncer', 'log']);
    return decodeLog(profileOf(raw.profileId), contextOf(raw.context), address(raw.expectedAnnouncer), raw.log);
  });
}
