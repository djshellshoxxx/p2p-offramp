/** Accepted optional reference packages stay outside every core application build (D7). */
export const OPTIONAL_PACKAGE_NAMES = Object.freeze([
  'proof-inputs', 'liquidity', 'courier', 'arbitration', 'privacy-policy',
  'privacy-controls', 'stealth', 'proof-jobs', 'meetup',
]);

// Both callers supply normalized, repository-relative POSIX paths. Match a complete
// package name at any depth so a nested copy cannot acquire a core profile exception.
const optionalPackagePath = new RegExp(`(?:^|/)packages/(?:${OPTIONAL_PACKAGE_NAMES.join('|')})(?:/|$)`, 'i');
export function isOptionalPackagePath(path) { return optionalPackagePath.test(path); }
