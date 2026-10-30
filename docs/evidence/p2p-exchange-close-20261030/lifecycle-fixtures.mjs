// Fixed synthetic outputs; no signature, encryption, registry or funding assurance.
export const KIND_PRIVATE_DIRECT_MESSAGE = 14;
export const MAX_RUMOR_JSON_BYTES = 65536;
export const reviewTermsBytes = async () => { throw new Error('unused review fixture'); };
export const createUnsignedEvent = (pubkey, fields) => ({ ...fields, pubkey, id: 'd'.repeat(64) });
export const createSeal = async rumor => rumor;
export const createGiftWrap = async rumor => ({ id: rumor.id, rumor });
export const unwrapGiftWrap = async () => ({ rumor: { kind: 14, pubkey: 'a'.repeat(64), id: 'e'.repeat(64) } });
export const parseEventJson = text => JSON.parse(text);
