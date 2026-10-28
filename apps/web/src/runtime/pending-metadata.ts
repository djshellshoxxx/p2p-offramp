/** Internal pure projection of an already-validated RuntimeCommand into frozen, primitive-only pending metadata.
 * Not a boundary parser and not an authorization constructor. No secrets, bytes, config or request ids are copied.
 * Retained closures, caller Strings, transport copies and physical erasure are outside this guarantee.
 */
import type { RuntimeCommand, RuntimeOperation } from '../../../../packages/schemas/index.ts';

/** Operations whose reply must belong to the profile named in the command. */
export type ProfileBoundOperation = 'unlock' | 'exportEncrypted' | 'saveTermsReview' | 'listTermsReviews' | 'deleteTermsReview';
export type PendingMetadata =
  | Readonly<{ operation: ProfileBoundOperation; generation: number; profileId: string }>
  | Readonly<{ operation: Exclude<RuntimeOperation, ProfileBoundOperation>; generation: number }>;

export function capturePendingMetadata(command: RuntimeCommand): PendingMetadata {
  switch (command.operation) {
    case 'unlock': return Object.freeze({ operation: 'unlock', generation: command.generation, profileId: command.profileId });
    case 'exportEncrypted': case 'saveTermsReview': case 'listTermsReviews': case 'deleteTermsReview':
      return Object.freeze({ operation: command.operation, generation: command.generation, profileId: command.profileId });
    case 'init': case 'create': case 'restore': case 'status': case 'listProfiles': case 'lock': case 'dispose': case 'activity':
      return Object.freeze({ operation: command.operation, generation: command.generation });
    default: { const unhandled: never = command; return unhandled; }
  }
}
