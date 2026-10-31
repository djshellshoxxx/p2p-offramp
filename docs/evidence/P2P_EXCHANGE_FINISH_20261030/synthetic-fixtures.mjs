// Fixed synthetic fixture modules. No signatures, encryption, registry or funding assurance.
let sequence = 0;
export const KIND_PRIVATE_DIRECT_MESSAGE = 14, MAX_RUMOR_JSON_BYTES = 65536;
export const reviewed = { orderId: 'c'.repeat(64), buyer: `0x${'1'.repeat(40)}`, amountBaseUnits: '10', acceptBeforeSeconds: '150', revision: '1' };
export const reviewTermsBytes = async () => ({ ok: true, value: reviewed });
export const createUnsignedEvent = (pubkey, fields) => ({ ...fields, pubkey, id: (++sequence).toString(16).padStart(64, '0') });
export const createSeal = async rumor => rumor;
export const createGiftWrap = async rumor => ({ id: rumor.id, rumor });
export const unwrapGiftWrap = async wrap => wrap;
export const parseEventJson = text => JSON.parse(text);
