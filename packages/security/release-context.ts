/** Read-only live release context. This narrow entry keeps signature verification
 * and its internal proof writer out of consumers that only recheck a lease. */
export { revalidateRelease } from './src/release-proof.ts';
