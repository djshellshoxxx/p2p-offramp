/**
 * Explicit per-(ad, counterparty) negotiation state machine. States are communication states only:
 * `accepted` means the buyer sent an acceptance of reviewed terms, NOT that anything is funded or owed.
 * Chain observation (G08 authority) remains the only source of funding and settlement.
 */
import type { MessageType } from './messages.ts';

export type SessionState = 'taken' | 'offered' | 'accepted' | 'rejected' | 'cancelled';
export type Role = 'seller' | 'buyer';
export const TERMINAL_STATES: readonly SessionState[] = Object.freeze(['accepted', 'rejected', 'cancelled'] as const);
export const isTerminal = (state: SessionState): boolean => TERMINAL_STATES.includes(state);

/** Next state for a message of `type` sent by `sender` in `state` (null state = no session yet), or null if not allowed. */
export function transition(state: SessionState | null, type: MessageType, sender: Role): SessionState | null {
  if (state === null) return type === 'take-request' && sender === 'buyer' ? 'taken' : null;
  switch (type) {
    case 'terms-offer': return state === 'taken' && sender === 'seller' ? 'offered' : null;
    case 'terms-accept': return state === 'offered' && sender === 'buyer' ? 'accepted' : null;
    case 'terms-reject': return state === 'offered' && sender === 'buyer' ? 'rejected' : null;
    case 'cancel': return state === 'taken' || state === 'offered' ? 'cancelled' : null;
    case 'take-request': return null;
  }
}
