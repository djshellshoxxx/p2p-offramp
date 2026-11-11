/** The composition root supplies its own import.meta.url, never a document or route URL.
 * An address identifies this hosting location; it does not authenticate the host or release. */
export function deriveGenericAppLink(entryModuleUrl: unknown): string | null {
  if (typeof entryModuleUrl !== 'string' || entryModuleUrl.length > 4096 || /[\u0000-\u0020\u007f\\?#]/.test(entryModuleUrl)) return null;
  try {
    const entry = new URL(entryModuleUrl);
    // Browser module URLs are already canonical. Reject normalization that could hide traversal,
    // userinfo, shorthand loopback addresses, whitespace or a different original spelling.
    if (entry.href !== entryModuleUrl || entry.username || entry.password ||
        !(entry.protocol === 'https:' || (entry.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(entry.hostname)))) return null;
    const segments = entry.pathname.slice(1).split('/');
    for (const segment of segments) {
      const decoded = decodeURIComponent(segment);
      // Disallow encoded delimiters and another decoding layer as well as actual dot segments.
      if (!segment || decoded === '.' || decoded === '..' || /[\u0000-\u001f\u007f-\u009f/\\%?#]/.test(decoded)) return null;
    }
    const main = /^(.*\/)(?:assets\/index-[A-Za-z0-9_-]+\.js|src\/main\.tsx)$/.exec(entry.pathname);
    return main ? entry.origin + main[1] : null;
  } catch { return null; }
}
