/** Dedicated scriptless policy. A generated host recipe is not deployment evidence. */
export const PORTAL_META_CSP = "default-src 'none'; script-src 'none'; style-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
export const PORTAL_HEADERS = Object.freeze({
  'Content-Security-Policy': PORTAL_META_CSP + "; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});
export const PORTAL_HEADER_RECIPE = '/*\n' + Object.entries(PORTAL_HEADERS).map(([name,value]) => `  ${name}: ${value}`).join('\n') + '\n';
